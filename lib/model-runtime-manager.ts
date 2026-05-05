import { spawn } from 'node:child_process';
import { aiRuntimeMeta, getAiRuntimeStatus } from './ai-runtime';
import { getGatewayStatus } from './ai-gateway';
import {
  DEFAULT_PLATFORM_LITELLM_INTERNAL_BASE_URL,
  DEFAULT_PLATFORM_LITELLM_MODEL_ALIAS,
  DEFAULT_PLATFORM_LITELLM_BASE_URL,
  getPlatformAiConfig,
  probeLiteLlmRoute,
} from './platform-ai';

const DEFAULT_SSH_DIR = process.env.HOME ? `${process.env.HOME}/.ssh` : '/home/nextjs/.ssh';
const AI_RUNTIME_SSH_TARGET = process.env.AI_RUNTIME_SSH_TARGET
  || process.env.INFRA_METRICS_SSH_TARGET
  || process.env.SHUTDOWN_DIAGNOSTIC_SSH_TARGET
  || 'deploy@100.84.14.93';
const AI_RUNTIME_SSH_KEY_PATH = process.env.AI_RUNTIME_SSH_KEY_PATH
  || process.env.INFRA_METRICS_SSH_KEY_PATH
  || `${DEFAULT_SSH_DIR}/id_ed25519`;
const AI_RUNTIME_SSH_KNOWN_HOSTS_PATH = process.env.AI_RUNTIME_SSH_KNOWN_HOSTS_PATH
  || process.env.INFRA_METRICS_SSH_KNOWN_HOSTS_PATH
  || `${DEFAULT_SSH_DIR}/known_hosts`;

const PLATFORM_BROKER_AI_CHAT_URL = 'https://getouch.co/api/platform/ai/chat';
const OPEN_WEBUI_URL = 'https://ai.getouch.co';
const GPU_METRICS_SOURCE = 'Server-side NVIDIA runtime probe via SSH; Grafana GPU dashboard remains secondary diagnostics.';

type ModelCatalogStatus = 'active' | 'ready' | 'not_downloaded' | 'incompatible';
type SwitchMode = 'manual' | 'automated';

type ApprovedModel = {
  modelId: string;
  displayName: string;
  publicAlias: string;
  estimatedVramMiB: number;
  notes: string;
};

type RemoteRuntimeInventory = {
  backendStartedAt: string | null;
  activeModelId: string | null;
  downloaded: Record<string, boolean>;
};

type IntegrationHealthCheck = {
  key: string;
  label: string;
  status: string;
  endpoint: string;
  detail: string;
  checkedAt: string;
};

export type ModelRuntimeManagerStatus = {
  checkedAt: string;
  sourceOfTruth: {
    brokerUrl: string;
    liteLlmPublicBaseUrl: string;
    liteLlmInternalBaseUrl: string;
    vllmPublicBaseUrl: string;
    vllmInternalBaseUrl: string;
    openWebUiUrl: string;
    gpuMetricsSource: string;
  };
  runtime: {
    status: 'Not deployed' | 'Starting' | 'Ready' | 'Failed' | 'Stopped';
    detail: string;
    activeModelId: string | null;
    activeModelDisplayName: string | null;
    publicAlias: string;
    lastHealthCheckAt: string;
    lastModelSwitchAt: string | null;
    switchMode: SwitchMode;
    switchModeDetail: string;
  };
  backendHealth: {
    status: 'Healthy' | 'Starting' | 'Stopped' | 'Not deployed' | 'Failed';
    detail: string;
  };
  liteLlm: {
    status: 'Ready' | 'Alias missing' | 'Manual action required' | 'Degraded' | 'Not configured';
    detail: string;
    healthOk: boolean;
    aliasFound: boolean;
    baseUrl: string;
    chatUrl: string;
    chatOk: boolean;
    chatStatusCode: number | null;
    chatMessage: string;
    models: string[];
  };
  openWebUi: {
    status: 'Working' | 'Configured' | 'Not configured' | 'Degraded' | 'Unknown';
    detail: string;
    url: string;
    providerBaseUrls: string[];
  };
  ollama: {
    status: 'Active' | 'Idle' | 'Stopped' | 'Missing' | 'Unknown';
    detail: string;
    residentModel: string | null;
    installedModels: string[];
    gpuConflict: boolean;
  };
  metrics: {
    gpuMemoryPercent: number | null;
    gpuMemoryLabel: string;
    gpuUtilizationPercent: number | null;
    gpuUtilizationLabel: string;
    ramPercent: number | null;
    ramLabel: string;
    swapPercent: number | null;
    swapLabel: string;
    lastCheckedAt: string;
  };
  integrationHealth: IntegrationHealthCheck[];
  modelCatalog: Array<{
    displayName: string;
    modelId: string;
    publicAlias: string;
    estimatedVram: string;
    cacheDir: string;
    status: ModelCatalogStatus;
    notes: string;
    manualSteps: string[];
  }>;
  controls: {
    canStart: boolean;
    canStop: boolean;
    canRestart: boolean;
    startDisabledReason: string | null;
    stopDisabledReason: string | null;
    restartDisabledReason: string | null;
  };
  diagnostics: {
    legacyGateway: {
      status: string;
      detail: string;
      publicBaseUrl: string;
      docsUrl: string;
    };
    runtimeWarnings: string[];
  };
};

