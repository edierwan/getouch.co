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

type VllmOpenWebUiStatus = 'Not configured' | 'Configured' | 'Visible' | 'Working' | 'Failed' | 'Backend not ready' | 'Unknown';
type VllmOpenWebUiProviderState = 'unknown' | 'not_configured' | 'configured' | 'working' | 'failed' | 'backend_not_ready';
type VllmBackendState = 'running' | 'not_running' | 'not_deployed' | 'not_ready' | 'unknown';

type VllmUsageSummary = {
  requestsLast7Days: number;
  successRate7d: number | null;
  lastCheckedAt: string;
};

type VllmResourceUsage = {
  available: boolean;
  gpuMemoryPercent: number | null;
  gpuMemoryLabel: string;
  gpuUtilPercent: number | null;
  gpuUtilLabel: string;
  ramPercent: number | null;
  ramLabel: string;
};

export type VllmDashboardStatus = {
  checkedAt: string;
  gateway: GatewayStatus;
  runtime: AiRuntimeStatus;
  errors: string[];
  backendState: VllmBackendState;
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
    status: VllmOpenWebUiStatus;
    note: string;
  };
  providerBaseUrls: string[];
  providerApiKeysConfigured: boolean;
  openWebuiProviderStatus: VllmOpenWebUiProviderState;
  openWebuiProviderModels: string[];
  apiKeys: VllmKeyRow[];
  recentRequests: VllmRecentRequest[];
  usage: VllmUsageSummary;
  resourceUsage: VllmResourceUsage;
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

function sanitizeDashboardError(errorMessage: string | null | undefined) {
  if (!errorMessage) return null;
  const compact = errorMessage.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
}

function isCentralWiringPending(gatewayKeyCount: number, centralKeyCount: number) {
  return gatewayKeyCount > 0 && centralKeyCount === 0;
}

function defaultGatewayStatus(errorMessage: string | null): GatewayStatus {
  return {
    checkedAt: new Date().toISOString(),
    publicBaseUrl: 'https://vllm.getouch.co/v1',
    publicHealthUrl: 'https://vllm.getouch.co/health',
    publicReadyUrl: 'https://vllm.getouch.co/ready',
    docsUrl: 'https://portal.getouch.co/admin/service-endpoints/vllm#api-docs',
    status: 'Backend unavailable',
    enabled: true,
    backend: {
      type: 'vllm',
      baseUrl: VLLM_INTERNAL_BACKEND,
      ready: false,
      message: errorMessage || 'Gateway status unavailable.',
    },
    auth: {
      required: true,
      keyCount: 0,
      adminTestKeyConfigured: false,
    },
    exposure: {
      publicGateway: true,
      backendPrivate: true,
      backendDirectPublicExposure: false,
    },
    limits: {
      maxBodyBytes: 0,
      timeoutMs: 0,
      maxTokens: 0,
      rateLimitRequests: 0,
      rateLimitWindowSeconds: 0,
    },
    models: [
      {
        alias: VLLM_PUBLIC_ALIAS,
        backendModel: VLLM_INTERNAL_MODEL,
        type: 'chat',
        status: 'planned',
        notes: 'Gateway status unavailable.',
      },
    ],
    reservedDomains: {
      litellm: 'https://llm.getouch.co',
    },
  };
}

function normalizeGatewayStatus(gateway: GatewayStatus | null | undefined, errorMessage: string | null) {
  const fallback = defaultGatewayStatus(errorMessage);
  if (!gateway) return fallback;
  return {
    ...fallback,
    ...gateway,
    backend: {
      ...fallback.backend,
      ...gateway.backend,
    },
    auth: {
      ...fallback.auth,
      ...gateway.auth,
    },
    exposure: {
      ...fallback.exposure,
      ...gateway.exposure,
    },
    limits: {
      ...fallback.limits,
      ...gateway.limits,
    },
    models: Array.isArray(gateway.models) ? gateway.models : fallback.models,
    reservedDomains: {
      ...fallback.reservedDomains,
      ...gateway.reservedDomains,
    },
  };
}

