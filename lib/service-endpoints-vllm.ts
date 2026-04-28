import { spawn } from 'node:child_process';
import { and, desc, eq, gte, ilike, or } from 'drizzle-orm';
import {
  getGatewayAdminTestKey,
  getGatewayKeyInventory,
  getGatewayStatus,
  type GatewayStatus,
} from './ai-gateway';
import { getAiRuntimeStatus, type AiRuntimeStatus } from './ai-runtime';
import { getApiKeyPepperStatus, listApiKeys } from './api-keys';
import { db } from './db';
import { apiKeyUsageLogs } from './schema';

type VllmKeyRow = {
  id: string;
  name: string;
  tenantId: string | null;
  keyPrefix: string;
  status: 'active' | 'disabled' | 'revoked' | 'rotating' | 'expired';
  services: string[];
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
};

export type VllmRecentRequest = {
  id: string;
  time: string;
  tenantOrKey: string;
  endpoint: string;
  status: number | null;
  latencyMs: number | null;
};

export type VllmDashboardStatus = {
  checkedAt: string;
  gateway: GatewayStatus;
  runtime: AiRuntimeStatus;
  serviceInfo: {
    publicEndpoint: string;
    internalBackend: string;
    modelInternal: string;
    modelAlias: string;
    gatewayVersion: string | null;
    backendVersion: string;
    lastHealthCheck: string;
    gatewayStartedAt: string | null;
    backendStartedAt: string | null;
    pepper: ReturnType<typeof getApiKeyPepperStatus>;
  };
  apiAccess: {
    centralKeyCount: number;
    activeKeys: number;
    revokedKeys: number;
    expiredKeys: number;
    envKeyCount: number;
    envKeys: Array<{ label: string; prefix: string }>;
    centralWiringPending: boolean;
    requestsLast7Days: number;
    successRate7d: number | null;
    keys: VllmKeyRow[];
    recentRequests: VllmRecentRequest[];
  };
  openWebUi: {
    url: string;
    expectedTab: 'External';
    expectedModel: string;
    providerBaseUrl: string;
    providerBaseUrls: string[];
    status: 'Not configured' | 'Configured' | 'Visible' | 'Working' | 'Failed' | 'Backend not ready';
    note: string;
  };
};

export type VllmQuickTestResult = {
  ok: boolean;
  checkedAt: string;
  statusCode: number | null;
  message: string;
  models?: string[];
};

export type VllmLogsResult = {
  source: 'gateway' | 'backend';
  available: boolean;
  checkedAt: string;
  container: string | null;
  lines: string[];
  message: string;
};

type RemoteVllmIntrospection = {
  gatewayContainer: string | null;
  gatewayStartedAt: string | null;
  backendContainer: string | null;
  backendStartedAt: string | null;
  backendVersion: string | null;
};

const VLLM_INTERNAL_BACKEND = 'http://vllm-qwen3-14b-fp8:8000/v1';
const VLLM_PUBLIC_ALIAS = 'getouch-qwen3-14b';
const VLLM_INTERNAL_MODEL = 'Qwen/Qwen3-14B-FP8';
const DEFAULT_SSH_DIR = process.env.HOME ? `${process.env.HOME}/.ssh` : '/home/nextjs/.ssh';
const AI_RUNTIME_SSH_TARGET = process.env.AI_RUNTIME_SSH_TARGET
  || process.env.INFRA_METRICS_SSH_TARGET
  || process.env.SHUTDOWN_DIAGNOSTIC_SSH_TARGET
  || process.env.SCHEDULED_RESTART_SSH_TARGET
  || 'deploy@100.84.14.93';
const AI_RUNTIME_SSH_KEY_PATH = process.env.AI_RUNTIME_SSH_KEY_PATH
  || process.env.INFRA_METRICS_SSH_KEY_PATH
  || `${DEFAULT_SSH_DIR}/id_ed25519`;
const AI_RUNTIME_SSH_KNOWN_HOSTS_PATH = process.env.AI_RUNTIME_SSH_KNOWN_HOSTS_PATH
  || process.env.INFRA_METRICS_SSH_KNOWN_HOSTS_PATH
  || `${DEFAULT_SSH_DIR}/known_hosts`;