export type ModelRuntimeSwitchResult = {
  ok: boolean;
  mode: SwitchMode;
  message: string;
  selectedModelId: string;
  manualSteps: string[];
  status: ModelRuntimeManagerStatus;
};

const APPROVED_MODELS: ApprovedModel[] = [
  {
    modelId: 'Qwen/Qwen3-14B-FP8',
    displayName: 'Qwen3 14B FP8',
    publicAlias: DEFAULT_PLATFORM_LITELLM_MODEL_ALIAS,
    estimatedVramMiB: 15000,
    notes: 'Primary production target on the current GPU, but only when Ollama is not holding the same VRAM window.',
  },
  {
    modelId: 'Qwen/Qwen2.5-7B-Instruct',
    displayName: 'Qwen2.5 7B Instruct',
    publicAlias: DEFAULT_PLATFORM_LITELLM_MODEL_ALIAS,
    estimatedVramMiB: 8500,
    notes: 'Safer fallback for the 16GB GPU when the 14B path is too tight.',
  },
  {
    modelId: 'Qwen/Qwen2.5-14B-Instruct-AWQ',
    displayName: 'Qwen2.5 14B Instruct AWQ',
    publicAlias: DEFAULT_PLATFORM_LITELLM_MODEL_ALIAS,
    estimatedVramMiB: 12000,
    notes: 'Quantized 14B option for the same public alias when validated on the live GPU.',
  },
  {
    modelId: 'Qwen/Qwen2.5-1.5B-Instruct',
    displayName: 'Qwen2.5 1.5B Instruct',
    publicAlias: DEFAULT_PLATFORM_LITELLM_MODEL_ALIAS,
    estimatedVramMiB: 3000,
    notes: 'Small test model for smoke checks when production GPU headroom is constrained.',
  },
];

function modelCacheDir(modelId: string) {
  return `/srv/apps/ai/huggingface/models--${modelId.replace(/\//g, '--')}`;
}

function formatMiB(value: number) {
  return `${(value / 1024).toFixed(value >= 10240 ? 1 : 2)} GiB`;
}

function parseHumanSizeToBytes(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([KMGTPE]?i?B?)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    K: 1024,
    KB: 1024,
    KI: 1024,
    KIB: 1024,
    M: 1024 ** 2,
    MB: 1024 ** 2,
    MI: 1024 ** 2,
    MIB: 1024 ** 2,
    G: 1024 ** 3,
    GB: 1024 ** 3,
    GI: 1024 ** 3,
    GIB: 1024 ** 3,
    T: 1024 ** 4,
    TB: 1024 ** 4,
    TI: 1024 ** 4,
    TIB: 1024 ** 4,
  };
  return amount * (multipliers[unit] || 1);
}

