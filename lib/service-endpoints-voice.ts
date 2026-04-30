import { spawn } from 'node:child_process';

const PBX_PUBLIC_URL = 'https://pbx.getouch.co';
const VOICE_API_URL = 'https://voice.getouch.co';
const VOICE_EXPECTED_DATABASE = 'voice';
const VOICE_ENGINE = 'FusionPBX / FreeSWITCH';
const DEFAULT_SSH_DIR = process.env.HOME ? `${process.env.HOME}/.ssh` : '/home/nextjs/.ssh';
const VOICE_SSH_TARGET = process.env.AI_RUNTIME_SSH_TARGET
  || process.env.INFRA_METRICS_SSH_TARGET
  || process.env.SCHEDULED_RESTART_SSH_TARGET
  || 'deploy@100.84.14.93';
const VOICE_SSH_KEY_PATH = process.env.AI_RUNTIME_SSH_KEY_PATH
  || process.env.INFRA_METRICS_SSH_KEY_PATH
  || `${DEFAULT_SSH_DIR}/id_ed25519`;
const VOICE_SSH_KNOWN_HOSTS_PATH = process.env.AI_RUNTIME_SSH_KNOWN_HOSTS_PATH
  || process.env.INFRA_METRICS_SSH_KNOWN_HOSTS_PATH
  || `${DEFAULT_SSH_DIR}/known_hosts`;

export type VoiceHealthProbe = {
  checkedAt: string;
  ok: boolean;
  statusCode: number | null;
  target: string;
  message: string;
};

export type VoiceRuntimeState = {
  found: boolean;
  status: string;
  health: string | null;
  summary: string;
  startedAt: string | null;
};

export type VoiceTenantMappingRow = {
  tenantId: string;
  fusionpbxDomain: string | null;
  extensions: number;
  trunks: number;
  status: string;
};

export type VoiceDashboardStatus = {
  checkedAt: string;
  summary: {
    statusLabel: string;
    statusTone: 'healthy' | 'warning';
    pbxStatus: string;
    voiceApiStatus: string;
    dbStatus: string;
    sipRtpStatus: string;
    lastHealthCheck: string;
  };
  serviceInformation: {
    nativePbxUi: string;
    voiceApiUrl: string;
    database: string;
    engine: string;
    version: string | null;
    deploymentMode: string | null;
    routeStatus: string;
    uiStatus: string;
    freeswitchStatus: string;
    lastChecked: string;
  };
  quickActions: Array<{ label: string; href: string; external?: boolean }>;
  currentProbe: {
    pbx: VoiceHealthProbe;
    voiceApi: VoiceHealthProbe;
  };
  runtime: {
    web: VoiceRuntimeState;
    freeswitch: VoiceRuntimeState;
    routeConfigured: {
      pbx: boolean;
      voice: boolean;
    };
    directPortExposure: string;
    composeProject: string | null;
    databaseTables: number | null;
    domainCount: number | null;
    extensionCount: number | null;
    trunkCount: number | null;
    logs: {
      web: string[];
      freeswitch: string[];
    };
  };
  tenantMapping: {
    rows: VoiceTenantMappingRow[];
    message: string;
  };
  notes: string[];
};

type RemoteVoiceContainerState = {
  found: boolean;
  status: string;
  health: string | null;
  startedAt: string | null;
  image: string | null;
  composeProject: string | null;
  ports: string[];
};

type RemoteVoiceState = {
  web: RemoteVoiceContainerState;
  freeswitch: RemoteVoiceContainerState & {
    statusOutput: string | null;
    version: string | null;
  };
  routeConfigured: {
    pbx: boolean;
    voice: boolean;
  };
  database: {
    name: string | null;
    publicTableCount: number | null;
    domainCount: number | null;
    extensionCount: number | null;
    trunkCount: number | null;
  };
  logs: {
    web: string[];
    freeswitch: string[];
  };
  errors: string[];
};

function sanitizeLogLine(line: string) {
  return line
    .replace(/postgres:\/\/[^@\s]+@/gi, 'postgres://[redacted]@')
    .replace(/password=\S+/gi, 'password=[redacted]')
    .replace(/event_socket_password=\S+/gi, 'event_socket_password=[redacted]');
}

