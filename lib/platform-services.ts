import { spawn } from 'node:child_process';
import type {
  PlatformContainerProbe,
  PlatformServiceProbe,
  PlatformServicesSnapshot,
} from './platform-service-shared';

const DEFAULT_SSH_DIR = process.env.HOME ? `${process.env.HOME}/.ssh` : '/home/nextjs/.ssh';
const PLATFORM_SSH_TARGET = process.env.PLATFORM_SERVICES_SSH_TARGET
  || process.env.INFRA_METRICS_SSH_TARGET
  || process.env.SHUTDOWN_DIAGNOSTIC_SSH_TARGET
  || 'deploy@100.84.14.93';
const PLATFORM_SSH_KEY_PATH = process.env.PLATFORM_SERVICES_SSH_KEY_PATH
  || process.env.INFRA_METRICS_SSH_KEY_PATH
  || `${DEFAULT_SSH_DIR}/id_ed25519`;
const PLATFORM_SSH_KNOWN_HOSTS_PATH = process.env.PLATFORM_SERVICES_SSH_KNOWN_HOSTS_PATH
  || process.env.INFRA_METRICS_SSH_KNOWN_HOSTS_PATH
  || `${DEFAULT_SSH_DIR}/known_hosts`;

type RemotePlatformServicesSnapshot = {
  checkedAt?: string;
  catalog?: Record<string, Partial<PlatformServiceProbe>>;
  n8n?: Partial<PlatformServicesSnapshot['n8n']>;
  litellm?: Partial<PlatformServiceProbe>;
  langfuse?: Partial<PlatformServiceProbe>;
  clickhouse?: Partial<PlatformServiceProbe>;
  redis?: Partial<PlatformServicesSnapshot['redis']>;
};

function runRemoteScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ssh',
      [
        '-i',
        PLATFORM_SSH_KEY_PATH,
        '-o',
        `UserKnownHostsFile=${PLATFORM_SSH_KNOWN_HOSTS_PATH}`,
        '-o',
        'StrictHostKeyChecking=yes',
        PLATFORM_SSH_TARGET,
        'bash',
        '-s',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `ssh exited with code ${code}`));
    });

    child.stdin.end(script);
  });
}