function formatBytes(value: number | null) {
  if (value === null) return 'Not available';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let index = 0;
  let size = value;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function singleQuoteShell(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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

async function getRemoteRuntimeInventory(): Promise<RemoteRuntimeInventory> {
  const modelSpecs = APPROVED_MODELS.map((model) => ({ modelId: model.modelId, cacheDir: modelCacheDir(model.modelId) }));
  const script = String.raw`
set -euo pipefail

VLLM_SERVICE=${singleQuoteShell(aiRuntimeMeta.vllmServiceName)}
MODEL_SPECS_JSON=${singleQuoteShell(JSON.stringify(modelSpecs))}
export VLLM_SERVICE MODEL_SPECS_JSON

python3 - <<'PY'
import json
import os
import subprocess
import urllib.request

service = os.environ['VLLM_SERVICE']
models = json.loads(os.environ['MODEL_SPECS_JSON'])

result = {
    'backendStartedAt': None,
    'activeModelId': None,
    'downloaded': {},
}

for entry in models:
    model_id = entry.get('modelId')
    cache_dir = entry.get('cacheDir')
    result['downloaded'][model_id] = bool(model_id and cache_dir and os.path.isdir(cache_dir))

inspect = subprocess.run(
    ['docker', 'inspect', service, '--format', '{{.State.Running}}|{{.State.StartedAt}}'],
    text=True,
    capture_output=True,
)

if inspect.returncode == 0 and inspect.stdout.strip():
    running, started_at = (inspect.stdout.strip().split('|', 1) + [''])[:2]
    result['backendStartedAt'] = started_at or None
    if running == 'true':
        query = subprocess.run(
            [
                'docker',
                'exec',
                service,
                'python3',
                '-c',
                (
                    "import json, urllib.request; "
                    "data = json.load(urllib.request.urlopen('http://127.0.0.1:8000/v1/models', timeout=8)); "
                    "print(json.dumps(data))"
                ),
            ],
            text=True,
            capture_output=True,
        )
        if query.returncode == 0 and query.stdout.strip():
            try:
                payload = json.loads(query.stdout)
                items = payload.get('data') if isinstance(payload, dict) else None
                if isinstance(items, list) and items:
                    first = items[0]
                    if isinstance(first, dict):
                        active = first.get('id')
                        if isinstance(active, str) and active.strip():
                            result['activeModelId'] = active.strip()
            except Exception:
                pass

print(json.dumps(result))
PY
`;

  try {
    const output = await runRemoteScript(script);
    return JSON.parse(output) as RemoteRuntimeInventory;
  } catch {
    return {
      backendStartedAt: null,
      activeModelId: null,
      downloaded: {},
    };
  }
}

function deriveRuntimeStatus(runtime: Awaited<ReturnType<typeof getAiRuntimeStatus>>) {
  if (runtime.vllm.status === 'Failed') {
    return {
      status: 'Failed' as const,
      detail: runtime.vllm.lastError || 'vLLM runtime is failing its restart or health checks.',
    };
  }
  if (runtime.vllm.containerStatus === 'running' && runtime.vllm.providerReachable) {
    return {
      status: 'Ready' as const,
      detail: 'vLLM backend is running and responding to the internal model probe.',
    };
  }
  if (runtime.vllm.containerStatus === 'running') {
    return {
      status: runtime.vllm.status === 'Starting' ? 'Starting' as const : 'Failed' as const,
      detail: runtime.vllm.providerError || 'vLLM container is running but the internal API is not ready yet.',
    };
  }
  if (runtime.vllm.containerStatus === 'stopped') {
    return {
      status: 'Stopped' as const,
      detail: 'vLLM service exists but is not running.',
    };
  }
  return {
    status: 'Not deployed' as const,
    detail: runtime.vllm.blockedReason || 'No live vLLM service is configured on the AI host.',
  };
}

function deriveBackendHealth(runtime: Awaited<ReturnType<typeof getAiRuntimeStatus>>) {
  if (runtime.vllm.containerStatus === 'running' && runtime.vllm.providerReachable) {
    return { status: 'Healthy' as const, detail: 'Internal /v1/models probe succeeded.' };
  }
  if (runtime.vllm.status === 'Failed') {
    return { status: 'Failed' as const, detail: runtime.vllm.lastError || 'vLLM restart activity indicates backend failure.' };
  }
  if (runtime.vllm.containerStatus === 'running') {
    return {
      status: runtime.vllm.status === 'Starting' ? 'Starting' as const : 'Failed' as const,
      detail: runtime.vllm.providerError || 'vLLM container is up but readiness is still failing.',
    };
  }
  if (runtime.vllm.containerStatus === 'stopped') {
    return { status: 'Stopped' as const, detail: 'vLLM backend is stopped.' };
  }
  return { status: 'Not deployed' as const, detail: runtime.vllm.blockedReason || 'No vLLM backend is deployed on the AI host.' };
}

function deriveOpenWebUiStatus(providerBaseUrls: string[], liteLlmBaseUrl: string, liteLlmStatus: ModelRuntimeManagerStatus['liteLlm']['status'], runtime: Awaited<ReturnType<typeof getAiRuntimeStatus>>) {
  const configured = runtime.openWebUi.liteLlmProviderConfigured
    || providerBaseUrls.includes(liteLlmBaseUrl)
    || providerBaseUrls.includes(DEFAULT_PLATFORM_LITELLM_INTERNAL_BASE_URL)
    || providerBaseUrls.some((entry) => /litellm/i.test(entry));

  if (!runtime.openWebUi.reachable && runtime.openWebUi.error) {
    return {
      status: 'Degraded' as const,
      detail: runtime.openWebUi.error,
    };
  }

  if (!runtime.openWebUi.reachable) {
    return {
      status: 'Unknown' as const,
      detail: 'OpenWebUI probe is unavailable right now.',
    };
  }

  if (!configured) {
    return {
      status: 'Not configured' as const,
      detail: 'OpenWebUI is still wired to Pipelines/OpenAI only. Add LiteLLM as an OpenAI-compatible provider when ready.',
    };
  }

  if (liteLlmStatus === 'Ready') {
    return {
      status: runtime.openWebUi.liteLlmProviderChatOk ? 'Working' as const : 'Configured' as const,
      detail: runtime.openWebUi.liteLlmProviderChatOk
        ? runtime.openWebUi.liteLlmProviderDetail || 'OpenWebUI can complete chat requests through LiteLLM.'
        : runtime.openWebUi.liteLlmProviderDetail || 'OpenWebUI points at LiteLLM, but the container-level provider path is not verified yet.',
    };
  }

  if (runtime.openWebUi.liteLlmProviderDetail) {
    return {
      status: runtime.openWebUi.liteLlmProviderChatOk ? 'Working' as const : 'Degraded' as const,
      detail: runtime.openWebUi.liteLlmProviderDetail,
    };
  }

  if (runtime.openWebUi.liteLlmProviderConfigured) {
    return {
      status: 'Configured' as const,
      detail: runtime.openWebUi.liteLlmProviderChatOk
        ? 'OpenWebUI can complete chat requests through LiteLLM.'
        : 'OpenWebUI has a LiteLLM provider entry, but the container-level probe has not confirmed chat completion yet.',
    };
  }

  return {
    status: 'Configured' as const,
    detail: 'OpenWebUI has a LiteLLM-compatible provider entry, but the active alias is not verified yet.',
  };
}

function buildMetrics(runtime: Awaited<ReturnType<typeof getAiRuntimeStatus>>) {
  const gpuMemoryPercent = runtime.gpu.totalVramMiB && runtime.gpu.usedVramMiB !== null
    ? Math.round((runtime.gpu.usedVramMiB / runtime.gpu.totalVramMiB) * 100)
    : null;
  const ramTotal = parseHumanSizeToBytes(runtime.host.memoryTotal);
  const ramUsed = parseHumanSizeToBytes(runtime.host.memoryUsed);
  const ramPercent = ramTotal && ramUsed ? Math.round((ramUsed / ramTotal) * 100) : null;
  const swapTotal = parseHumanSizeToBytes(runtime.host.swapTotal);
  const swapUsed = parseHumanSizeToBytes(runtime.host.swapUsed);
  const swapPercent = swapTotal && swapUsed ? Math.round((swapUsed / swapTotal) * 100) : null;

  return {
    gpuMemoryPercent,
    gpuMemoryLabel: runtime.gpu.totalVramMiB !== null && runtime.gpu.usedVramMiB !== null
      ? `${formatBytes(runtime.gpu.usedVramMiB * 1024 * 1024)} / ${formatBytes(runtime.gpu.totalVramMiB * 1024 * 1024)}`
      : 'Not available',
    gpuUtilizationPercent: runtime.gpu.utilizationGpuPercent,
    gpuUtilizationLabel: runtime.gpu.utilizationGpuPercent !== null ? `${runtime.gpu.utilizationGpuPercent}%` : 'Not available',
    ramPercent,
    ramLabel: runtime.host.memoryUsed && runtime.host.memoryTotal
      ? `${runtime.host.memoryUsed} / ${runtime.host.memoryTotal}`
      : 'Not available',
    swapPercent,
    swapLabel: runtime.host.swapUsed && runtime.host.swapTotal
      ? `${runtime.host.swapUsed} / ${runtime.host.swapTotal}`
      : 'Not available',
    lastCheckedAt: runtime.checkedAt,
  };
}

function liteLlmStatusLabel(status: Awaited<ReturnType<typeof probeLiteLlmRoute>>['status']): ModelRuntimeManagerStatus['liteLlm']['status'] {
  return status === 'ready'
    ? 'Ready'
    : status === 'route_missing'
      ? 'Alias missing'
      : status === 'manual_action_required'
        ? 'Manual action required'
        : status === 'not_configured'
          ? 'Not configured'
          : 'Degraded';
}

function createLiteLlmProbeFallback(config: ReturnType<typeof getPlatformAiConfig>, errorMessage: string) {
  const baseUrl = config.liteLlmBaseUrl || DEFAULT_PLATFORM_LITELLM_BASE_URL;
  return {
    checkedAt: new Date().toISOString(),
    baseUrl,
    healthUrl: `${baseUrl.replace(/\/v1$/, '')}/health/liveliness`,
    modelsUrl: `${baseUrl}/models`,
    chatUrl: `${baseUrl}/chat/completions`,
    healthOk: false,
    modelsOk: false,
    aliasFound: false,
    chatOk: false,
    chatStatusCode: null,
    status: config.liteLlmApiKey ? 'degraded' as const : 'manual_action_required' as const,
    models: [],
    message: errorMessage,
    chatMessage: errorMessage,
  };
}

function buildRuntimeWarnings(runtime: Awaited<ReturnType<typeof getAiRuntimeStatus>>, metrics: ModelRuntimeManagerStatus['metrics']) {
  const warnings: string[] = [];

  if (runtime.runtime.warning) {
    warnings.push(runtime.runtime.warning);
  }
  if (!runtime.vllm.configuredInCompose) {
    warnings.push('No host-side vLLM compose service is currently defined.');
  }
  if (metrics.swapPercent !== null && metrics.swapPercent >= 80) {
    warnings.push(`Swap usage is ${metrics.swapPercent}% (${metrics.swapLabel}). Keep only one heavy runtime active and stop the current vLLM process before switching models.`);
  }
  if (runtime.vllm.containerStatus === 'running') {
    warnings.push('Switch the production model by stopping the current vLLM runtime first. Do not overlap large model loads on this 16GB GPU.');
  }

  return warnings;
}

function buildIntegrationHealth(
  runtime: Awaited<ReturnType<typeof getAiRuntimeStatus>>,
  backendHealth: ModelRuntimeManagerStatus['backendHealth'],
  liteLlmProbe: Awaited<ReturnType<typeof probeLiteLlmRoute>>,
  liteLlmStatus: ModelRuntimeManagerStatus['liteLlm']['status'],
  openWebUi: ModelRuntimeManagerStatus['openWebUi'],
  ollama: ModelRuntimeManagerStatus['ollama'],
): IntegrationHealthCheck[] {
  const openWebUiLiteLlmEndpoint = runtime.openWebUi.liteLlmProviderBaseUrl
    || runtime.openWebUi.providerBaseUrls.find((entry) => entry.includes('litellm'))
    || OPEN_WEBUI_URL;

  const liteLlmChatStatus = liteLlmProbe.chatOk
    ? 'Working'
    : liteLlmProbe.status === 'manual_action_required'
      ? 'Manual action required'
      : liteLlmProbe.status === 'not_configured'
        ? 'Not configured'
        : liteLlmProbe.status === 'route_missing'
          ? 'Alias missing'
          : 'Degraded';

  return [
    {
      key: 'vllm-direct',
      label: 'vLLM direct API',
      status: backendHealth.status,
      endpoint: `${aiRuntimeMeta.vllmEndpoint}/models`,
      detail: backendHealth.detail,
      checkedAt: runtime.checkedAt,
    },
    {
      key: 'litellm-route',
      label: 'LiteLLM route',
      status: liteLlmStatus,
      endpoint: liteLlmProbe.modelsUrl,
      detail: liteLlmProbe.message,
      checkedAt: liteLlmProbe.checkedAt,
    },
    {
      key: 'litellm-chat',
      label: 'LiteLLM chat completion',
      status: liteLlmChatStatus,
      endpoint: liteLlmProbe.chatUrl,
      detail: liteLlmProbe.chatMessage,
      checkedAt: liteLlmProbe.checkedAt,
    },
    {
      key: 'openwebui-provider',
      label: 'OpenWebUI provider',
      status: openWebUi.status,
      endpoint: openWebUiLiteLlmEndpoint,
      detail: openWebUi.detail,
      checkedAt: runtime.checkedAt,
    },
    {
      key: 'dify-provider',
      label: 'Dify provider',
      status: 'Manual action required',
      endpoint: 'https://dify.getouch.co',
      detail: 'The portal cannot inspect Dify workflow-node provider bindings from this repo. Current operator evidence still shows provider missing: langgenius/openai/openai.',
      checkedAt: runtime.checkedAt,
    },
    {
      key: 'ollama-sandbox',
      label: 'Ollama sandbox',
      status: ollama.status,
      endpoint: 'http://ollama:11434',
      detail: ollama.detail,
      checkedAt: runtime.checkedAt,
    },
  ];
}

function buildSwitchModeDetail(runtime: Awaited<ReturnType<typeof getAiRuntimeStatus>>, liteLlmKeyPresent: boolean) {
  const reasons: string[] = [];

  if (!runtime.vllm.configuredInCompose) {
    reasons.push('The AI host does not currently have a vLLM service definition in /home/deploy/apps/getouch.co/compose.yaml.');
  }
  if (!liteLlmKeyPresent) {
    reasons.push('No server-side LiteLLM API key is configured for route verification or broker forwarding.');
  }

  reasons.push('The portal can control the fixed primary Qwen3 14B runtime, but arbitrary model switching remains gated until LiteLLM and the host compose path are parameterized per model.');

  return reasons.join(' ');
}

function buildManualSteps(model: ApprovedModel, status: ModelRuntimeManagerStatus) {
  return [
    `Unload any resident Ollama model before the switch if GPU memory is still occupied${status.ollama.residentModel ? ` (current resident model: ${status.ollama.residentModel})` : ''}.`,
    'Stop the current vLLM runtime before changing the backend model or LiteLLM alias. Do not overlap large model loads on this 16GB GPU.',
    `Create or update the host-side vLLM deployment so it serves ${model.modelId} on the internal runtime endpoint ${status.sourceOfTruth.vllmInternalBaseUrl}.`,
    `Ensure LiteLLM maps the stable public alias ${model.publicAlias} to the selected backend model ${model.modelId} using the server-side LiteLLM key only.`,
    `If OpenWebUI should expose the model for testing, wire it to a LiteLLM endpoint that the container can actually reach. Prefer a shared internal hostname over the public edge URL when available, and keep Ollama sandbox-only.`,
    'After the host-side changes, rerun the portal health checks until Runtime Status is Ready, LiteLLM Route is Ready, and LiteLLM Chat Completion is Working.',
  ];
}

export async function getModelRuntimeManagerStatus(): Promise<ModelRuntimeManagerStatus> {
  const config = getPlatformAiConfig();
  const [runtime, liteLlmProbe, gateway, remote] = await Promise.all([
    getAiRuntimeStatus(),
    probeLiteLlmRoute(config).catch((error) => createLiteLlmProbeFallback(
      config,
      error instanceof Error ? error.message : 'LiteLLM probe failed before the route status could be loaded.',
    )),
    getGatewayStatus().catch(() => null),
    getRemoteRuntimeInventory(),
  ]);

  const runtimeStatus = deriveRuntimeStatus(runtime);
  const backendHealth = deriveBackendHealth(runtime);
  const liteLlmStatus = liteLlmStatusLabel(liteLlmProbe.status);
  const switchMode: SwitchMode = 'manual';
  const switchModeDetail = buildSwitchModeDetail(runtime, Boolean(config.liteLlmApiKey));
  const activeModelId = remote.activeModelId || (runtime.vllm.containerStatus === 'running' ? runtime.vllm.intendedModel : null);
  const activeModelDisplayName = APPROVED_MODELS.find((model) => model.modelId === activeModelId)?.displayName || activeModelId;
  const openWebUi = {
    ...deriveOpenWebUiStatus(runtime.openWebUi.providerBaseUrls, config.liteLlmBaseUrl, liteLlmStatus, runtime),
    url: OPEN_WEBUI_URL,
    providerBaseUrls: runtime.openWebUi.providerBaseUrls,
  };
  const metrics = buildMetrics(runtime);
  const totalVramMiB = runtime.gpu.totalVramMiB;
  const controls = {
    canStart: runtime.actions.canStartVllmTrial,
    canStop: runtime.actions.canStopVllm,
    canRestart: runtime.vllm.configuredInCompose,
    startDisabledReason: runtime.actions.startBlockedReason,
    stopDisabledReason: runtime.actions.canStopVllm ? null : 'vLLM is not running.',
    restartDisabledReason: runtime.vllm.configuredInCompose
      ? null
      : runtime.vllm.blockedReason || 'No host-side vLLM service is configured yet.',
  };
  const ollama = {
    status: runtime.ollama.containerStatus === 'running'
      ? runtime.ollama.residentModel
        ? 'Active'
        : 'Idle'
      : runtime.ollama.containerStatus === 'stopped'
        ? 'Stopped'
        : runtime.ollama.containerStatus === 'missing'
          ? 'Missing'
          : 'Unknown',
    detail: runtime.ollama.residentModel
      ? `Sandbox resident model ${runtime.ollama.residentModel} is still holding GPU memory.`
      : runtime.ollama.containerStatus === 'running'
        ? 'Ollama sandbox is running without a resident model.'
        : 'Ollama sandbox is not actively holding GPU memory right now.',
    residentModel: runtime.ollama.residentModel,
    installedModels: runtime.ollama.installedModels,
    gpuConflict: Boolean(runtime.ollama.residentModel),
  } as const;
  const integrationHealth = buildIntegrationHealth(runtime, backendHealth, liteLlmProbe, liteLlmStatus, openWebUi, ollama);
  const runtimeWarnings = buildRuntimeWarnings(runtime, metrics);

  const modelCatalog = APPROVED_MODELS.map((model) => {
    const downloaded = Boolean(remote.downloaded[model.modelId]);
    const incompatible = totalVramMiB !== null && model.estimatedVramMiB > totalVramMiB;
    const isActive = activeModelId === model.modelId;
    const status: ModelCatalogStatus = isActive
      ? 'active'
      : incompatible
        ? 'incompatible'
        : downloaded
          ? 'ready'
          : 'not_downloaded';

    const notes = [model.notes];
    if (status === 'not_downloaded') {
      notes.push(`Model cache was not detected under ${modelCacheDir(model.modelId)}.`);
    }
    if (status === 'incompatible') {
      notes.push(`Estimated VRAM ${formatMiB(model.estimatedVramMiB)} exceeds the detected GPU capacity.`);
    }
    if (!isActive) {
      notes.push('Switching remains manual until a host-side vLLM service definition and LiteLLM route update mechanism are approved.');
    }

    return {
      displayName: model.displayName,
      modelId: model.modelId,
      publicAlias: model.publicAlias,
      estimatedVram: formatMiB(model.estimatedVramMiB),
      cacheDir: modelCacheDir(model.modelId),
      status,
      notes: notes.join(' '),
      manualSteps: buildManualSteps(model, {
        checkedAt: runtime.checkedAt,
        sourceOfTruth: {
          brokerUrl: PLATFORM_BROKER_AI_CHAT_URL,
          liteLlmPublicBaseUrl: config.liteLlmBaseUrl,
          liteLlmInternalBaseUrl: DEFAULT_PLATFORM_LITELLM_INTERNAL_BASE_URL,
          vllmPublicBaseUrl: gateway?.publicBaseUrl || DEFAULT_PLATFORM_LITELLM_BASE_URL,
          vllmInternalBaseUrl: aiRuntimeMeta.vllmEndpoint,
          openWebUiUrl: OPEN_WEBUI_URL,
          gpuMetricsSource: GPU_METRICS_SOURCE,
        },
        runtime: {
          status: runtimeStatus.status,
          detail: runtimeStatus.detail,
          activeModelId,
          activeModelDisplayName,
          publicAlias: config.modelAlias,
          lastHealthCheckAt: runtime.checkedAt,
          lastModelSwitchAt: remote.backendStartedAt,
          switchMode,
          switchModeDetail,
        },
        backendHealth,
        liteLlm: {
          status: liteLlmStatus,
          detail: liteLlmProbe.message,
          healthOk: liteLlmProbe.healthOk,
          aliasFound: liteLlmProbe.aliasFound,
          baseUrl: config.liteLlmBaseUrl,
          chatUrl: liteLlmProbe.chatUrl,
          chatOk: liteLlmProbe.chatOk,
          chatStatusCode: liteLlmProbe.chatStatusCode,
          chatMessage: liteLlmProbe.chatMessage,
          models: liteLlmProbe.models,
        },
        openWebUi: {
          status: openWebUi.status,
          detail: openWebUi.detail,
          url: openWebUi.url,
          providerBaseUrls: openWebUi.providerBaseUrls,
        },
        ollama,
        metrics,
        integrationHealth: [],
        modelCatalog: [],
        controls,
        diagnostics: {
          legacyGateway: {
            status: gateway?.status || 'Unavailable',
            detail: gateway?.backend.message || 'Legacy gateway diagnostics unavailable.',
            publicBaseUrl: gateway?.publicBaseUrl || DEFAULT_PLATFORM_LITELLM_BASE_URL,
            docsUrl: gateway?.docsUrl || 'https://portal.getouch.co/ai/vllm',
          },
          runtimeWarnings,
        },
      }),
    };
  });

  return {
    checkedAt: runtime.checkedAt,
    sourceOfTruth: {
      brokerUrl: PLATFORM_BROKER_AI_CHAT_URL,
      liteLlmPublicBaseUrl: config.liteLlmBaseUrl,
      liteLlmInternalBaseUrl: DEFAULT_PLATFORM_LITELLM_INTERNAL_BASE_URL,
      vllmPublicBaseUrl: gateway?.publicBaseUrl || 'https://vllm.getouch.co/v1',
      vllmInternalBaseUrl: aiRuntimeMeta.vllmEndpoint,
      openWebUiUrl: OPEN_WEBUI_URL,
      gpuMetricsSource: GPU_METRICS_SOURCE,
    },
    runtime: {
      status: runtimeStatus.status,
      detail: runtimeStatus.detail,
      activeModelId,
      activeModelDisplayName,
      publicAlias: config.modelAlias,
      lastHealthCheckAt: runtime.checkedAt,
      lastModelSwitchAt: remote.backendStartedAt,
      switchMode,
      switchModeDetail,
    },
    backendHealth,
    liteLlm: {
      status: liteLlmStatus,
      detail: liteLlmProbe.message,
      healthOk: liteLlmProbe.healthOk,
      aliasFound: liteLlmProbe.aliasFound,
      baseUrl: config.liteLlmBaseUrl,
      chatUrl: liteLlmProbe.chatUrl,
      chatOk: liteLlmProbe.chatOk,
      chatStatusCode: liteLlmProbe.chatStatusCode,
      chatMessage: liteLlmProbe.chatMessage,
      models: liteLlmProbe.models,
    },
    openWebUi: {
      status: openWebUi.status,
      detail: openWebUi.detail,
      url: openWebUi.url,
      providerBaseUrls: openWebUi.providerBaseUrls,
    },
    ollama,
    metrics,
    integrationHealth,
    modelCatalog,
    controls,
    diagnostics: {
      legacyGateway: {
        status: gateway?.status || 'Unavailable',
        detail: gateway?.backend.message || 'Legacy public vLLM gateway diagnostics unavailable.',
        publicBaseUrl: gateway?.publicBaseUrl || 'https://vllm.getouch.co/v1',
        docsUrl: gateway?.docsUrl || 'https://portal.getouch.co/ai/vllm',
      },
      runtimeWarnings,
    },
  };
}

export async function requestModelRuntimeSwitch(selectedModelId: string): Promise<ModelRuntimeSwitchResult> {
  const selected = APPROVED_MODELS.find((model) => model.modelId === selectedModelId);
  const status = await getModelRuntimeManagerStatus();

  if (!selected) {
    return {
      ok: false,
      mode: 'manual',
      message: 'Selected model is not in the approved runtime catalog.',
      selectedModelId,
      manualSteps: [],
      status,
    };
  }

  if (status.runtime.activeModelId === selected.modelId && status.runtime.status === 'Ready') {
    return {
      ok: true,
      mode: 'manual',
      message: `${selected.displayName} is already the active runtime model.`,
      selectedModelId,
      manualSteps: [],
      status,
    };
  }

  return {
    ok: false,
    mode: 'manual',
    message: 'Manual action required. The current host does not expose a safe, automated model-switch path for vLLM + LiteLLM routing.',
    selectedModelId,
    manualSteps: buildManualSteps(selected, status),
    status,
  };
}