function isIgnorableVoiceLogLine(line: string) {
  const trimmed = line.trim();
  return trimmed === 'System has not been booted with systemd as init system (PID 1). Can\'t operate.'
    || trimmed === 'Failed to connect to bus: Host is down'
    || /^Created symlink \/etc\/systemd\/system\/.+\.service/.test(trimmed);
}

function summarizeContainer(
  state: { found: boolean; status: string; health: string | null },
  label: string,
  extra?: string | null,
) {
  if (!state.found) return `${label} missing`;
  if (state.status !== 'running') return `${label} ${state.status}`;
  if (state.health === 'healthy') return extra ? `${label} running · ${extra}` : `${label} healthy`;
  if (state.health) return `${label} ${state.health}`;
  return extra ? `${label} running · ${extra}` : `${label} running`;
}

function deriveVersion(value: string | null | undefined) {
  if (!value) return null;
  const parts = value.split(':');
  return parts.length > 1 ? parts[parts.length - 1] || null : value;
}

function createFallbackRemoteState(errorMessage: string): RemoteVoiceState {
  return {
    web: {
      found: false,
      status: 'missing',
      health: null,
      startedAt: null,
      image: null,
      composeProject: null,
      ports: [],
    },
    freeswitch: {
      found: false,
      status: 'missing',
      health: null,
      startedAt: null,
      image: null,
      composeProject: null,
      ports: [],
      statusOutput: null,
      version: null,
    },
    routeConfigured: {
      pbx: false,
      voice: false,
    },
    database: {
      name: null,
      publicTableCount: null,
      domainCount: null,
      extensionCount: null,
      trunkCount: null,
    },
    logs: {
      web: [],
      freeswitch: [],
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
        VOICE_SSH_KEY_PATH,
        '-o',
        `UserKnownHostsFile=${VOICE_SSH_KNOWN_HOSTS_PATH}`,
        '-o',
        'StrictHostKeyChecking=yes',
        VOICE_SSH_TARGET,
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

async function getRemoteVoiceState(): Promise<RemoteVoiceState> {
  try {
    const output = await runRemoteScript(String.raw`
set -euo pipefail

python3 - <<'PY'
import json
import subprocess

VOICE_DB = "voice"

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
            "ports": [],
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
        "ports": sorted(list((host_config.get("PortBindings") or {}).keys())),
    }

def psql_scalar(query):
    code, stdout, _stderr = run(["docker", "exec", "getouch-postgres", "psql", "-U", "getouch", "-d", VOICE_DB, "-Atc", query])
    if code != 0:
        return None
    return stdout.strip() or None

def psql_count(table_name):
    exists = psql_scalar(f"select to_regclass('public.{table_name}') is not null;")
    if exists != "t":
        return None
    value = psql_scalar(f"select count(*) from public.{table_name};")
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

web = container_state("voice-fusionpbx")
freeswitch = container_state("voice-freeswitch")

status_code, status_stdout, _status_stderr = run(["docker", "exec", "voice-freeswitch", "sh", "-lc", "fs_cli -x 'status' | head -n 5"]) if freeswitch.get("found") else (1, "", "")
version_code, version_stdout, _version_stderr = run(["docker", "exec", "voice-freeswitch", "sh", "-lc", "freeswitch -version | head -n 1"]) if freeswitch.get("found") else (1, "", "")

route_pbx_code, _route_pbx_stdout, _route_pbx_stderr = run(["docker", "exec", "caddy", "sh", "-lc", "grep -q 'pbx.getouch.co' /etc/caddy/Caddyfile"])
route_voice_code, _route_voice_stdout, _route_voice_stderr = run(["docker", "exec", "caddy", "sh", "-lc", "grep -q 'voice.getouch.co' /etc/caddy/Caddyfile"])

table_count = psql_scalar("select count(*) from information_schema.tables where table_schema = 'public';")

payload = {
    "web": web,
    "freeswitch": {
        **freeswitch,
        "statusOutput": status_stdout if status_code == 0 and status_stdout else None,
        "version": version_stdout if version_code == 0 and version_stdout else None,
    },
    "routeConfigured": {
        "pbx": route_pbx_code == 0,
        "voice": route_voice_code == 0,
    },
    "database": {
        "name": VOICE_DB if table_count is not None else None,
        "publicTableCount": int(table_count) if table_count and table_count.isdigit() else None,
        "domainCount": psql_count("v_domains"),
        "extensionCount": psql_count("v_extensions"),
        "trunkCount": psql_count("v_gateways"),
    },
    "logs": {
        "web": tail_logs("voice-fusionpbx"),
        "freeswitch": tail_logs("voice-freeswitch"),
    },
    "errors": [],
}

print(json.dumps(payload))
PY
`);

    return JSON.parse(output) as RemoteVoiceState;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to inspect FusionPBX runtime';
    return createFallbackRemoteState(message);
  }
}

async function probe(url: string, acceptableStatuses: number[]) {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
    });

    return {
      ok: response.ok || acceptableStatuses.includes(response.status),
      statusCode: response.status,
    };
  } catch {
    return {
      ok: false,
      statusCode: null,
    };
  }
}

