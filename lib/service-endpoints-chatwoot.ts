import { spawn } from 'node:child_process';
import { count, desc, sql } from 'drizzle-orm';
import { db } from './db';
import { chatwootTenantMappings } from './schema';

const CHATWOOT_PUBLIC_URL = 'https://chatwoot.getouch.co';
const CHATWOOT_EXPECTED_DATABASE = 'chatwoot';
const DEFAULT_SSH_DIR = process.env.HOME ? `${process.env.HOME}/.ssh` : '/home/nextjs/.ssh';
const CHATWOOT_SSH_TARGET = process.env.AI_RUNTIME_SSH_TARGET
  || process.env.INFRA_METRICS_SSH_TARGET
  || process.env.SCHEDULED_RESTART_SSH_TARGET
  || 'deploy@100.84.14.93';
const CHATWOOT_SSH_KEY_PATH = process.env.AI_RUNTIME_SSH_KEY_PATH
  || process.env.INFRA_METRICS_SSH_KEY_PATH
  || `${DEFAULT_SSH_DIR}/id_ed25519`;
const CHATWOOT_SSH_KNOWN_HOSTS_PATH = process.env.AI_RUNTIME_SSH_KNOWN_HOSTS_PATH
  || process.env.INFRA_METRICS_SSH_KNOWN_HOSTS_PATH
  || `${DEFAULT_SSH_DIR}/known_hosts`;

export type ChatwootHealthProbe = {
  checkedAt: string;
  ok: boolean;
  statusCode: number | null;
  target: string;
  message: string;
};

export type ChatwootRuntimeState = {
  found: boolean;
  status: string;
  health: string | null;
  summary: string;
  startedAt: string | null;
};