function isVllmCentralKey(key: Awaited<ReturnType<typeof listApiKeys>>[number]) {
  const services = (key.services as string[] | null) ?? [];
  const scopes = (key.scopes as string[] | null) ?? [];
  return services.includes('ai') || scopes.some((scope) => scope.startsWith('ai:') || scope === `model:${VLLM_PUBLIC_ALIAS}`);
}

function toGatewayVersion() {
  return (
    process.env.SOURCE_COMMIT ||
    process.env.COOLIFY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_BUILD_SHA ||
    null
  );
}

function deriveOpenWebUiStatus(runtime: AiRuntimeStatus, gateway: GatewayStatus) {
  const configured = runtime.openWebUi.providerBaseUrls.includes(gateway.publicBaseUrl)
    || runtime.openWebUi.providerBaseUrls.includes(VLLM_INTERNAL_BACKEND);

  if (!runtime.openWebUi.reachable) {
    return {
      status: 'Failed' as const,
      note: runtime.openWebUi.error || 'Open WebUI is not reachable right now.',
    };
  }

  if (!configured) {
    return {
      status: 'Not configured' as const,
      note: 'vLLM will not appear in Open WebUI until the External provider is configured with the public or internal vLLM base URL.',
    };
  }

  if (!gateway.backend.ready) {
    return {
      status: 'Backend not ready' as const,
      note: `vLLM will not appear in Open WebUI until the backend is running and ${gateway.publicBaseUrl}/models returns ${VLLM_PUBLIC_ALIAS}.`,
    };
  }

  if (runtime.openWebUi.vllmProviderUsable) {
    return {
      status: 'Working' as const,
      note: `${VLLM_PUBLIC_ALIAS} should be callable from the External tab.`,
    };
  }

  return {
    status: 'Configured' as const,
    note: 'The provider is configured, but the current runtime probe cannot yet confirm end-to-end model visibility.',
  };
}