function buildRemoteScript() {
  return String.raw`
set -euo pipefail

python3 - <<'PY'
import json
import re
import subprocess
from datetime import datetime, timezone


def run(cmd: str):
    completed = subprocess.run(cmd, shell=True, text=True, capture_output=True)
    return completed.returncode, completed.stdout.strip(), completed.stderr.strip()


def detect_runtime_source(labels):
    if not isinstance(labels, dict):
        return 'unknown'
    if any(str(key).startswith('coolify.') for key in labels.keys()):
        return 'coolify'
    if labels.get('com.docker.compose.project'):
        return 'docker-compose'
    return 'standalone'


def inspect_container(name: str):
    rc, out, _err = run(f"docker inspect {json.dumps(name)} --format '{{{{json .}}}}' 2>/dev/null")
    if rc != 0 or not out:
        return None

    try:
        payload = json.loads(out)
    except json.JSONDecodeError:
        return None

    labels = payload.get('Config', {}).get('Labels') or {}
    state = payload.get('State') or {}
    networks = sorted((payload.get('NetworkSettings', {}).get('Networks') or {}).keys())
    return {
        'name': name,
        'image': payload.get('Config', {}).get('Image'),
        'status': state.get('Status'),
        'health': (state.get('Health') or {}).get('Status'),
        'runtimeSource': detect_runtime_source(labels),
        'composeProject': labels.get('com.docker.compose.project'),
        'composeService': labels.get('com.docker.compose.service'),
        'networks': networks,
        'env': payload.get('Config', {}).get('Env') or [],
    }


def list_container_names():
    rc, out, _err = run("docker ps -a --format '{{.Names}}'")
    if rc != 0 or not out:
        return []
    return [line.strip() for line in out.splitlines() if line.strip()]


def find_containers(patterns):
    names = list_container_names()
    matched = []
    for name in names:
        if any(re.search(pattern, name, re.IGNORECASE) for pattern in patterns):
            inspected = inspect_container(name)
            if inspected:
                matched.append(inspected)
    matched.sort(key=lambda item: item['name'])
    return matched


def env_map(container):
    env = {}
    for entry in container.get('env', []) or []:
        if '=' not in entry:
            continue
        key, value = entry.split('=', 1)
        env[key] = value
    return env


def host_header_code(host: str, path: str = '/'):
    rc, out, _err = run(
        f"curl -s -o /dev/null -w '%{{http_code}}' -H 'Host: {host}' http://127.0.0.1{path} || true"
    )
    code = (out or '').strip()
    if not code.isdigit():
        return None
    return int(code)


def build_public_url(protocol: str, host: str, port: str):
    protocol = (protocol or 'https').strip() or 'https'
    host = (host or '').strip()
    port = (port or '').strip()
    if not host:
        return None
    default_port = (protocol == 'https' and port in ('', '443')) or (protocol == 'http' and port in ('', '80'))
    return f"{protocol}://{host}" if default_port else f"{protocol}://{host}:{port}"


def strip_env(container):
    if not container:
        return None
    cleaned = dict(container)
    cleaned.pop('env', None)
    return cleaned


  def build_probe(patterns, public_url=None, host=None, path='/', internal_url=None, notes=None, force_found=False):
    containers = find_containers(patterns)
    public_origin = host_header_code(host, path) if host else None
    primary = containers[0] if containers else None
    found = bool(containers) or force_found or (public_origin is not None and public_origin not in (404, 421))
    return {
      'found': found,
      'containers': [strip_env(container) for container in containers],
      'publicUrl': public_url,
      'publicOriginCode': public_origin,
      'internalUrl': internal_url if (containers or force_found) else None,
      'notes': notes or [],
    }


n8n_containers = find_containers([r'n8n', r'^news-flow$'])
n8n_primary = n8n_containers[0] if n8n_containers else None
n8n_env = env_map(n8n_primary) if n8n_primary else {}
n8n_public = (
    n8n_env.get('N8N_EDITOR_BASE_URL')
    or n8n_env.get('WEBHOOK_URL')
    or build_public_url(n8n_env.get('N8N_PROTOCOL', 'https'), n8n_env.get('N8N_HOST', ''), n8n_env.get('N8N_PORT', ''))
)
n8n_host = None
if n8n_public:
    n8n_host = re.sub(r'^https?://', '', n8n_public).split('/')[0]
    n8n_host = n8n_host.split(':')[0]

litellm_containers = find_containers([r'litellm', r'lite-llm', r'llm-proxy', r'model-router'])
langfuse_containers = find_containers([r'langfuse'])
clickhouse_containers = find_containers([r'clickhouse'])
redis_containers = find_containers([r'(^|[-_])redis($|[-_])', r'(^|[-_])valkey($|[-_])'])

catalog = {
  'authentik': build_probe(
    [r'authentik'],
    'https://sso.getouch.co',
    'sso.getouch.co',
    '/',
    'http://authentik-server:9000',
    ['SSO / identity provider.', 'Database target: authentik.', 'Requires PostgreSQL and Redis / Valkey.'],
  ),
  'qdrant': build_probe(
    [r'qdrant'],
    'https://qdrant.getouch.co',
    'qdrant.getouch.co',
    '/',
    'http://qdrant:6333',
    ['Vector database for tenant-aware RAG and memory retrieval.', 'Do not expose Qdrant without API auth.'],
  ),
  'airbyte': build_probe(
    [r'airbyte'],
    'https://airbyte.getouch.co',
    'airbyte.getouch.co',
    '/',
    'http://airbyte-server:8000',
    ['Data ingestion / ELT runtime.', 'Database target: airbyte.'],
  ),
  'infisical': build_probe(
    [r'infisical'],
    'https://infisical.getouch.co',
    'infisical.getouch.co',
    '/',
    'http://infisical:8080',
    ['Internal secrets vault.', 'Database target: infisical.', 'Initial admin setup must be secured before public use.'],
  ),
  'coolify': build_probe(
    [r'^coolify$'],
    'https://coolify.getouch.co',
    'coolify.getouch.co',
    '/',
    'http://coolify:8000',
    ['Deployment control plane protected by Cloudflare Access.'],
  ),
  'grafana': build_probe(
    [r'^grafana$'],
    'https://grafana.getouch.co',
    'grafana.getouch.co',
    '/',
    'http://grafana:3000',
    ['Observability dashboards. Login redirect is expected.'],
  ),
  'open-webui': build_probe(
    [r'open-webui'],
    'https://ai.getouch.co',
    'ai.getouch.co',
    '/',
    'http://open-webui:8080',
    ['Operator and end-user AI workspace.'],
  ),
  'dify': build_probe(
    [r'^docker-web-1$', r'^docker-api-1$', r'dify-web', r'dify-api'],
    'https://dify.getouch.co/apps',
    'dify.getouch.co',
    '/',
    'http://docker-web-1:3000',
    ['AI workflow and application builder runtime.'],
  ),
  'mcp': build_probe(
    [],
    'https://mcp.getouch.co',
    'mcp.getouch.co',
    '/',
    'http://getouch-coolify-app:3000/api/mcp',
    ['Portal-backed MCP endpoint served by the Coolify portal application.'],
    True,
  ),
  'vllm': build_probe(
    [r'vllm'],
    'https://vllm.getouch.co/v1',
    'vllm.getouch.co',
    '/ready',
    'http://vllm:8000/v1',
    ['Inference gateway route currently returns 503 at origin.'],
  ),
  'evolution': build_probe(
    [r'evolution-api'],
    'https://evo.getouch.co',
    'evo.getouch.co',
    '/',
    'http://evolution-api:8080',
    ['Evolution API WhatsApp gateway.'],
  ),
  'baileys': build_probe(
    [r'baileys-gateway'],
    'https://wa.getouch.co',
    'wa.getouch.co',
    '/',
    'http://baileys-gateway:3001',
    ['Baileys multi-device gateway.', 'Root path may return 404 while API endpoints remain healthy.'],
  ),
  'chatwoot': build_probe(
    [r'chatwoot-web', r'chatwoot-sidekiq'],
    'https://chatwoot.getouch.co',
    'chatwoot.getouch.co',
    '/',
    'http://chatwoot-web:3000',
    ['Customer communication workspace.'],
  ),
  'voice': build_probe(
    [r'voice-fusionpbx', r'fusionpbx'],
    None,
    None,
    '/',
    'http://voice-fusionpbx:8080',
    ['FusionPBX / voice runtime.'],
  ),
  'object-storage': build_probe(
    [r'seaweed-master', r'seaweed-volume', r'seaweed-filer', r'seaweed-s3'],
    None,
    None,
    '/',
    'http://seaweed-s3:8333',
    ['S3-compatible object storage runtime backed by SeaweedFS.'],
  ),
}

payload = {
    'checkedAt': datetime.now(timezone.utc).isoformat(),
  'catalog': catalog,
    'n8n': {
        'found': bool(n8n_primary),
        'containers': [strip_env(container) for container in n8n_containers],
        'publicUrl': n8n_public,
        'publicOriginCode': host_header_code(n8n_host) if n8n_host else None,
        'internalUrl': f"http://{n8n_primary['name']}:5678" if n8n_primary else None,
        'notes': [note for note in [
            'Basic auth enabled' if n8n_env.get('N8N_BASIC_AUTH_ACTIVE', '').lower() == 'true' else None,
            'Workflow metrics awaiting API integration',
        ] if note],
        'basicAuthEnabled': n8n_env.get('N8N_BASIC_AUTH_ACTIVE', '').lower() == 'true',
        'webhookUrl': n8n_env.get('WEBHOOK_URL') or None,
    },
    'litellm': {
        'found': bool(litellm_containers),
        'containers': [strip_env(container) for container in litellm_containers],
      'publicUrl': 'https://litellm.getouch.co/v1',
      'publicOriginCode': host_header_code('litellm.getouch.co', '/health'),
        'internalUrl': 'http://litellm:4000/v1' if litellm_containers else None,
      'notes': ['Canonical LiteLLM endpoint reserved at litellm.getouch.co.', 'Database target: litellm.'],
    },
    'langfuse': {
        'found': bool(langfuse_containers),
        'containers': [strip_env(container) for container in langfuse_containers],
        'publicUrl': 'https://langfuse.getouch.co',
        'publicOriginCode': host_header_code('langfuse.getouch.co'),
        'internalUrl': 'http://langfuse-web:3000' if langfuse_containers else None,
        'notes': ['Observability UI planned for multi-tenant tracing.'],
    },
    'clickhouse': {
        'found': bool(clickhouse_containers),
        'containers': [strip_env(container) for container in clickhouse_containers],
        'publicUrl': 'https://clickhouse.getouch.co',
        'publicOriginCode': host_header_code('clickhouse.getouch.co'),
        'internalUrl': 'http://clickhouse:8123' if clickhouse_containers else None,
        'notes': ['Keep ClickHouse internal-only unless auth is explicitly confirmed.'],
    },
    'redis': {
        'found': bool(redis_containers),
        'primary': strip_env(next((container for container in redis_containers if container['name'] == 'coolify-redis'), redis_containers[0] if redis_containers else None)),
        'containers': [strip_env(container) for container in redis_containers],
        'publicOriginCode': None,
        'notes': [
            'Redis should remain internal-only.',
            'Multiple Redis sidecars detected across the platform.' if len(redis_containers) > 1 else 'Single Redis runtime detected.',
        ],
    },
}

print(json.dumps(payload))
PY
`;
}