export type ChatwootTenantMappingRow = {
  id: string;
  tenantId: string;
  chatwootAccountId: number;
  chatwootInboxId: number | null;
  status: string;
  assignedChannels: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatwootDashboardStatus = {
  checkedAt: string;
  summary: {
    statusLabel: string;
    statusTone: 'healthy' | 'warning';
    publicEndpoint: string;
    accountsCount: number | null;
    inboxesCount: number | null;
    conversationsCount: number | null;
    workerStatus: string;
    lastHealthCheck: string;
  };
  serviceInformation: {
    publicUrl: string;
    database: string | null;
    databaseStatus: string | null;
    redisStatus: string | null;
    workerStatus: string | null;
    version: string | null;
    deploymentMode: string | null;
    routeStatus: string | null;
    webStatus: string | null;
    storageStatus: string | null;
    directPortExposure: string | null;
    lastChecked: string;
  };
  quickActions: Array<{ label: string; href: string; external?: boolean }>;
  currentProbe: ChatwootHealthProbe;
  runtime: {
    web: ChatwootRuntimeState;
    worker: ChatwootRuntimeState;
    redis: ChatwootRuntimeState;
    routeConfigured: boolean;
    publicPortExposed: boolean;
    composeProject: string | null;
    logs: {
      web: string[];
      worker: string[];
      redis: string[];
    };
  };
  tenantMapping: {
    schemaReady: boolean;
    total: number;
    active: number;
    rows: ChatwootTenantMappingRow[];
    message: string;
  };
  usage: {
    usersCount: number | null;
    accountsCount: number | null;
    inboxesCount: number | null;
    conversationsCount: number | null;
  };
  notes: string[];
};

type RemoteChatwootState = {
  web: {
    found: boolean;
    status: string;
    health: string | null;
    startedAt: string | null;
    image: string | null;
    composeProject: string | null;
    env: {
      FRONTEND_URL?: string;
      DATABASE_URL?: string;
      ENABLE_ACCOUNT_SIGNUP?: string;
    };
    ports: string[];
    mounts: Array<{ destination: string | null; source: string | null; type: string | null }>;
  };
  worker: {
    found: boolean;
    status: string;
    health: string | null;
    startedAt: string | null;
    sidekiqProcess: string | null;
  };
  redis: {
    found: boolean;
    status: string;
    health: string | null;
    startedAt: string | null;
    ping: string | null;
  };
  routeConfigured: boolean;
  database: {
    name: string | null;
    publicTableCount: number | null;
    usersCount: number | null;
    accountsCount: number | null;
    inboxesCount: number | null;
    conversationsCount: number | null;
  };
  logs: {
    web: string[];
    worker: string[];
    redis: string[];
  };
  errors: string[];
};

type MappingSummary = ChatwootDashboardStatus['tenantMapping'];

function sanitizeLogLine(line: string) {
  return line
    .replace(/postgres:\/\/[^@\s]+@/gi, 'postgres://[redacted]@')
    .replace(/secret_key_base=\S+/gi, 'secret_key_base=[redacted]')
    .replace(/password=\S+/gi, 'password=[redacted]');
}

function summarizeContainer(state: { found: boolean; status: string; health: string | null }, label: string, extra?: string | null) {
  if (!state.found) return `${label} missing`;
  if (state.status !== 'running') return `${label} ${state.status}`;
  if (state.health === 'healthy') return extra ? `${label} running · ${extra}` : `${label} healthy`;
  if (state.health) return `${label} ${state.health}`;
  return extra ? `${label} running · ${extra}` : `${label} running`;
}

function formatDatabaseStatus(database: RemoteChatwootState['database']) {
  if (!database.name) return 'Database name unavailable from runtime';
  if (database.name === CHATWOOT_EXPECTED_DATABASE) {
    return `Using ${database.name} with ${database.publicTableCount ?? 0} public tables`;
  }

  return `Using ${database.name}; expected ${CHATWOOT_EXPECTED_DATABASE}`;
}

function deriveVersion(image: string | null | undefined) {
  if (!image) return null;
  const parts = image.split(':');
  return parts.length > 1 ? parts.at(-1) || null : image;
}

function createFallbackRemoteState(errorMessage: string): RemoteChatwootState {
  return {
    web: {
      found: false,
      status: 'missing',
      health: null,
      startedAt: null,
      image: null,
      composeProject: null,
      env: {},
      ports: [],
      mounts: [],
    },
    worker: {
      found: false,
      status: 'missing',
      health: null,
      startedAt: null,
      sidekiqProcess: null,
    },
    redis: {
      found: false,
      status: 'missing',
      health: null,
      startedAt: null,
      ping: null,
    },
    routeConfigured: false,
    database: {
      name: null,
      publicTableCount: null,
      usersCount: null,
      accountsCount: null,
      inboxesCount: null,
      conversationsCount: null,
    },
    logs: {
      web: [],
      worker: [],
      redis: [],
    },
    errors: [errorMessage],
  };
}

function runRemoteScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ssh',
      [
        '-i',
        CHATWOOT_SSH_KEY_PATH,
        '-o',
        `UserKnownHostsFile=${CHATWOOT_SSH_KNOWN_HOSTS_PATH}`,
        '-o',
        'StrictHostKeyChecking=yes',
        CHATWOOT_SSH_TARGET,
        'bash',
        '-s',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      },
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
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `ssh exited with code ${code}`));
    });

    child.stdin.end(script);
  });
}