export async function getVllmDashboardStatus(): Promise<VllmDashboardStatus> {
  const [gateway, runtime, allKeys, remote, usageRows] = await Promise.all([
    getGatewayStatus(),
    getAiRuntimeStatus(),
    listApiKeys(),
    getRemoteVllmIntrospection(),
    db
      .select({
        id: apiKeyUsageLogs.id,
        createdAt: apiKeyUsageLogs.createdAt,
        keyPrefix: apiKeyUsageLogs.keyPrefix,
        route: apiKeyUsageLogs.route,
        statusCode: apiKeyUsageLogs.statusCode,
        latencyMs: apiKeyUsageLogs.latencyMs,
      })
      .from(apiKeyUsageLogs)
      .where(
        and(
          eq(apiKeyUsageLogs.service, 'ai'),
          gte(apiKeyUsageLogs.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
          or(
            ilike(apiKeyUsageLogs.route, '/v1/%'),
            ilike(apiKeyUsageLogs.route, '/health'),
            ilike(apiKeyUsageLogs.route, '/ready'),
          ),
        ),
      )
      .orderBy(desc(apiKeyUsageLogs.createdAt))
      .limit(50),
  ]);

  const keys = allKeys.filter(isVllmCentralKey).map((key) => ({
    id: key.id,
    name: key.name,
    tenantId: key.tenantId,
    keyPrefix: key.keyPrefix,
    status: key.status,
    services: (key.services as string[] | null) ?? [],
    scopes: (key.scopes as string[] | null) ?? [],
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
  }));

  const recentRequests = usageRows.slice(0, 10).map((row) => ({
    id: row.id,
    time: row.createdAt.toISOString(),
    tenantOrKey: row.keyPrefix || 'Unknown key',
    endpoint: row.route || 'Unknown route',
    status: row.statusCode,
    latencyMs: row.latencyMs,
  }));

  const successCount = usageRows.filter((row) => row.statusCode !== null && row.statusCode >= 200 && row.statusCode < 400).length;
  const successRate7d = usageRows.length ? Math.round((successCount / usageRows.length) * 1000) / 10 : null;
  const pepper = getApiKeyPepperStatus();
  const openWebUi = deriveOpenWebUiStatus(runtime, gateway);

  return {
    checkedAt: new Date().toISOString(),
    gateway,
    runtime,
    serviceInfo: {
      publicEndpoint: gateway.publicBaseUrl,
      internalBackend: VLLM_INTERNAL_BACKEND,
      modelInternal: VLLM_INTERNAL_MODEL,
      modelAlias: VLLM_PUBLIC_ALIAS,
      gatewayVersion: toGatewayVersion(),
      backendVersion: runtime.vllm.containerStatus === 'running' ? (remote.backendVersion || 'Unknown') : 'Not running',
      lastHealthCheck: gateway.checkedAt,
      gatewayStartedAt: remote.gatewayStartedAt,
      backendStartedAt: remote.backendStartedAt,
      pepper,
    },
    apiAccess: {
      centralKeyCount: keys.length,
      activeKeys: keys.filter((key) => key.status === 'active').length,
      revokedKeys: keys.filter((key) => key.status === 'revoked').length,
      expiredKeys: keys.filter((key) => key.status === 'expired').length,
      envKeyCount: gateway.auth.keyCount,
      envKeys: getGatewayKeyInventory(),
      centralWiringPending: true,
      requestsLast7Days: usageRows.length,
      successRate7d,
      keys,
      recentRequests,
    },
    openWebUi: {
      url: runtime.links.openWebUi,
      expectedTab: 'External',
      expectedModel: VLLM_PUBLIC_ALIAS,
      providerBaseUrl: gateway.publicBaseUrl,
      providerBaseUrls: runtime.openWebUi.providerBaseUrls,
      status: openWebUi.status,
      note: openWebUi.note,
    },
  };
}

function sanitizeLogLine(line: string) {
  return line
    .replace(/authorization:\s*bearer\s+[^\s]+/gi, 'Authorization: Bearer [redacted]')
    .replace(/"authorization"\s*:\s*"[^"]+"/gi, '"authorization":"[redacted]"')
    .replace(/bearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [redacted]');
}

function runRemoteScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ssh',
      [
        '-i',
        AI_RUNTIME_SSH_KEY_PATH,
        '-o',
        `UserKnownHostsFile=${AI_RUNTIME_SSH_KNOWN_HOSTS_PATH}`,
        '-o',
        'StrictHostKeyChecking=yes',
        AI_RUNTIME_SSH_TARGET,
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

async function getRemoteVllmIntrospection(): Promise<RemoteVllmIntrospection> {
  try {
    const output = await runRemoteScript(String.raw`
set -euo pipefail

APP_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '^(mqmo5bwkxysedbg7vvh6tk1f-|getouch-web-prod$|getouch-web$)' | head -n1 || true)
BACKEND_CONTAINER='vllm-qwen3-14b-fp8'

gateway_started=''
backend_started=''
backend_version=''

if [ -n "$APP_CONTAINER" ]; then
  gateway_started=$(docker inspect "$APP_CONTAINER" --format '{{.State.StartedAt}}' 2>/dev/null || true)
fi

if docker inspect "$BACKEND_CONTAINER" >/dev/null 2>&1; then
  backend_started=$(docker inspect "$BACKEND_CONTAINER" --format '{{.State.StartedAt}}' 2>/dev/null || true)
  if [ "$(docker inspect "$BACKEND_CONTAINER" --format '{{.State.Running}}' 2>/dev/null || true)" = "true" ]; then
    backend_version=$(docker exec "$BACKEND_CONTAINER" python3 -c 'import vllm; print(vllm.__version__)' 2>/dev/null || true)
  fi
fi

python3 - <<'PY' "$APP_CONTAINER" "$gateway_started" "$BACKEND_CONTAINER" "$backend_started" "$backend_version"
import json
import sys
gateway_container, gateway_started, backend_container, backend_started, backend_version = sys.argv[1:6]
print(json.dumps({
    "gatewayContainer": gateway_container or None,
    "gatewayStartedAt": gateway_started or None,
    "backendContainer": backend_container if backend_started or backend_version else None,
    "backendStartedAt": backend_started or None,
    "backendVersion": backend_version or None,
}))
PY`);

    return JSON.parse(output) as RemoteVllmIntrospection;
  } catch {
    return {
      gatewayContainer: null,
      gatewayStartedAt: null,
      backendContainer: null,
      backendStartedAt: null,
      backendVersion: null,
    };
  }
}

export async function runVllmQuickTest(kind: 'health' | 'ready' | 'models'): Promise<VllmQuickTestResult> {
  const gateway = await getGatewayStatus();
  const checkedAt = new Date().toISOString();
  const url = kind === 'health'
    ? gateway.publicHealthUrl
    : kind === 'ready'
      ? gateway.publicReadyUrl
      : `${gateway.publicBaseUrl}/models`;

  const headers = new Headers();
  if (kind === 'models') {
    const adminTestKey = getGatewayAdminTestKey();
    if (!adminTestKey) {
      return {
        ok: false,
        checkedAt,
        statusCode: null,
        message: 'Admin test key is not configured. Protected /v1/models test is disabled until a server-side test key is available.',
      };
    }
    headers.set('Authorization', `Bearer ${adminTestKey}`);
  }

  try {
    const response = await fetch(url, { headers, cache: 'no-store' });
    const body = await response.json().catch(() => null) as { data?: Array<{ id?: string }> } | null;
    const models = Array.isArray(body?.data)
      ? body!.data.map((entry) => entry.id).filter((id): id is string => Boolean(id))
      : undefined;
    return {
      ok: response.ok,
      checkedAt,
      statusCode: response.status,
      message: kind === 'ready' && response.status === 503
        ? 'Backend not running.'
        : response.ok
          ? `${kind === 'models' ? '/v1/models' : `/${kind}`} responded successfully.`
          : `${kind === 'models' ? '/v1/models' : `/${kind}`} returned ${response.status}.`,
      models,
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      statusCode: null,
      message: error instanceof Error ? error.message : 'Endpoint probe failed.',
    };
  }
}

export async function getVllmUsageSnapshot() {
  const status = await getVllmDashboardStatus();
  return status.apiAccess;
}

export async function getVllmLogs(source: 'gateway' | 'backend'): Promise<VllmLogsResult> {
  try {
    const output = await runRemoteScript(source === 'gateway'
      ? String.raw`
set -euo pipefail
CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '^(mqmo5bwkxysedbg7vvh6tk1f-|getouch-web-prod$|getouch-web$)' | head -n1 || true)
if [ -z "$CONTAINER" ]; then
  python3 - <<'PY'
import json
print(json.dumps({"container": None, "lines": [], "message": "Gateway container not found."}))
PY
  exit 0
fi
python3 - <<'PY' "$CONTAINER"
import json
import subprocess
import sys
container = sys.argv[1]
proc = subprocess.run(["docker", "logs", "--tail", "200", container], text=True, capture_output=True)
lines = (proc.stdout + proc.stderr).splitlines()[-200:]
print(json.dumps({"container": container, "lines": lines, "message": "OK"}))
PY`
      : String.raw`
set -euo pipefail
CONTAINER='vllm-qwen3-14b-fp8'
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  python3 - <<'PY'
import json
print(json.dumps({"container": None, "lines": [], "message": "Backend container not found."}))
PY
  exit 0
fi
python3 - <<'PY' "$CONTAINER"
import json
import subprocess
import sys
container = sys.argv[1]
proc = subprocess.run(["docker", "logs", "--tail", "200", container], text=True, capture_output=True)
lines = (proc.stdout + proc.stderr).splitlines()[-200:]
print(json.dumps({"container": container, "lines": lines, "message": "OK"}))
PY`);

    const parsed = JSON.parse(output) as { container: string | null; lines: string[]; message: string };
    return {
      source,
      available: Boolean(parsed.container),
      checkedAt: new Date().toISOString(),
      container: parsed.container,
      lines: parsed.lines.map(sanitizeLogLine),
      message: parsed.message,
    };
  } catch (error) {
    return {
      source,
      available: false,
      checkedAt: new Date().toISOString(),
      container: null,
      lines: [],
      message: error instanceof Error ? error.message : 'Unable to retrieve logs.',
    };
  }
}