function normalizeContainer(container: Partial<PlatformContainerProbe> | null | undefined): PlatformContainerProbe | null {
  if (!container || !container.name) return null;
  return {
    name: container.name,
    image: container.image ?? null,
    status: container.status ?? null,
    health: container.health ?? null,
    runtimeSource: container.runtimeSource ?? 'unknown',
    composeProject: container.composeProject ?? null,
    composeService: container.composeService ?? null,
    networks: Array.isArray(container.networks) ? container.networks.filter((item): item is string => typeof item === 'string') : [],
  };
}

function normalizeContainers(containers: unknown): PlatformContainerProbe[] {
  if (!Array.isArray(containers)) return [];
  return containers
    .map((container) => normalizeContainer(container as Partial<PlatformContainerProbe>))
    .filter((container): container is PlatformContainerProbe => Boolean(container));
}

function normalizeCode(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNotes(notes: unknown, fallback: string[] = []) {
  if (!Array.isArray(notes)) return fallback;
  const values = notes.filter((note): note is string => typeof note === 'string' && note.trim().length > 0);
  return values.length ? values : fallback;
}

function normalizeCatalog(catalog: unknown): Record<string, PlatformServiceProbe> {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(catalog).map(([key, value]) => [
      key,
      normalizeService(value as Partial<PlatformServiceProbe>, {}),
    ]),
  );
}