async function getRemoteChatwootState(): Promise<RemoteChatwootState> {
  try {
    const output = await runRemoteScript(String.raw`
set -euo pipefail

python3 - <<'PY'
import json
import subprocess
from urllib.parse import urlparse, unquote

def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    return result.returncode, result.stdout.strip(), result.stderr.strip()

def inspect_container(name):
    code, stdout, _stderr = run(["docker", "inspect", name])
    if code != 0:
        return None
    try:
        return json.loads(stdout)[0]
    except Exception:
        return None

def env_map(inspect_data):
    result = {}
    for item in ((inspect_data or {}).get("Config") or {}).get("Env") or []:
        if "=" in item:
            key, value = item.split("=", 1)
            result[key] = value
    return result

def container_state(name):
    inspect_data = inspect_container(name)
    if not inspect_data:
        return {
            "found": False,
            "status": "missing",
            "health": None,
            "startedAt": None,
            "image": None,
            "composeProject": None,
            "env": {},
            "ports": [],
            "mounts": [],
        }

    state = inspect_data.get("State") or {}
    labels = ((inspect_data.get("Config") or {}).get("Labels") or {})
    host_config = inspect_data.get("HostConfig") or {}
    return {
        "found": True,
        "status": state.get("Status") or "unknown",
        "health": ((state.get("Health") or {}).get("Status")),
        "startedAt": state.get("StartedAt"),
        "image": ((inspect_data.get("Config") or {}).get("Image")),
        "composeProject": labels.get("com.docker.compose.project"),
        "env": {key: value for key, value in env_map(inspect_data).items() if key in {"FRONTEND_URL", "DATABASE_URL", "ENABLE_ACCOUNT_SIGNUP"}},
        "ports": sorted(list((host_config.get("PortBindings") or {}).keys())),
        "mounts": [
            {
                "destination": mount.get("Destination"),
                "source": mount.get("Name") or mount.get("Source"),
                "type": mount.get("Type"),
            }
            for mount in (inspect_data.get("Mounts") or [])
        ],
    }

def extract_database_name(database_url):
    if not database_url:
        return None
    parsed = urlparse(database_url)
    return unquote((parsed.path or "").lstrip("/")) or None

def psql_scalar(database_name, query):
    if not database_name:
        return None
    code, stdout, _stderr = run(["docker", "exec", "getouch-postgres", "psql", "-U", "getouch", "-d", database_name, "-Atc", query])
    if code != 0:
        return None
    return stdout.strip() or None

def psql_count(database_name, table_name):
    exists = psql_scalar(database_name, f"select to_regclass('public.{table_name}') is not null;")
    if exists != "t":
        return None
    value = psql_scalar(database_name, f"select count(*) from public.{table_name};")
    try:
        return int(value) if value is not None else None
    except Exception:
        return None

def tail_logs(name, tail=12):
    code, stdout, stderr = run(["docker", "logs", "--tail", str(tail), name])
    if code != 0:
        return []
    content = stdout or stderr
    return [line for line in content.splitlines() if line.strip()]

web = container_state("chatwoot-web")
worker = container_state("chatwoot-sidekiq")
redis = container_state("chatwoot-redis")
database_name = extract_database_name((web.get("env") or {}).get("DATABASE_URL"))
public_table_count = psql_scalar(database_name, "select count(*) from information_schema.tables where table_schema = 'public';")

worker_code, worker_stdout, _worker_stderr = run(["docker", "exec", "chatwoot-sidekiq", "sh", "-lc", "pgrep -fa sidekiq | head -n 1"]) if worker.get("found") else (1, "", "")
worker["sidekiqProcess"] = worker_stdout.strip() if worker_code == 0 and worker_stdout.strip() else None

redis_code, redis_stdout, _redis_stderr = run(["docker", "exec", "chatwoot-redis", "redis-cli", "ping"]) if redis.get("found") else (1, "", "")
redis["ping"] = redis_stdout.strip() if redis_code == 0 and redis_stdout.strip() else None

route_code, _route_stdout, _route_stderr = run(["docker", "exec", "caddy", "sh", "-lc", "grep -q 'chatwoot.getouch.co' /etc/caddy/Caddyfile"])

payload = {
    "web": web,
    "worker": worker,
    "redis": redis,
    "routeConfigured": route_code == 0,
    "database": {
        "name": database_name,
        "publicTableCount": int(public_table_count) if public_table_count and public_table_count.isdigit() else None,
        "usersCount": psql_count(database_name, "users"),
        "accountsCount": psql_count(database_name, "accounts"),
        "inboxesCount": psql_count(database_name, "inboxes"),
        "conversationsCount": psql_count(database_name, "conversations"),
    },
    "logs": {
        "web": tail_logs("chatwoot-web"),
        "worker": tail_logs("chatwoot-sidekiq"),
        "redis": tail_logs("chatwoot-redis", 6),
    },
    "errors": [],
}

print(json.dumps(payload))
PY
`);

    return JSON.parse(output) as RemoteChatwootState;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to inspect Chatwoot runtime';
    return createFallbackRemoteState(message);
  }
}

async function probe(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      ...init,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...(init?.headers || {}),
      },
    });

    return {
      ok: response.status >= 200 && response.status < 400,
      statusCode: response.status,
    };
  } catch {
    return {
      ok: false,
      statusCode: null,
    };
  }
}

export async function runChatwootHealthCheck(): Promise<ChatwootHealthProbe> {
  const checkedAt = new Date().toISOString();
  const uiProbe = await probe(CHATWOOT_PUBLIC_URL);

  return {
    checkedAt,
    ok: uiProbe.ok,
    statusCode: uiProbe.statusCode,
    target: CHATWOOT_PUBLIC_URL,
    message: uiProbe.ok
      ? 'Native Chatwoot UI is reachable.'
      : 'Native Chatwoot UI did not return a healthy response.',
  };
}