export async function runFusionPbxHealthCheck(): Promise<VoiceHealthProbe> {
  const checkedAt = new Date().toISOString();
  const uiProbe = await probe(PBX_PUBLIC_URL, [301, 302, 401, 403]);

  return {
    checkedAt,
    ok: uiProbe.ok,
    statusCode: uiProbe.statusCode,
    target: PBX_PUBLIC_URL,
    message: uiProbe.statusCode === 401 || uiProbe.statusCode === 403
      ? 'FusionPBX UI is reachable and auth protected.'
      : uiProbe.ok
        ? 'FusionPBX UI is reachable.'
        : 'FusionPBX UI did not return a healthy response.',
  };
}

export async function runVoiceApiHealthCheck(): Promise<VoiceHealthProbe> {
  const checkedAt = new Date().toISOString();
  const apiProbe = await probe(`${VOICE_API_URL}/health`, [200, 204, 401, 403]);

  return {
    checkedAt,
    ok: apiProbe.ok,
    statusCode: apiProbe.statusCode,
    target: `${VOICE_API_URL}/health`,
    message: apiProbe.statusCode === 401 || apiProbe.statusCode === 403
      ? 'Voice API placeholder is reachable and auth protected.'
      : apiProbe.ok
        ? 'Voice API placeholder is reachable.'
        : 'Voice API placeholder did not return a healthy response.',
  };
}

function formatDatabaseStatus(remote: RemoteVoiceState['database']) {
  if (!remote.name) return 'Database status unavailable';
  if (remote.name !== VOICE_EXPECTED_DATABASE) return `Using ${remote.name}; expected ${VOICE_EXPECTED_DATABASE}`;
  if (remote.publicTableCount === null) return `Using ${remote.name}; schema state unavailable`;
  if (remote.publicTableCount === 0) return `Using ${remote.name}; schema not initialized yet`;
  return `Using ${remote.name} with ${remote.publicTableCount} public tables`;
}

function summarizeProbe(probe: VoiceHealthProbe) {
  if (probe.statusCode === 401 || probe.statusCode === 403) return 'Protected';
  if (probe.ok) return 'Healthy';
  return 'Unavailable';
}

function summarizeSipRtp(remote: RemoteVoiceState) {
  if (!remote.freeswitch.found) return 'Not installed';
  if (remote.freeswitch.status !== 'running') return `FreeSWITCH ${remote.freeswitch.status}`;
  const ports = remote.freeswitch.ports;
  const hasSip = ports.some((port) => port.startsWith('5060/') || port.startsWith('5061/') || port.startsWith('5080/'));
  const hasRtp = ports.some((port) => port.startsWith('16384/') || port.startsWith('16385/') || port.includes('164')); 
  if (hasSip && hasRtp) return 'Published';
  if (hasSip) return 'SIP only';
  return 'Private';
}