function normalizeService(service: Partial<PlatformServiceProbe> | null | undefined, fallback: Partial<PlatformServiceProbe> = {}): PlatformServiceProbe {
  return {
    found: Boolean(service?.found ?? fallback.found),
    containers: normalizeContainers(service?.containers ?? fallback.containers),
    publicUrl: service?.publicUrl ?? fallback.publicUrl ?? null,
    publicOriginCode: normalizeCode(service?.publicOriginCode ?? fallback.publicOriginCode),
    internalUrl: service?.internalUrl ?? fallback.internalUrl ?? null,
    notes: normalizeNotes(service?.notes, normalizeNotes(fallback.notes)),
  };
}

function emptySnapshot(error: string): PlatformServicesSnapshot {
  return {
    checkedAt: new Date().toISOString(),
    catalog: {},
    n8n: {
      found: false,
      containers: [],
      publicUrl: 'https://flow.news.getouch.co',
      publicOriginCode: null,
      internalUrl: null,
      notes: [error],
      basicAuthEnabled: false,
      webhookUrl: null,
    },
    litellm: {
      found: false,
      containers: [],
      publicUrl: 'https://litellm.getouch.co/v1',
      publicOriginCode: null,
      internalUrl: null,
      notes: [error],
    },
    langfuse: {
      found: false,
      containers: [],
      publicUrl: 'https://langfuse.getouch.co',
      publicOriginCode: null,
      internalUrl: null,
      notes: [error],
    },
    clickhouse: {
      found: false,
      containers: [],
      publicUrl: 'https://clickhouse.getouch.co',
      publicOriginCode: null,
      internalUrl: null,
      notes: [error],
    },
    redis: {
      found: false,
      primary: null,
      containers: [],
      publicOriginCode: null,
      notes: [error],
    },
  };
}

export async function getPlatformServicesSnapshot(): Promise<PlatformServicesSnapshot> {
  try {
    const raw = await runRemoteScript(buildRemoteScript());
    const parsed = JSON.parse(raw) as RemotePlatformServicesSnapshot;

    const n8n = normalizeService(parsed.n8n, {
      publicUrl: 'https://flow.news.getouch.co',
      notes: ['Workflow metrics awaiting API integration.'],
    });

    return {
      checkedAt: typeof parsed.checkedAt === 'string' ? parsed.checkedAt : new Date().toISOString(),
      catalog: normalizeCatalog(parsed.catalog),
      n8n: {
        ...n8n,
        basicAuthEnabled: Boolean(parsed.n8n?.basicAuthEnabled),
        webhookUrl: typeof parsed.n8n?.webhookUrl === 'string' ? parsed.n8n.webhookUrl : null,
      },
      litellm: normalizeService(parsed.litellm, {
        publicUrl: 'https://litellm.getouch.co/v1',
        notes: ['Canonical LiteLLM endpoint reserved at litellm.getouch.co.', 'Database target: litellm.'],
      }),
      langfuse: normalizeService(parsed.langfuse, {
        publicUrl: 'https://langfuse.getouch.co',
        notes: ['Observability UI planned for multi-tenant tracing.'],
      }),
      clickhouse: normalizeService(parsed.clickhouse, {
        publicUrl: 'https://clickhouse.getouch.co',
        notes: ['Keep ClickHouse internal-only unless auth is explicitly confirmed.'],
      }),
      redis: {
        found: Boolean(parsed.redis?.found),
        primary: normalizeContainer(parsed.redis?.primary),
        containers: normalizeContainers(parsed.redis?.containers),
        publicOriginCode: normalizeCode(parsed.redis?.publicOriginCode),
        notes: normalizeNotes(parsed.redis?.notes, ['Redis should remain internal-only.']),
      },
    };
  } catch (error) {
    return emptySnapshot(error instanceof Error ? error.message : 'Platform service probe failed.');
  }
}