async function getTenantMappingSummary(): Promise<MappingSummary> {
  try {
    const [aggregate, rows] = await Promise.all([
      db
        .select({
          total: count(),
          active: sql<number>`count(*) filter (where ${chatwootTenantMappings.status} = 'active')`,
        })
        .from(chatwootTenantMappings),
      db
        .select({
          id: chatwootTenantMappings.id,
          tenantId: chatwootTenantMappings.tenantId,
          chatwootAccountId: chatwootTenantMappings.chatwootAccountId,
          chatwootInboxId: chatwootTenantMappings.chatwootInboxId,
          status: chatwootTenantMappings.status,
          createdAt: chatwootTenantMappings.createdAt,
          updatedAt: chatwootTenantMappings.updatedAt,
        })
        .from(chatwootTenantMappings)
        .orderBy(desc(chatwootTenantMappings.updatedAt), desc(chatwootTenantMappings.createdAt))
        .limit(8),
    ]);

    const total = Number(aggregate[0]?.total ?? 0);
    const active = Number(aggregate[0]?.active ?? 0);

    return {
      schemaReady: true,
      total,
      active,
      rows: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        chatwootAccountId: row.chatwootAccountId,
        chatwootInboxId: row.chatwootInboxId,
        status: row.status,
        assignedChannels: null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      message: total > 0
        ? `${active} active portal tenant mapping${active === 1 ? '' : 's'} stored in the control-plane DB.`
        : 'No portal tenant mappings yet. This is expected until tenant_id mapping is enabled.',
    };
  } catch {
    return {
      schemaReady: false,
      total: 0,
      active: 0,
      rows: [],
      message: 'Portal metadata table is not available yet. Apply the Chatwoot mapping migration to enable tenant mapping status.',
    };
  }
}

export function createDegradedChatwootDashboardStatus(errorMessage?: string | null): ChatwootDashboardStatus {
  const checkedAt = new Date().toISOString();
  const probe: ChatwootHealthProbe = {
    checkedAt,
    ok: false,
    statusCode: null,
    target: CHATWOOT_PUBLIC_URL,
    message: errorMessage || 'Chatwoot status is unavailable.',
  };

  return {
    checkedAt,
    summary: {
      statusLabel: 'Degraded',
      statusTone: 'warning',
      publicEndpoint: CHATWOOT_PUBLIC_URL,
      accountsCount: null,
      inboxesCount: null,
      conversationsCount: null,
      workerStatus: 'Unavailable',
      lastHealthCheck: checkedAt,
    },
    serviceInformation: {
      publicUrl: CHATWOOT_PUBLIC_URL,
      database: null,
      databaseStatus: errorMessage || 'Database status unavailable',
      redisStatus: 'Unavailable',
      workerStatus: 'Unavailable',
      version: null,
      deploymentMode: null,
      routeStatus: 'Unavailable',
      webStatus: 'Unavailable',
      storageStatus: 'Unavailable',
      directPortExposure: 'Unavailable',
      lastChecked: checkedAt,
    },
    quickActions: [
      { label: 'Open Chatwoot', href: CHATWOOT_PUBLIC_URL, external: true },
      { label: 'View Logs', href: '#logs' },
      { label: 'View Workers', href: '#workers' },
      { label: 'View Docs', href: 'https://developers.chatwoot.com/self-hosted/configuration/environment-variables', external: true },
    ],
    currentProbe: probe,
    runtime: {
      web: { found: false, status: 'missing', health: null, summary: 'Web status unavailable', startedAt: null },
      worker: { found: false, status: 'missing', health: null, summary: 'Worker status unavailable', startedAt: null },
      redis: { found: false, status: 'missing', health: null, summary: 'Redis status unavailable', startedAt: null },
      routeConfigured: false,
      publicPortExposed: false,
      composeProject: null,
      logs: { web: [], worker: [], redis: [] },
    },
    tenantMapping: {
      schemaReady: false,
      total: 0,
      active: 0,
      rows: [],
      message: 'Tenant mapping status unavailable.',
    },
    usage: {
      usersCount: null,
      accountsCount: null,
      inboxesCount: null,
      conversationsCount: null,
    },
    notes: [errorMessage || 'Chatwoot status is unavailable.'],
  };
}