function createRuntimeSummary(remote: RemoteVoiceState) {
  const webSummary = summarizeContainer(remote.web, 'FusionPBX UI');
  const freeswitchExtra = remote.freeswitch.version
    ? remote.freeswitch.version.replace(/^FreeSWITCH version:\s*/i, '')
    : remote.freeswitch.statusOutput?.split(/\r?\n/, 1)?.[0] || null;
  const freeswitchSummary = summarizeContainer(remote.freeswitch, 'FreeSWITCH', freeswitchExtra || null);
  return { webSummary, freeswitchSummary };
}

export function createDegradedVoiceDashboardStatus(errorMessage?: string | null): VoiceDashboardStatus {
  const checkedAt = new Date().toISOString();
  const pbxProbe: VoiceHealthProbe = {
    checkedAt,
    ok: false,
    statusCode: null,
    target: PBX_PUBLIC_URL,
    message: errorMessage || 'FusionPBX status is unavailable.',
  };
  const voiceApiProbe: VoiceHealthProbe = {
    checkedAt,
    ok: false,
    statusCode: null,
    target: `${VOICE_API_URL}/health`,
    message: errorMessage || 'Voice API status is unavailable.',
  };

  return {
    checkedAt,
    summary: {
      statusLabel: 'Degraded',
      statusTone: 'warning',
      pbxStatus: 'Unavailable',
      voiceApiStatus: 'Unavailable',
      dbStatus: 'Unavailable',
      sipRtpStatus: 'Unavailable',
      lastHealthCheck: checkedAt,
    },
    serviceInformation: {
      nativePbxUi: PBX_PUBLIC_URL,
      voiceApiUrl: VOICE_API_URL,
      database: VOICE_EXPECTED_DATABASE,
      engine: VOICE_ENGINE,
      version: null,
      deploymentMode: null,
      routeStatus: 'Unavailable',
      uiStatus: 'Unavailable',
      freeswitchStatus: 'Unavailable',
      lastChecked: checkedAt,
    },
    quickActions: [
      { label: 'Open FusionPBX', href: PBX_PUBLIC_URL, external: true },
      { label: 'View Voice API', href: VOICE_API_URL, external: true },
      { label: 'View Logs', href: '#logs' },
      { label: 'View Docs', href: 'https://docs.fusionpbx.com/en/latest/index.html', external: true },
    ],
    currentProbe: {
      pbx: pbxProbe,
      voiceApi: voiceApiProbe,
    },
    runtime: {
      web: { found: false, status: 'missing', health: null, summary: 'FusionPBX UI unavailable', startedAt: null },
      freeswitch: { found: false, status: 'missing', health: null, summary: 'FreeSWITCH unavailable', startedAt: null },
      routeConfigured: { pbx: false, voice: false },
      directPortExposure: 'Unavailable',
      composeProject: null,
      databaseTables: null,
      domainCount: null,
      extensionCount: null,
      trunkCount: null,
      logs: { web: [], freeswitch: [] },
    },
    tenantMapping: {
      rows: [],
      message: 'Portal tenant_id to FusionPBX domain mapping is planned but not stored in the control plane yet.',
    },
    notes: [errorMessage || 'FusionPBX status is unavailable.'],
  };
}