function normalizeRuntimeStatus(runtime: AiRuntimeStatus | null | undefined, errorMessage: string | null) {
  const fallback = createFallbackRuntimeStatus(errorMessage);
  if (!runtime) return fallback;
  return {
    ...fallback,
    ...runtime,
    runtime: {
      ...fallback.runtime,
      ...runtime.runtime,
    },
    gpu: {
      ...fallback.gpu,
      ...runtime.gpu,
    },
    ollama: {
      ...fallback.ollama,
      ...runtime.ollama,
    },
    vllm: {
      ...fallback.vllm,
      ...runtime.vllm,
    },
    openWebUi: {
      ...fallback.openWebUi,
      ...runtime.openWebUi,
      providerBaseUrls: Array.isArray(runtime.openWebUi?.providerBaseUrls) ? runtime.openWebUi.providerBaseUrls : [],
    },
    docker: {
      ...fallback.docker,
      ...runtime.docker,
    },
    host: {
      ...fallback.host,
      ...runtime.host,
    },
    actions: {
      ...fallback.actions,
      ...runtime.actions,
    },
    links: {
      ...fallback.links,
      ...runtime.links,
    },
    commandPolicy: {
      ...fallback.commandPolicy,
      ...runtime.commandPolicy,
      allowedActions: Array.isArray(runtime.commandPolicy?.allowedActions)
        ? runtime.commandPolicy.allowedActions
        : fallback.commandPolicy.allowedActions,
    },
  };
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

function buildResourceUsage(runtime: AiRuntimeStatus): VllmResourceUsage {
  const totalGpu = runtime.gpu.totalVramMiB;
  const usedGpu = runtime.gpu.usedVramMiB;
  const gpuMemoryPercent = totalGpu !== null && usedGpu !== null && totalGpu > 0
    ? Math.round((usedGpu / totalGpu) * 100)
    : null;
  const totalRam = parseHumanSizeToBytes(runtime.host.memoryTotal);
  const usedRam = parseHumanSizeToBytes(runtime.host.memoryUsed);
  const ramPercent = totalRam !== null && usedRam !== null && totalRam > 0
    ? Math.round((usedRam / totalRam) * 100)
    : null;

  return {
    available: runtime.vllm.containerStatus === 'running',
    gpuMemoryPercent,
    gpuMemoryLabel: gpuMemoryPercent === null
      ? (runtime.vllm.containerStatus === 'running' ? 'Not available' : 'Backend not running')
      : `${formatBytes((usedGpu || 0) * 1024 * 1024)} / ${formatBytes((totalGpu || 0) * 1024 * 1024)}`,
    gpuUtilPercent: runtime.gpu.utilizationGpuPercent,
    gpuUtilLabel: runtime.gpu.utilizationGpuPercent === null
      ? (runtime.vllm.containerStatus === 'running' ? 'Not available' : 'Backend not running')
      : `${runtime.gpu.utilizationGpuPercent}%`,
    ramPercent,
    ramLabel: totalRam === null || usedRam === null
      ? (runtime.vllm.containerStatus === 'running' ? 'Not available' : 'Backend not running')
      : `${runtime.host.memoryUsed} / ${runtime.host.memoryTotal}`,
  };
}

function deriveBackendState(gateway: GatewayStatus, runtime: AiRuntimeStatus): VllmBackendState {
  if (runtime.vllm.containerStatus === 'running') return gateway.backend.ready ? 'running' : 'not_ready';
  if (runtime.vllm.containerStatus === 'missing') return 'not_deployed';
  if (runtime.vllm.containerStatus === 'stopped') return 'not_running';
  return gateway.backend.ready ? 'running' : 'unknown';
}

function toProviderState(status: VllmOpenWebUiStatus): VllmOpenWebUiProviderState {
  switch (status) {
    case 'Not configured':
      return 'not_configured';
    case 'Configured':
    case 'Visible':
      return 'configured';
    case 'Working':
      return 'working';
    case 'Failed':
      return 'failed';
    case 'Backend not ready':
      return 'backend_not_ready';
    default:
      return 'unknown';
  }
}

function normalizeOpenWebUiStatus(status: VllmDashboardStatus['openWebUi']['status'] | null | undefined): VllmOpenWebUiStatus {
  switch (status) {
    case 'Not configured':
    case 'Configured':
    case 'Visible':
    case 'Working':
    case 'Failed':
    case 'Backend not ready':
    case 'Unknown':
      return status;
    default:
      return 'Unknown';
  }
}

async function getSafeGatewayStatus() {
  try {
    return await getGatewayStatus();
  } catch (error) {
    return defaultGatewayStatus(sanitizeDashboardError(error instanceof Error ? error.message : 'Unable to load gateway status'));
  }
}

async function getSafeRemoteVllmIntrospection(): Promise<RemoteVllmIntrospection> {
  try {
    return await getRemoteVllmIntrospection();
  } catch {
    return {
      gatewayContainer: 'getouch-web',
      gatewayStartedAt: null,
      backendContainer: 'vllm-qwen3-14b-fp8',
      backendStartedAt: null,
      backendVersion: null,
    };
  }
}

async function getSafeVllmKeys() {
  try {
    return await listApiKeys();
  } catch {
    return [] as Awaited<ReturnType<typeof listApiKeys>>;
  }
}

async function getSafeUsageRows() {
  try {
    return await db
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
      .limit(50);
  } catch {
    return [] as Array<{
      id: string;
      createdAt: Date;
      keyPrefix: string | null;
      route: string | null;
      statusCode: number | null;
      latencyMs: number | null;
    }>;
  }
}

export function createDegradedVllmDashboardStatus(errorMessage?: string | null): VllmDashboardStatus {
  const message = sanitizeDashboardError(errorMessage) || 'Dashboard data is partially unavailable. Showing degraded status.';
  const gateway = defaultGatewayStatus(message);
  const runtime = createFallbackRuntimeStatus(message);
  const checkedAt = new Date().toISOString();
  const resourceUsage = buildResourceUsage(runtime);

  return {
    checkedAt,
    gateway,
    runtime,
    errors: [message],
    backendState: deriveBackendState(gateway, runtime),
    serviceInfo: {
      publicEndpoint: gateway.publicBaseUrl,
      internalBackend: VLLM_INTERNAL_BACKEND,
      modelInternal: VLLM_INTERNAL_MODEL,
      modelAlias: VLLM_PUBLIC_ALIAS,
      gatewayVersion: toGatewayVersion(),
      backendVersion: 'Not running',
      lastHealthCheck: gateway.checkedAt,
      gatewayStartedAt: null,
      backendStartedAt: null,
      pepper: getApiKeyPepperStatus(),
    },
    apiAccess: {
      centralKeyCount: 0,
      activeKeys: 0,
      revokedKeys: 0,
      expiredKeys: 0,
      envKeyCount: 0,
      envKeys: [],
      centralWiringPending: isCentralWiringPending(0, 0),
      requestsLast7Days: 0,
      successRate7d: null,
      keys: [],
      recentRequests: [],
    },
    openWebUi: {
      url: runtime.links.openWebUi,
      expectedTab: 'External',
      expectedModel: VLLM_PUBLIC_ALIAS,
      providerBaseUrl: gateway.publicBaseUrl,
      providerBaseUrls: [],
      status: 'Unknown',
      note: 'vLLM backend is not running yet. Open WebUI will not show getouch-qwen3-14b until /v1/models is available.',
    },
    providerBaseUrls: [],
    providerApiKeysConfigured: false,
    openWebuiProviderStatus: 'unknown',
    openWebuiProviderModels: [],
    apiKeys: [],
    recentRequests: [],
    usage: {
      requestsLast7Days: 0,
      successRate7d: null,
      lastCheckedAt: checkedAt,
    },
    resourceUsage,
  };
}

export function normalizeVllmDashboardStatus(input: Partial<VllmDashboardStatus> | null | undefined): VllmDashboardStatus {
  const firstError = sanitizeDashboardError(input?.errors?.[0]);
  const fallback = createDegradedVllmDashboardStatus(firstError);
  const gateway = normalizeGatewayStatus(input?.gateway, firstError);
  const runtime = normalizeRuntimeStatus(input?.runtime, firstError);
  const checkedAt = input?.checkedAt || gateway.checkedAt || runtime.checkedAt || fallback.checkedAt;
  const apiKeys = Array.isArray(input?.apiKeys)
    ? input.apiKeys
    : Array.isArray(input?.apiAccess?.keys)
      ? input.apiAccess.keys
      : [];
  const recentRequests = Array.isArray(input?.recentRequests)
    ? input.recentRequests
    : Array.isArray(input?.apiAccess?.recentRequests)
      ? input.apiAccess.recentRequests
      : [];
  const usage: VllmUsageSummary = {
    requestsLast7Days: input?.usage?.requestsLast7Days ?? input?.apiAccess?.requestsLast7Days ?? 0,
    successRate7d: input?.usage?.successRate7d ?? input?.apiAccess?.successRate7d ?? null,
    lastCheckedAt: input?.usage?.lastCheckedAt ?? checkedAt,
  };
  const resourceUsage = {
    ...buildResourceUsage(runtime),
    ...input?.resourceUsage,
  };
  const openWebUiStatus = normalizeOpenWebUiStatus(input?.openWebUi?.status);
  const providerBaseUrls = Array.isArray(input?.providerBaseUrls)
    ? input.providerBaseUrls
    : Array.isArray(input?.openWebUi?.providerBaseUrls)
      ? input.openWebUi.providerBaseUrls
      : [];
  const providerApiKeysConfigured = typeof input?.providerApiKeysConfigured === 'boolean'
    ? input.providerApiKeysConfigured
    : runtime.openWebUi.providerKeysConfigured > 0;
  const openWebUi = {
    url: input?.openWebUi?.url || runtime.links.openWebUi || fallback.openWebUi.url,
    expectedTab: 'External' as const,
    expectedModel: input?.openWebUi?.expectedModel || VLLM_PUBLIC_ALIAS,
    providerBaseUrl: input?.openWebUi?.providerBaseUrl || gateway.publicBaseUrl,
    providerBaseUrls,
    status: openWebUiStatus,
    note: input?.openWebUi?.note || fallback.openWebUi.note,
  };
  const errors = Array.isArray(input?.errors)
    ? input.errors.map((entry) => sanitizeDashboardError(entry)).filter((entry): entry is string => Boolean(entry))
    : fallback.errors;
  const backendState = input?.backendState || deriveBackendState(gateway, runtime);

  return {
    checkedAt,
    gateway,
    runtime,
    errors,
    backendState,
    serviceInfo: {
      ...fallback.serviceInfo,
      ...input?.serviceInfo,
      publicEndpoint: input?.serviceInfo?.publicEndpoint || gateway.publicBaseUrl,
      internalBackend: input?.serviceInfo?.internalBackend || VLLM_INTERNAL_BACKEND,
      modelInternal: input?.serviceInfo?.modelInternal || VLLM_INTERNAL_MODEL,
      modelAlias: input?.serviceInfo?.modelAlias || VLLM_PUBLIC_ALIAS,
      lastHealthCheck: input?.serviceInfo?.lastHealthCheck || gateway.checkedAt,
      pepper: input?.serviceInfo?.pepper || getApiKeyPepperStatus(),
    },
    apiAccess: {
      ...fallback.apiAccess,
      ...input?.apiAccess,
      envKeys: Array.isArray(input?.apiAccess?.envKeys) ? input.apiAccess.envKeys : fallback.apiAccess.envKeys,
      keys: apiKeys,
      recentRequests,
      requestsLast7Days: usage.requestsLast7Days,
      successRate7d: usage.successRate7d,
      centralKeyCount: input?.apiAccess?.centralKeyCount ?? apiKeys.length,
      activeKeys: input?.apiAccess?.activeKeys ?? apiKeys.filter((key) => key.status === 'active').length,
      revokedKeys: input?.apiAccess?.revokedKeys ?? apiKeys.filter((key) => key.status === 'revoked').length,
      expiredKeys: input?.apiAccess?.expiredKeys ?? apiKeys.filter((key) => key.status === 'expired').length,
      envKeyCount: input?.apiAccess?.envKeyCount ?? gateway.auth.keyCount,
    },
    openWebUi,
    providerBaseUrls,
    providerApiKeysConfigured,
    openWebuiProviderStatus: input?.openWebuiProviderStatus || toProviderState(openWebUiStatus),
    openWebuiProviderModels: Array.isArray(input?.openWebuiProviderModels) ? input.openWebuiProviderModels : [],
    apiKeys,
    recentRequests,
    usage,
    resourceUsage,
  };
}

function createFallbackRuntimeStatus(errorMessage: string | null): AiRuntimeStatus {
  return {
    checkedAt: new Date().toISOString(),
    runtime: {
      activeRuntime: 'Unknown',
      recommendedMode: 'Ollama primary / vLLM trial only',
      recommendedReason: 'Shared runtime probe unavailable; showing conservative fallback status.',
      warning: errorMessage || 'AI runtime probe unavailable. Falling back to gateway-only status.',
    },
    gpu: {
      available: false,
      name: null,
      totalVramMiB: null,
      usedVramMiB: null,
      freeVramMiB: null,
      utilizationGpuPercent: null,
      temperatureC: null,
      driverVersion: null,
      cudaVersion: null,
      dockerAccess: false,
      dockerAccessError: errorMessage,
    },
    ollama: {
      containerStatus: 'unknown',
      apiReachable: false,
      apiError: errorMessage,
      residentModel: null,
      residentProcessor: null,
      residentSize: null,
      residentContext: null,
      residentUntil: null,
      installedModels: [],
      installedCount: 0,
    },
    vllm: {
      status: 'Unknown',
      intendedModel: VLLM_INTERNAL_MODEL,
      intendedEndpoint: VLLM_INTERNAL_BACKEND,
      publicExposure: 'No',
      containerStatus: 'unknown',
      providerReachable: false,
      providerError: errorMessage,
      configuredInCompose: false,
      composeServiceFound: false,
      lastError: errorMessage,
      blockedReason: errorMessage,
    },
    openWebUi: {
      reachable: false,
      providerBaseUrls: [],
      providerKeysConfigured: 0,
      ollamaProviderAvailable: false,
      vllmProviderConfigured: false,
      vllmProviderUsable: false,
      error: errorMessage,
    },
    docker: {
      network: null,
      openWebUiContainer: 'open-webui',
      ollamaContainer: 'ollama',
      vllmContainer: 'vllm-qwen3-14b-fp8',
      publicExposureDetected: false,
    },
    host: {
      memoryTotal: null,
      memoryUsed: null,
      memoryAvailable: null,
      swapTotal: null,
      swapUsed: null,
      diskSrvFree: null,
    },
    actions: {
      canRefresh: true,
      canUnloadOllama: false,
      canStartVllmTrial: false,
      canStopVllm: false,
      canRestoreOllama: false,
      canConfigureOpenWebUiVllm: false,
      startBlockedReason: errorMessage,
      configureBlockedReason: errorMessage,
    },
    links: {
      openWebUi: 'https://ai.getouch.co',
      grafanaGpu: process.env.AI_RUNTIME_GRAFANA_GPU_URL || 'https://grafana.getouch.co',
    },
    commandPolicy: {
      mode: 'inline-fixed-commands',
      allowedActions: [
        'status',
        'ollama-unload-current',
        'vllm-start',
        'vllm-stop',
        'restore-ollama',
        'openwebui-configure-vllm',
      ],
    },
  };
}

async function getSafeAiRuntimeStatus(): Promise<AiRuntimeStatus> {
  try {
    return await getAiRuntimeStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load AI runtime status';
    return createFallbackRuntimeStatus(message);
  }
}

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
  const providerBaseUrls = Array.isArray(runtime.openWebUi.providerBaseUrls) ? runtime.openWebUi.providerBaseUrls : [];
  const configured = providerBaseUrls.includes(gateway.publicBaseUrl)
    || providerBaseUrls.includes(VLLM_INTERNAL_BACKEND);

  if (!runtime.openWebUi.reachable && runtime.openWebUi.error) {
    return {
      status: 'Unknown' as const,
      note: runtime.openWebUi.error,
    };
  }

  if (!runtime.openWebUi.reachable) {
    return {
      status: 'Unknown' as const,
      note: 'Open WebUI provider status is unknown right now.',
    };
  }

  if (!gateway.backend.ready && !configured) {
    return {
      status: 'Not configured' as const,
      note: 'vLLM backend is not running yet. Open WebUI will not show getouch-qwen3-14b until /v1/models is available.',
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
      note: 'vLLM backend is not running yet. Open WebUI will not show getouch-qwen3-14b until /v1/models is available.',
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
    getSafeGatewayStatus(),
    getSafeAiRuntimeStatus(),
    getSafeVllmKeys(),
    getSafeRemoteVllmIntrospection(),
    getSafeUsageRows(),
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
  const checkedAt = new Date().toISOString();

  return normalizeVllmDashboardStatus({
    checkedAt: new Date().toISOString(),
    gateway,
    runtime,
    errors: [],
    backendState: deriveBackendState(gateway, runtime),
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
      centralWiringPending: isCentralWiringPending(gateway.auth.keyCount, keys.length),
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
    providerBaseUrls: runtime.openWebUi.providerBaseUrls,
    providerApiKeysConfigured: runtime.openWebUi.providerKeysConfigured > 0,
    openWebuiProviderStatus: toProviderState(openWebUi.status),
    openWebuiProviderModels: gateway.backend.ready ? [VLLM_PUBLIC_ALIAS] : [],
    apiKeys: keys,
    recentRequests,
    usage: {
      requestsLast7Days: usageRows.length,
      successRate7d,
      lastCheckedAt: checkedAt,
    },
    resourceUsage: buildResourceUsage(runtime),
  });
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