export async function getChatwootDashboardStatus(): Promise<ChatwootDashboardStatus> {
  const checkedAt = new Date().toISOString();
  const [currentProbe, remote, tenantMapping] = await Promise.all([
    runChatwootHealthCheck(),
    getRemoteChatwootState(),
    getTenantMappingSummary(),
  ]);

  const publicPortExposed = remote.web.ports.length > 0;
  const databaseName = remote.database.name;
  const databaseMatchesExpected = databaseName === CHATWOOT_EXPECTED_DATABASE;
  const webSummary = summarizeContainer(remote.web, 'Web');
  const workerSummary = summarizeContainer(remote.worker, 'Worker', remote.worker.sidekiqProcess ? 'Sidekiq present' : null);
  const redisSummary = summarizeContainer(remote.redis, 'Redis', remote.redis.ping === 'PONG' ? 'PONG' : null);
  const version = deriveVersion(remote.web.image);
  const storageMount = remote.web.mounts.find((mount) => mount.destination === '/app/storage');
  const storageStatus = storageMount
    ? `Mounted at /app/storage via ${storageMount.type || 'volume'}`
    : 'Storage mount not detected';
  const routeStatus = remote.routeConfigured ? 'Caddy route active for chatwoot.getouch.co' : 'Caddy route not found';
  const deploymentMode = remote.web.composeProject ? 'Docker Compose on VPS' : 'Standalone runtime';
  const allHealthy = currentProbe.ok
    && remote.web.status === 'running'
    && remote.worker.status === 'running'
    && remote.redis.status === 'running'
    && databaseMatchesExpected
    && !publicPortExposed
    && remote.routeConfigured;

  const notes = [
    'Portal tenant_id should map to a Chatwoot account and optional inbox. Runtime conversations remain inside the Chatwoot database.',
    'Future human handover path: WhatsApp provider -> Getouch routing layer -> Dify bot if enabled -> Chatwoot for human takeover -> reply routed back through the selected provider.',
  ];

  for (const error of remote.errors) {
    notes.push(error);
  }

  return {
    checkedAt,
    summary: {
      statusLabel: allHealthy ? 'Healthy' : remote.web.found ? 'Degraded' : 'Not installed',
      statusTone: allHealthy ? 'healthy' : 'warning',
      publicEndpoint: CHATWOOT_PUBLIC_URL,
      accountsCount: remote.database.accountsCount,
      inboxesCount: remote.database.inboxesCount,
      conversationsCount: remote.database.conversationsCount,
      workerStatus: workerSummary,
      lastHealthCheck: currentProbe.checkedAt,
    },
    serviceInformation: {
      publicUrl: CHATWOOT_PUBLIC_URL,
      database: databaseName,
      databaseStatus: formatDatabaseStatus(remote.database),
      redisStatus: redisSummary,
      workerStatus: workerSummary,
      version,
      deploymentMode,
      routeStatus,
      webStatus: webSummary,
      storageStatus,
      directPortExposure: publicPortExposed ? `Exposed on ${remote.web.ports.join(', ')}` : 'No direct host port exposure detected',
      lastChecked: checkedAt,
    },
    quickActions: [
      { label: 'Open Chatwoot', href: CHATWOOT_PUBLIC_URL, external: true },
      { label: 'View Logs', href: '#logs' },
      { label: 'View Workers', href: '#workers' },
      { label: 'View Docs', href: 'https://developers.chatwoot.com/self-hosted/configuration/environment-variables', external: true },
    ],
    currentProbe,
    runtime: {
      web: {
        found: remote.web.found,
        status: remote.web.status,
        health: remote.web.health,
        summary: webSummary,
        startedAt: remote.web.startedAt,
      },
      worker: {
        found: remote.worker.found,
        status: remote.worker.status,
        health: remote.worker.health,
        summary: workerSummary,
        startedAt: remote.worker.startedAt,
      },
      redis: {
        found: remote.redis.found,
        status: remote.redis.status,
        health: remote.redis.health,
        summary: redisSummary,
        startedAt: remote.redis.startedAt,
      },
      routeConfigured: remote.routeConfigured,
      publicPortExposed,
      composeProject: remote.web.composeProject,
      logs: {
        web: remote.logs.web.map(sanitizeLogLine),
        worker: remote.logs.worker.map(sanitizeLogLine),
        redis: remote.logs.redis.map(sanitizeLogLine),
      },
    },
    tenantMapping,
    usage: {
      usersCount: remote.database.usersCount,
      accountsCount: remote.database.accountsCount,
      inboxesCount: remote.database.inboxesCount,
      conversationsCount: remote.database.conversationsCount,
    },
    notes,
  };
}