export async function getVoiceDashboardStatus(): Promise<VoiceDashboardStatus> {
  const checkedAt = new Date().toISOString();
  const [pbxProbe, voiceApiProbe, remote] = await Promise.all([
    runFusionPbxHealthCheck(),
    runVoiceApiHealthCheck(),
    getRemoteVoiceState(),
  ]);

  const { webSummary, freeswitchSummary } = createRuntimeSummary(remote);
  const statusLabel = pbxProbe.ok
    && voiceApiProbe.ok
    && remote.web.status === 'running'
    && remote.freeswitch.status === 'running'
    && remote.routeConfigured.pbx
    && remote.routeConfigured.voice
    && remote.database.name === VOICE_EXPECTED_DATABASE
    ? 'Healthy'
    : remote.web.found || remote.freeswitch.found
      ? 'Degraded'
      : 'Not installed';
  const statusTone = statusLabel === 'Healthy' ? 'healthy' as const : 'warning' as const;
  const routeStatus = remote.routeConfigured.pbx && remote.routeConfigured.voice
    ? 'Caddy routes active for pbx.getouch.co and voice.getouch.co'
    : remote.routeConfigured.pbx || remote.routeConfigured.voice
      ? 'One voice route is active; review Caddy configuration'
      : 'Voice routes not found in Caddy';
  const deploymentMode = remote.web.composeProject ? 'Docker Compose on VPS' : remote.web.found || remote.freeswitch.found ? 'Container runtime on VPS' : null;
  const version = remote.freeswitch.version || deriveVersion(remote.web.image) || deriveVersion(remote.freeswitch.image);
  const notes = [
    'Portal tenant_id must map to a FusionPBX domain/account later. Do not create orphan tenant identifiers only inside FusionPBX.',
    'Runtime PBX data should remain in the voice database; Portal metadata stays in the control-plane database when tenant mapping is added.',
    'No SIP trunk or SIM gateway is configured yet. Next step is provisioning one carrier or SIM-backed gateway and then validating NAT, SIP, and RTP externally.',
  ];

  for (const error of remote.errors) {
    notes.push(error);
  }

  return {
    checkedAt,
    summary: {
      statusLabel,
      statusTone,
      pbxStatus: summarizeProbe(pbxProbe),
      voiceApiStatus: summarizeProbe(voiceApiProbe),
      dbStatus: remote.database.name === VOICE_EXPECTED_DATABASE
        ? remote.database.publicTableCount === null
          ? 'Unavailable'
          : remote.database.publicTableCount > 0
            ? 'Ready'
            : 'Empty'
        : 'Unavailable',
      sipRtpStatus: summarizeSipRtp(remote),
      lastHealthCheck: pbxProbe.checkedAt,
    },
    serviceInformation: {
      nativePbxUi: PBX_PUBLIC_URL,
      voiceApiUrl: VOICE_API_URL,
      database: VOICE_EXPECTED_DATABASE,
      engine: VOICE_ENGINE,
      version,
      deploymentMode,
      routeStatus,
      uiStatus: webSummary,
      freeswitchStatus: freeswitchSummary,
      lastChecked: checkedAt,
    },
    quickActions: [
      { label: 'Open FusionPBX', href: PBX_PUBLIC_URL, external: true },
      { label: 'View Voice API', href: VOICE_API_URL, external: true },
      { label: 'View Logs', href: '#logs' },
      { label: 'View Docs', href: 'https://docs.fusionpbx.com/en/latest/index.html', external: true },
    ],
    currentProbe: {
      pbx: pbxProbe,
      voiceApi: voiceApiProbe,
    },
    runtime: {
      web: {
        found: remote.web.found,
        status: remote.web.status,
        health: remote.web.health,
        summary: webSummary,
        startedAt: remote.web.startedAt,
      },
      freeswitch: {
        found: remote.freeswitch.found,
        status: remote.freeswitch.status,
        health: remote.freeswitch.health,
        summary: freeswitchSummary,
        startedAt: remote.freeswitch.startedAt,
      },
      routeConfigured: remote.routeConfigured,
      directPortExposure: remote.freeswitch.ports.length > 0
        ? remote.freeswitch.ports.join(', ')
        : 'No direct SIP or RTP host port bindings detected',
      composeProject: remote.web.composeProject || remote.freeswitch.composeProject,
      databaseTables: remote.database.publicTableCount,
      domainCount: remote.database.domainCount,
      extensionCount: remote.database.extensionCount,
      trunkCount: remote.database.trunkCount,
      logs: {
        web: remote.logs.web.filter((line) => !isIgnorableVoiceLogLine(line)).map(sanitizeLogLine),
        freeswitch: remote.logs.freeswitch.filter((line) => !isIgnorableVoiceLogLine(line)).map(sanitizeLogLine),
      },
    },
    tenantMapping: {
      rows: [],
      message: 'Portal tenant_id to FusionPBX domain mapping is planned. The control plane does not store voice tenant mappings yet, so the table is intentionally empty.',
    },
    notes,
  };
}