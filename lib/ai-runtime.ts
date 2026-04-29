import { spawn } from 'node:child_process';

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

const VLLM_SERVICE_NAME = 'vllm-qwen3-14b-fp8';
const VLLM_MODEL = 'Qwen/Qwen3-14B-FP8';
const VLLM_INTERNAL_ENDPOINT = 'http://vllm-qwen3-14b-fp8:8000/v1';
const GRAFANA_GPU_URL = process.env.AI_RUNTIME_GRAFANA_GPU_URL || 'https://grafana.getouch.co';
const MIN_FREE_VRAM_MIB_FOR_TRIAL = Number(process.env.AI_RUNTIME_MIN_FREE_VRAM_MIB || '12000');

export type AiRuntimeAction =
  | 'status'
  | 'ollama-unload-current'
  | 'vllm-start'
  | 'vllm-stop'
  | 'restore-ollama'
  | 'openwebui-configure-vllm';

export type AiRuntimeStatus = {
  checkedAt: string;
  runtime: {
    activeRuntime: 'Ollama' | 'vLLM' | 'Maintenance' | 'Unknown';
    recommendedMode: string;
    recommendedReason: string;
    warning: string | null;
  };
  gpu: {
    available: boolean;
    name: string | null;
    totalVramMiB: number | null;
    usedVramMiB: number | null;
    freeVramMiB: number | null;
    utilizationGpuPercent: number | null;
    temperatureC: number | null;
    driverVersion: string | null;
    cudaVersion: string | null;
    dockerAccess: boolean;
    dockerAccessError: string | null;
  };
  ollama: {
    containerStatus: 'running' | 'stopped' | 'missing' | 'unknown';
    apiReachable: boolean;
    apiError: string | null;
    residentModel: string | null;
    residentProcessor: string | null;
    residentSize: string | null;
    residentContext: string | null;
    residentUntil: string | null;
    installedModels: string[];
    installedCount: number;
  };
  vllm: {
    status: 'Not installed' | 'Installed but stopped' | 'Starting' | 'Running' | 'Failed' | 'Blocked' | 'Unknown';
    intendedModel: string;
    intendedEndpoint: string;
    publicExposure: 'No';
    containerStatus: 'running' | 'stopped' | 'missing' | 'unknown';
    providerReachable: boolean;
    providerError: string | null;
    configuredInCompose: boolean;
    composeServiceFound: boolean;
    lastError: string | null;
    blockedReason: string | null;
  };
  openWebUi: {
    reachable: boolean;
    providerBaseUrls: string[];
    providerKeysConfigured: number;
    ollamaProviderAvailable: boolean;
    vllmProviderConfigured: boolean;
    vllmProviderUsable: boolean;
    error: string | null;
  };
  docker: {
    network: string | null;
    openWebUiContainer: string;
    ollamaContainer: string;
    vllmContainer: string;
    publicExposureDetected: boolean;
  };
  host: {
    memoryTotal: string | null;
    memoryUsed: string | null;
    memoryAvailable: string | null;
    swapTotal: string | null;
    swapUsed: string | null;
    diskSrvFree: string | null;
  };
  actions: {
    canRefresh: boolean;
    canUnloadOllama: boolean;
    canStartVllmTrial: boolean;
    canStopVllm: boolean;
    canRestoreOllama: boolean;
    canConfigureOpenWebUiVllm: boolean;
    startBlockedReason: string | null;
    configureBlockedReason: string | null;
  };
  links: {
    openWebUi: string;
    grafanaGpu: string;
  };
  commandPolicy: {
    mode: 'inline-fixed-commands';
    allowedActions: AiRuntimeAction[];
  };
};

type AiRuntimeActionResult = {
  ok: boolean;
  action: AiRuntimeAction;
  message: string;
  checkedAt: string;
  status: AiRuntimeStatus;
};

type RawCommandPayload = {
  ok: boolean;
  action: AiRuntimeAction;
  message: string;
  status: AiRuntimeStatus;
};

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
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `ssh exited with code ${code}`));
    });

    child.stdin.end(script);
  });
}

function buildRemoteScript(action: AiRuntimeAction) {
  return String.raw`
set -euo pipefail

ACTION='${action}'
VLLM_SERVICE='${VLLM_SERVICE_NAME}'
VLLM_MODEL='${VLLM_MODEL}'
VLLM_ENDPOINT='${VLLM_INTERNAL_ENDPOINT}'
MIN_FREE_VRAM_MIB='${String(MIN_FREE_VRAM_MIB_FOR_TRIAL)}'
COMPOSE_FILE='/home/deploy/apps/getouch.co/compose.yaml'
HF_CACHE_DIR='/srv/apps/ai/huggingface'
PUBLIC_PORTS='80/tcp,443/tcp'
export ACTION VLLM_SERVICE VLLM_MODEL VLLM_ENDPOINT MIN_FREE_VRAM_MIB COMPOSE_FILE HF_CACHE_DIR PUBLIC_PORTS

json_escape() {
  python3 - <<'PY' "$1"
import json
import sys
print(json.dumps(sys.argv[1]))
PY
}

collect_status_json() {
  python3 - <<'PY'
import json
import os
import shlex
import subprocess
from datetime import datetime, timezone

VLLM_SERVICE = os.environ['VLLM_SERVICE']
VLLM_MODEL = os.environ['VLLM_MODEL']
VLLM_ENDPOINT = os.environ['VLLM_ENDPOINT']
MIN_FREE_VRAM_MIB = int(os.environ['MIN_FREE_VRAM_MIB'])
COMPOSE_FILE = os.environ['COMPOSE_FILE']
HF_CACHE_DIR = os.environ['HF_CACHE_DIR']

def run(cmd, check=False):
    proc = subprocess.run(cmd, shell=True, text=True, capture_output=True)
    out = proc.stdout.strip()
    err = proc.stderr.strip()
    if check and proc.returncode != 0:
        raise RuntimeError(err or out or f'command failed: {cmd}')
    return proc.returncode, out, err

def parse_mem(token):
    token = (token or '').strip()
    if not token:
        return None
    return token

status = {
    'checkedAt': datetime.now(timezone.utc).isoformat(),
    'runtime': {
        'activeRuntime': 'Unknown',
        'recommendedMode': 'Ollama primary / vLLM trial only',
        'recommendedReason': 'Single 16GB GPU cannot safely run Ollama 14B and vLLM 14B in parallel.',
        'warning': None,
    },
    'gpu': {
        'available': False,
        'name': None,
        'totalVramMiB': None,
        'usedVramMiB': None,
        'freeVramMiB': None,
        'utilizationGpuPercent': None,
        'temperatureC': None,
        'driverVersion': None,
        'cudaVersion': None,
        'dockerAccess': False,
        'dockerAccessError': None,
    },
    'ollama': {
        'containerStatus': 'unknown',
        'apiReachable': False,
        'apiError': None,
        'residentModel': None,
        'residentProcessor': None,
        'residentSize': None,
        'residentContext': None,
        'residentUntil': None,
        'installedModels': [],
        'installedCount': 0,
    },
    'vllm': {
        'status': 'Unknown',
        'intendedModel': VLLM_MODEL,
        'intendedEndpoint': VLLM_ENDPOINT,
        'publicExposure': 'No',
        'containerStatus': 'missing',
        'providerReachable': False,
        'providerError': None,
        'configuredInCompose': False,
        'composeServiceFound': False,
        'lastError': None,
        'blockedReason': None,
    },
    'openWebUi': {
        'reachable': False,
        'providerBaseUrls': [],
        'providerKeysConfigured': 0,
        'ollamaProviderAvailable': False,
        'vllmProviderConfigured': False,
        'vllmProviderUsable': False,
        'error': None,
    },
    'docker': {
        'network': None,
        'openWebUiContainer': 'open-webui',
        'ollamaContainer': 'ollama',
        'vllmContainer': VLLM_SERVICE,
        'publicExposureDetected': False,
    },
    'host': {
        'memoryTotal': None,
        'memoryUsed': None,
        'memoryAvailable': None,
        'swapTotal': None,
        'swapUsed': None,
        'diskSrvFree': None,
    },
    'actions': {
        'canRefresh': True,
        'canUnloadOllama': False,
        'canStartVllmTrial': False,
        'canStopVllm': False,
        'canRestoreOllama': False,
        'canConfigureOpenWebUiVllm': False,
        'startBlockedReason': None,
        'configureBlockedReason': None,
    },
    'links': {
        'openWebUi': 'https://ai.getouch.co',
        'grafanaGpu': os.environ.get('AI_RUNTIME_GRAFANA_GPU_URL', 'https://grafana.getouch.co'),
    },
    'commandPolicy': {
        'mode': 'inline-fixed-commands',
        'allowedActions': [
            'status',
            'ollama-unload-current',
            'vllm-start',
            'vllm-stop',
            'restore-ollama',
            'openwebui-configure-vllm',
        ],
    },
}

# Host memory/disk
rc, free_out, _ = run("free -h | awk 'NR==2{print $2\"|\"$3\"|\"$7} NR==3{print $2\"|\"$3}'")
if rc == 0 and free_out:
    rows = free_out.splitlines()
    if rows:
        mem_parts = rows[0].split('|')
        if len(mem_parts) >= 3:
            status['host']['memoryTotal'] = mem_parts[0]
            status['host']['memoryUsed'] = mem_parts[1]
            status['host']['memoryAvailable'] = mem_parts[2]
    if len(rows) > 1:
        swap_parts = rows[1].split('|')
        if len(swap_parts) >= 2:
            status['host']['swapTotal'] = swap_parts[0]
            status['host']['swapUsed'] = swap_parts[1]

rc, df_out, _ = run("df -h /srv --output=avail | tail -n1 | xargs")
if rc == 0 and df_out:
    status['host']['diskSrvFree'] = df_out

# GPU summary
rc, gpu_out, gpu_err = run("nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu,driver_version --format=csv,noheader,nounits")
if rc == 0 and gpu_out:
    parts = [part.strip() for part in gpu_out.split(',')]
    if len(parts) >= 6:
        status['gpu']['available'] = True
        status['gpu']['name'] = parts[0] or None
        status['gpu']['totalVramMiB'] = int(parts[1]) if parts[1].isdigit() else None
        status['gpu']['usedVramMiB'] = int(parts[2]) if parts[2].isdigit() else None
        status['gpu']['utilizationGpuPercent'] = int(parts[3]) if parts[3].isdigit() else None
        status['gpu']['temperatureC'] = int(parts[4]) if parts[4].isdigit() else None
        status['gpu']['driverVersion'] = parts[5] or None
        total = status['gpu']['totalVramMiB']
        used = status['gpu']['usedVramMiB']
        status['gpu']['freeVramMiB'] = (total - used) if total is not None and used is not None else None

    rc2, cuda_out, _ = run("nvidia-smi | awk -F'CUDA Version: ' 'NR==3{print $2}' | awk '{print $1}'")
    if rc2 == 0 and cuda_out:
        status['gpu']['cudaVersion'] = cuda_out.strip() or None
else:
    status['gpu']['dockerAccessError'] = gpu_err or 'nvidia-smi unavailable'

rc, docker_gpu_out, docker_gpu_err = run("docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi >/dev/null 2>&1")
status['gpu']['dockerAccess'] = rc == 0
if rc != 0:
    status['gpu']['dockerAccessError'] = docker_gpu_err or 'Docker GPU access failed'

# Docker state
def inspect_container(name):
    rc, out, _ = run(f"docker inspect {shlex.quote(name)} --format '{{{{.State.Status}}}}|{{{{range $k, $v := .NetworkSettings.Networks}}}}{{{{$k}}}}{{{{end}}}}|{{{{json .NetworkSettings.Ports}}}}' 2>/dev/null")
    if rc != 0 or not out:
        return 'missing', None, None
    parts = out.split('|', 2)
    container_status = parts[0] if parts else 'unknown'
    network = parts[1] if len(parts) > 1 else None
    ports = parts[2] if len(parts) > 2 else None
    return container_status, network, ports

ollama_container_status, ollama_network, _ = inspect_container('ollama')
webui_container_status, webui_network, _ = inspect_container('open-webui')
vllm_container_status, vllm_network, vllm_ports = inspect_container(VLLM_SERVICE)

status['ollama']['containerStatus'] = ollama_container_status if ollama_container_status in {'running', 'exited'} else ('stopped' if ollama_container_status not in {'missing', 'unknown'} else ollama_container_status)
if status['ollama']['containerStatus'] == 'exited':
    status['ollama']['containerStatus'] = 'stopped'
status['docker']['network'] = webui_network or ollama_network
status['vllm']['containerStatus'] = vllm_container_status if vllm_container_status in {'running', 'missing', 'unknown'} else 'stopped'
if status['vllm']['containerStatus'] == 'exited':
    status['vllm']['containerStatus'] = 'stopped'

if vllm_ports and '8000/tcp' in vllm_ports and 'null' not in vllm_ports:
    status['docker']['publicExposureDetected'] = True

# Compose configuration check
rc, compose_check, _ = run(f"test -f {shlex.quote(COMPOSE_FILE)} && grep -q '^  {VLLM_SERVICE}:' {shlex.quote(COMPOSE_FILE)}")
status['vllm']['configuredInCompose'] = rc == 0
status['vllm']['composeServiceFound'] = rc == 0

# Ollama health and models
rc, ollama_health, ollama_health_err = run("docker exec ollama sh -lc 'wget -qO- http://127.0.0.1:11434/api/tags >/dev/null'")
status['ollama']['apiReachable'] = rc == 0
if rc != 0:
    status['ollama']['apiError'] = ollama_health_err or 'Ollama API not reachable'

rc, ollama_ps, ollama_ps_err = run("docker exec ollama ollama ps")
if rc == 0 and ollama_ps:
    lines = [line for line in ollama_ps.splitlines() if line.strip()]
    if len(lines) > 1:
        first = lines[1].split()
        if first:
            status['ollama']['residentModel'] = first[0]
        if len(first) >= 4:
            status['ollama']['residentSize'] = first[2]
            status['ollama']['residentProcessor'] = ' '.join(first[3:5]) if len(first) >= 5 else first[3]
        if len(first) >= 6:
            status['ollama']['residentContext'] = first[-2]
            status['ollama']['residentUntil'] = first[-1]

rc, ollama_list, _ = run("docker exec ollama ollama list")
if rc == 0 and ollama_list:
    model_names = []
    for line in ollama_list.splitlines()[1:]:
        stripped = line.strip()
        if not stripped:
            continue
        model_names.append(stripped.split()[0])
    status['ollama']['installedModels'] = model_names[:8]
    status['ollama']['installedCount'] = len(model_names)

status['actions']['canUnloadOllama'] = bool(status['ollama']['residentModel']) and status['ollama']['containerStatus'] == 'running'

# Open WebUI status
rc, webui_health, webui_err = run("docker exec open-webui sh -lc 'curl -sf http://127.0.0.1:8080/ >/dev/null'")
status['openWebUi']['reachable'] = rc == 0 and webui_container_status == 'running'
if rc != 0 and webui_container_status == 'running':
    status['openWebUi']['error'] = webui_err or 'Open WebUI health check failed'

rc, webui_env, _ = run("docker inspect open-webui --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null")
if rc == 0 and webui_env:
    env_map = {}
    for line in webui_env.splitlines():
        if '=' not in line:
            continue
        key, value = line.split('=', 1)
        env_map[key] = value
    base_urls = [entry.strip() for entry in env_map.get('OPENAI_API_BASE_URLS', '').split(';') if entry.strip()]
    keys = [entry.strip() for entry in env_map.get('OPENAI_API_KEYS', '').split(';') if entry.strip()]
    status['openWebUi']['providerBaseUrls'] = base_urls
    status['openWebUi']['providerKeysConfigured'] = len(keys)
    status['openWebUi']['ollamaProviderAvailable'] = env_map.get('OLLAMA_BASE_URL', '').startswith('http://ollama:11434')
    status['openWebUi']['vllmProviderConfigured'] = VLLM_ENDPOINT in base_urls

status['openWebUi']['vllmProviderUsable'] = status['openWebUi']['vllmProviderConfigured'] and status['vllm']['containerStatus'] == 'running'

# vLLM status
if status['vllm']['containerStatus'] == 'running':
    rc, models_out, models_err = run(f"docker exec open-webui sh -lc 'curl -sf {shlex.quote(VLLM_ENDPOINT)}/models >/dev/null'")
    status['vllm']['providerReachable'] = rc == 0
    if rc != 0:
        status['vllm']['providerError'] = models_err or 'vLLM API not reachable'

    rc, restart_count, _ = run(f"docker inspect {shlex.quote(VLLM_SERVICE)} --format '{{{{.RestartCount}}}}'")
    restart_count_value = int(restart_count) if restart_count.isdigit() else 0
    if restart_count_value > 0:
        status['vllm']['status'] = 'Failed'
        status['vllm']['lastError'] = f'Container restarted {restart_count_value} time(s).'
    elif status['vllm']['providerReachable']:
        status['vllm']['status'] = 'Running'
    else:
        status['vllm']['status'] = 'Starting'
elif status['vllm']['containerStatus'] == 'stopped':
    status['vllm']['status'] = 'Installed but stopped' if status['vllm']['configuredInCompose'] else 'Blocked'
elif status['vllm']['containerStatus'] == 'missing':
    status['vllm']['status'] = 'Blocked' if not status['vllm']['configuredInCompose'] else 'Not installed'
else:
    status['vllm']['status'] = 'Unknown'

if not status['vllm']['configuredInCompose']:
    status['vllm']['blockedReason'] = 'vLLM service is not configured in compose yet. Deployment remains intentionally blocked.'

if not status['gpu']['dockerAccess']:
    status['vllm']['status'] = 'Blocked'
    status['vllm']['blockedReason'] = status['gpu']['dockerAccessError'] or 'Docker GPU access unavailable'

free_vram = status['gpu']['freeVramMiB']
if free_vram is not None and free_vram < MIN_FREE_VRAM_MIB:
    status['actions']['startBlockedReason'] = f'Only {free_vram} MiB VRAM free. Minimum safe trial threshold is {MIN_FREE_VRAM_MIB} MiB.'
elif not status['gpu']['dockerAccess']:
    status['actions']['startBlockedReason'] = status['gpu']['dockerAccessError'] or 'Docker GPU access unavailable'
elif not status['vllm']['configuredInCompose']:
    status['actions']['startBlockedReason'] = status['vllm']['blockedReason']

status['actions']['canStartVllmTrial'] = status['actions']['startBlockedReason'] is None
status['actions']['canStopVllm'] = status['vllm']['containerStatus'] == 'running'
status['actions']['canRestoreOllama'] = status['ollama']['containerStatus'] == 'running' or status['vllm']['containerStatus'] == 'running'

if status['vllm']['configuredInCompose'] and status['vllm']['containerStatus'] in {'running', 'stopped'}:
    status['actions']['canConfigureOpenWebUiVllm'] = True
else:
    status['actions']['configureBlockedReason'] = 'Configure Open WebUI only after vLLM service is configured and the trial path is approved.'

resident_model = status['ollama']['residentModel']
vllm_running = status['vllm']['containerStatus'] == 'running'
ollama_running = status['ollama']['containerStatus'] == 'running'

if ollama_running and resident_model and not vllm_running:
    status['runtime']['activeRuntime'] = 'Ollama'
elif vllm_running and not resident_model:
    status['runtime']['activeRuntime'] = 'vLLM'
elif vllm_running and resident_model:
    status['runtime']['activeRuntime'] = 'Maintenance'
    status['runtime']['warning'] = 'GPU overcommit risk: Ollama still has a resident model while vLLM is running.'
elif ollama_running and not resident_model:
    status['runtime']['activeRuntime'] = 'Maintenance'
else:
    status['runtime']['activeRuntime'] = 'Unknown'

if free_vram is not None and free_vram < MIN_FREE_VRAM_MIB:
    status['runtime']['warning'] = status['runtime']['warning'] or 'Parallel 14B inference is not recommended on this 16GB GPU while Ollama is resident.'

print(json.dumps(status))
PY
}

emit_result() {
  local ok="$1"
  local action="$2"
  local message="$3"
  local status_json

  status_json="$(collect_status_json 2>/dev/null || true)"
  if [ -z "$status_json" ]; then
    status_json='{"checkedAt":null}'
  fi

  python3 - <<'PY' "$ok" "$action" "$message" "$status_json"
import json
import sys

ok_raw, action, message, status_raw = sys.argv[1:5]

try:
    status = json.loads(status_raw)
except Exception:
    status = {"checkedAt": None, "warning": "Status probe returned malformed JSON."}

print(json.dumps({
    "ok": ok_raw.lower() == "true",
    "action": action,
    "message": message,
    "status": status,
}))
PY
}

require_compose_vllm() {
  if ! test -f "$COMPOSE_FILE"; then
    emit_result false "$ACTION" "Compose file not found on host."
    exit 0
  fi

  if ! grep -q "^  $VLLM_SERVICE:" "$COMPOSE_FILE"; then
    emit_result false "$ACTION" "vLLM service is not configured in compose. Deployment remains blocked until explicitly approved."
    exit 0
  fi
}

case "$ACTION" in
  status)
    emit_result true status "AI runtime status refreshed."
    ;;
  ollama-unload-current)
    current_model="$(docker exec ollama ollama ps | awk 'NR==2 {print $1}')"
    if [ -z "$current_model" ]; then
      emit_result true ollama-unload-current "No resident Ollama model was loaded."
      exit 0
    fi
    docker exec ollama ollama stop "$current_model" >/dev/null
    emit_result true ollama-unload-current "Unloaded resident Ollama model: $current_model."
    ;;
  vllm-start)
    require_compose_vllm
    mkdir -p "$HF_CACHE_DIR"
    if [ -z "\${VLLM_API_KEY:-}" ]; then
      emit_result false vllm-start "VLLM_API_KEY is not configured on host."
      exit 0
    fi
    docker compose -f "$COMPOSE_FILE" up -d "$VLLM_SERVICE" >/dev/null 2>&1 || true
    sleep 5
    restart_count="$(docker inspect "$VLLM_SERVICE" --format '{{.RestartCount}}' 2>/dev/null || echo 0)"
    if [ "$restart_count" != "0" ]; then
      logs="$(docker logs --tail=40 "$VLLM_SERVICE" 2>&1 | tail -n 5 | tr '\n' ' ' | sed 's/"//g')"
      emit_result false vllm-start "vLLM started with restart activity: $logs"
      exit 0
    fi
    emit_result true vllm-start "vLLM trial start requested."
    ;;
  vllm-stop)
    require_compose_vllm
    docker compose -f "$COMPOSE_FILE" stop "$VLLM_SERVICE" >/dev/null 2>&1 || docker stop "$VLLM_SERVICE" >/dev/null 2>&1 || true
    emit_result true vllm-stop "vLLM trial stopped."
    ;;
  restore-ollama)
    if grep -q "^  $VLLM_SERVICE:" "$COMPOSE_FILE" 2>/dev/null; then
      docker compose -f "$COMPOSE_FILE" stop "$VLLM_SERVICE" >/dev/null 2>&1 || docker stop "$VLLM_SERVICE" >/dev/null 2>&1 || true
    else
      docker stop "$VLLM_SERVICE" >/dev/null 2>&1 || true
    fi
    docker start ollama >/dev/null 2>&1 || true
    emit_result true restore-ollama "Requested Ollama restore mode. vLLM was stopped if present."
    ;;
  openwebui-configure-vllm)
    require_compose_vllm
    emit_result false openwebui-configure-vllm "Open WebUI vLLM provider wiring is intentionally not auto-applied yet. Add the vLLM endpoint to OPENAI_API_BASE_URLS and OPENAI_API_KEYS during an approved maintenance window."
    ;;
  *)
    emit_result false "$ACTION" "Unsupported action."
    exit 0
    ;;
esac
`;
}

async function runAiRuntimeCommand(action: AiRuntimeAction): Promise<RawCommandPayload> {
  const output = await runRemoteScript(buildRemoteScript(action));
  return JSON.parse(output) as RawCommandPayload;
}

export async function getAiRuntimeStatus(): Promise<AiRuntimeStatus> {
  const result = await runAiRuntimeCommand('status');
  return result.status;
}

export async function runAiRuntimeAction(action: Exclude<AiRuntimeAction, 'status'>): Promise<AiRuntimeActionResult> {
  const result = await runAiRuntimeCommand(action);
  return {
    ok: result.ok,
    action: result.action,
    message: result.message,
    checkedAt: result.status.checkedAt,
    status: result.status,
  };
}

export const aiRuntimeMeta = {
  sshTarget: AI_RUNTIME_SSH_TARGET,
  vllmServiceName: VLLM_SERVICE_NAME,
  vllmModel: VLLM_MODEL,
  vllmEndpoint: VLLM_INTERNAL_ENDPOINT,
  minFreeVramMiBForTrial: MIN_FREE_VRAM_MIB_FOR_TRIAL,
};