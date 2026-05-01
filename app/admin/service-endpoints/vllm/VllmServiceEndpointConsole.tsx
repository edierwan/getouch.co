'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { SummaryGrid } from '../../ui';
import type { VllmDashboardStatus, VllmLogsResult, VllmQuickTestResult } from '@/lib/service-endpoints-vllm';

type SummaryCard = {
  label: string;
  value: string;
  detail?: string;
  tone?: 'healthy' | 'active' | 'warning';
  icon: string;
};

type QuickTestMap = {
  health?: VllmQuickTestResult;
  ready?: VllmQuickTestResult;
  models?: VllmQuickTestResult;
};

type ApiKeyDetail = {
  key: {
    id: string;
    name: string;
    environment: 'live' | 'test';
    keyPrefix: string;
    status: string;
    services: string[];
    scopes: string[];
    tenantId: string | null;
    createdAt: string;
    createdByEmail: string | null;
    expiresAt: string | null;
    lastUsedAt: string | null;
    notes: string | null;
  };
  usage: Array<{ id: string; route: string | null; statusCode: number | null; createdAt: string; latencyMs: number | null }>;
  audit: Array<{ id: string; action: string; createdAt: string; summary: string | null }>;
};

type DisplayKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  tenant: string;
  status: string;
  lastUsed: string;
  source: 'central' | 'env';
};

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
}

function formatAgo(value: string | null) {
  if (!value) return '—';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '—';
  const diffMinutes = Math.round((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function formatDurationSince(value: string | null) {
  if (!value) return '—';
  const started = new Date(value).getTime();
  if (!Number.isFinite(started)) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function parseHumanSize(value: string | null) {
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

function toneForGateway(status: VllmDashboardStatus['gateway']['status']) {
  if (status === 'Active') return 'active' as const;
  if (status === 'Ready') return 'healthy' as const;
  return 'warning' as const;
}

function toneForBackend(status: VllmDashboardStatus['runtime']['vllm']['status']) {
  if (status === 'Running') return 'active' as const;
  if (status === 'Installed but stopped') return 'healthy' as const;
  return 'warning' as const;
}

function toneForOpenWebUi(status: VllmDashboardStatus['openWebUi']['status']) {
  if (status === 'Working' || status === 'Visible') return 'active' as const;
  if (status === 'Configured') return 'healthy' as const;
  return 'warning' as const;
}

function statusClass(tone: 'healthy' | 'active' | 'warning') {
  return tone === 'warning'
    ? 'portal-status portal-status-warning'
    : tone === 'active'
      ? 'portal-status portal-status-active'
      : 'portal-status portal-status-good';
}

function meterStyle(percent: number | null) {
  const safePercent = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return {
    background: `conic-gradient(rgba(88, 215, 176, 0.95) ${safePercent}%, rgba(255, 255, 255, 0.08) ${safePercent}% 100%)`,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback: number | null = null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeDashboardPayload(payload: unknown): VllmDashboardStatus | null {
  const root = asRecord(payload);
  if (!root) return null;

  const checkedAt = asString(root.checkedAt, new Date().toISOString());
  const gateway = asRecord(root.gateway);
  const gatewayBackend = asRecord(gateway?.backend);
  const gatewayAuth = asRecord(gateway?.auth);
  const gatewayExposure = asRecord(gateway?.exposure);
  const gatewayLimits = asRecord(gateway?.limits);
  const gatewayReservedDomains = asRecord(gateway?.reservedDomains);
  const runtime = asRecord(root.runtime);
  const runtimeCore = asRecord(runtime?.runtime);
  const runtimeGpu = asRecord(runtime?.gpu);
  const runtimeOllama = asRecord(runtime?.ollama);
  const runtimeVllm = asRecord(runtime?.vllm);
  const runtimeOpenWebUi = asRecord(runtime?.openWebUi);
  const runtimeAssistant = asRecord(runtime?.assistant);
  const runtimeDocker = asRecord(runtime?.docker);
  const runtimeHost = asRecord(runtime?.host);
  const runtimeActions = asRecord(runtime?.actions);
  const runtimeLinks = asRecord(runtime?.links);
  const runtimeCommandPolicy = asRecord(runtime?.commandPolicy);
  const serviceInfo = asRecord(root.serviceInfo);
  const pepper = asRecord(serviceInfo?.pepper);
  const apiAccess = asRecord(root.apiAccess);
  const openWebUi = asRecord(root.openWebUi);
  const usage = asRecord(root.usage);
  const resourceUsage = asRecord(root.resourceUsage);
  const rawErrors = Array.isArray(root.errors) ? root.errors.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
  const normalizedProviderBaseUrls = asStringArray(root.providerBaseUrls).length
    ? asStringArray(root.providerBaseUrls)
    : asStringArray(openWebUi?.providerBaseUrls).length
      ? asStringArray(openWebUi?.providerBaseUrls)
      : asStringArray(runtimeOpenWebUi?.providerBaseUrls);
  const normalizedApiKeys = Array.isArray(root.apiKeys)
    ? root.apiKeys
    : Array.isArray(apiAccess?.keys)
      ? apiAccess.keys
      : [];
  const normalizedRecentRequests = Array.isArray(root.recentRequests)
    ? root.recentRequests
    : Array.isArray(apiAccess?.recentRequests)
      ? apiAccess.recentRequests
      : [];

  return {
    checkedAt,
    gateway: {
      checkedAt: asString(gateway?.checkedAt, checkedAt),
      publicBaseUrl: asString(gateway?.publicBaseUrl, 'https://vllm.getouch.co/v1'),
      publicHealthUrl: asString(gateway?.publicHealthUrl, 'https://vllm.getouch.co/health'),
      publicReadyUrl: asString(gateway?.publicReadyUrl, 'https://vllm.getouch.co/ready'),
      docsUrl: asString(gateway?.docsUrl, 'https://portal.getouch.co/ai-services/vllm#api-docs'),
      status: (gateway?.status === 'Ready' || gateway?.status === 'Active' || gateway?.status === 'Not configured' || gateway?.status === 'Backend unavailable') ? gateway.status : 'Backend unavailable',
      enabled: asBoolean(gateway?.enabled, true),
      backend: {
        type: gatewayBackend?.type === 'disabled' || gatewayBackend?.type === 'ollama' || gatewayBackend?.type === 'vllm' ? gatewayBackend.type : 'vllm',
        baseUrl: asNullableString(gatewayBackend?.baseUrl) || 'http://vllm-qwen3-14b-fp8:8000/v1',
        ready: asBoolean(gatewayBackend?.ready, false),
        message: asString(gatewayBackend?.message, 'Gateway backend is not ready.'),
      },
      auth: {
        required: true,
        keyCount: asNumber(gatewayAuth?.keyCount, 0) ?? 0,
        adminTestKeyConfigured: asBoolean(gatewayAuth?.adminTestKeyConfigured, false),
      },
      exposure: {
        publicGateway: true,
        backendPrivate: asBoolean(gatewayExposure?.backendPrivate, true),
        backendDirectPublicExposure: false,
      },
      limits: {
        maxBodyBytes: asNumber(gatewayLimits?.maxBodyBytes, 0) ?? 0,
        timeoutMs: asNumber(gatewayLimits?.timeoutMs, 0) ?? 0,
        maxTokens: asNumber(gatewayLimits?.maxTokens, 0) ?? 0,
        rateLimitRequests: asNumber(gatewayLimits?.rateLimitRequests, 0) ?? 0,
        rateLimitWindowSeconds: asNumber(gatewayLimits?.rateLimitWindowSeconds, 0) ?? 0,
      },
      models: Array.isArray(gateway?.models) ? gateway.models as VllmDashboardStatus['gateway']['models'] : [],
      reservedDomains: {
        litellm: asString(gatewayReservedDomains?.litellm, 'https://litellm.getouch.co'),
      },
    },
    runtime: {
      checkedAt: asString(runtime?.checkedAt, checkedAt),
      runtime: {
        activeRuntime: runtimeCore?.activeRuntime === 'Ollama' || runtimeCore?.activeRuntime === 'vLLM' || runtimeCore?.activeRuntime === 'Maintenance' || runtimeCore?.activeRuntime === 'Unknown'
          ? runtimeCore.activeRuntime
          : 'Unknown',
        recommendedMode: asString(runtimeCore?.recommendedMode, 'Ollama primary / vLLM trial only'),
        recommendedReason: asString(runtimeCore?.recommendedReason, 'Runtime probe unavailable.'),
        warning: asNullableString(runtimeCore?.warning),
      },
      gpu: {
        available: asBoolean(runtimeGpu?.available, false),
        name: asNullableString(runtimeGpu?.name),
        totalVramMiB: asNumber(runtimeGpu?.totalVramMiB),
        usedVramMiB: asNumber(runtimeGpu?.usedVramMiB),
        freeVramMiB: asNumber(runtimeGpu?.freeVramMiB),
        utilizationGpuPercent: asNumber(runtimeGpu?.utilizationGpuPercent),
        temperatureC: asNumber(runtimeGpu?.temperatureC),
        driverVersion: asNullableString(runtimeGpu?.driverVersion),
        cudaVersion: asNullableString(runtimeGpu?.cudaVersion),
        dockerAccess: asBoolean(runtimeGpu?.dockerAccess, false),
        dockerAccessError: asNullableString(runtimeGpu?.dockerAccessError),
      },
      ollama: {
        containerStatus: runtimeOllama?.containerStatus === 'running' || runtimeOllama?.containerStatus === 'stopped' || runtimeOllama?.containerStatus === 'missing' || runtimeOllama?.containerStatus === 'unknown'
          ? runtimeOllama.containerStatus
          : 'unknown',
        apiReachable: asBoolean(runtimeOllama?.apiReachable, false),
        apiError: asNullableString(runtimeOllama?.apiError),
        residentModel: asNullableString(runtimeOllama?.residentModel),
        residentProcessor: asNullableString(runtimeOllama?.residentProcessor),
        residentSize: asNullableString(runtimeOllama?.residentSize),
        residentContext: asNullableString(runtimeOllama?.residentContext),
        residentUntil: asNullableString(runtimeOllama?.residentUntil),
        installedModels: asStringArray(runtimeOllama?.installedModels),
        installedCount: asNumber(runtimeOllama?.installedCount, 0) ?? 0,
      },
      vllm: {
        status: runtimeVllm?.status === 'Not installed' || runtimeVllm?.status === 'Installed but stopped' || runtimeVllm?.status === 'Starting' || runtimeVllm?.status === 'Running' || runtimeVllm?.status === 'Failed' || runtimeVllm?.status === 'Blocked' || runtimeVllm?.status === 'Unknown'
          ? runtimeVllm.status
          : 'Unknown',
        intendedModel: asString(runtimeVllm?.intendedModel, 'Qwen/Qwen3-14B-FP8'),
        intendedEndpoint: asString(runtimeVllm?.intendedEndpoint, 'http://vllm-qwen3-14b-fp8:8000/v1'),
        publicExposure: 'No',
        containerStatus: runtimeVllm?.containerStatus === 'running' || runtimeVllm?.containerStatus === 'stopped' || runtimeVllm?.containerStatus === 'missing' || runtimeVllm?.containerStatus === 'unknown'
          ? runtimeVllm.containerStatus
          : 'unknown',
        providerReachable: asBoolean(runtimeVllm?.providerReachable, false),
        providerError: asNullableString(runtimeVllm?.providerError),
        configuredInCompose: asBoolean(runtimeVllm?.configuredInCompose, false),
        composeServiceFound: asBoolean(runtimeVllm?.composeServiceFound, false),
        lastError: asNullableString(runtimeVllm?.lastError),
        blockedReason: asNullableString(runtimeVllm?.blockedReason),
      },
      openWebUi: {
        reachable: asBoolean(runtimeOpenWebUi?.reachable, false),
        providerBaseUrls: normalizedProviderBaseUrls,
        providerKeysConfigured: asNumber(runtimeOpenWebUi?.providerKeysConfigured, 0) ?? 0,
        ollamaProviderAvailable: asBoolean(runtimeOpenWebUi?.ollamaProviderAvailable, false),
        vllmProviderConfigured: asBoolean(runtimeOpenWebUi?.vllmProviderConfigured, false),
        vllmProviderUsable: asBoolean(runtimeOpenWebUi?.vllmProviderUsable, false),
        error: asNullableString(runtimeOpenWebUi?.error),
      },
      assistant: {
        containerStatus: runtimeAssistant?.containerStatus === 'running' || runtimeAssistant?.containerStatus === 'stopped' || runtimeAssistant?.containerStatus === 'missing' || runtimeAssistant?.containerStatus === 'unknown'
          ? runtimeAssistant.containerStatus
          : 'unknown',
        reachable: asBoolean(runtimeAssistant?.reachable, false),
        defaultModelId: asNullableString(runtimeAssistant?.defaultModelId),
        models: Array.isArray(runtimeAssistant?.models)
          ? runtimeAssistant.models
            .map((entry) => asRecord(entry))
            .filter((entry): entry is Record<string, unknown> => Boolean(entry))
            .map((entry) => ({
              id: asString(entry.id, ''),
              displayName: asString(entry.displayName, asString(entry.id, 'Unknown assistant model')),
            }))
            .filter((entry) => entry.id.length > 0)
          : [],
        error: asNullableString(runtimeAssistant?.error),
      },
      docker: {
        network: asNullableString(runtimeDocker?.network),
        openWebUiContainer: asString(runtimeDocker?.openWebUiContainer, 'open-webui'),
        ollamaContainer: asString(runtimeDocker?.ollamaContainer, 'ollama'),
        vllmContainer: asString(runtimeDocker?.vllmContainer, 'vllm-qwen3-14b-fp8'),
        publicExposureDetected: asBoolean(runtimeDocker?.publicExposureDetected, false),
      },
      host: {
        memoryTotal: asNullableString(runtimeHost?.memoryTotal),
        memoryUsed: asNullableString(runtimeHost?.memoryUsed),
        memoryAvailable: asNullableString(runtimeHost?.memoryAvailable),
        swapTotal: asNullableString(runtimeHost?.swapTotal),
        swapUsed: asNullableString(runtimeHost?.swapUsed),
        diskSrvFree: asNullableString(runtimeHost?.diskSrvFree),
      },
      actions: {
        canRefresh: asBoolean(runtimeActions?.canRefresh, true),
        canUnloadOllama: asBoolean(runtimeActions?.canUnloadOllama, false),
        canStartVllmTrial: asBoolean(runtimeActions?.canStartVllmTrial, false),
        canStopVllm: asBoolean(runtimeActions?.canStopVllm, false),
        canRestoreOllama: asBoolean(runtimeActions?.canRestoreOllama, false),
        canConfigureOpenWebUiVllm: asBoolean(runtimeActions?.canConfigureOpenWebUiVllm, false),
        startBlockedReason: asNullableString(runtimeActions?.startBlockedReason),
        configureBlockedReason: asNullableString(runtimeActions?.configureBlockedReason),
      },
      links: {
        openWebUi: asString(runtimeLinks?.openWebUi, 'https://ai.getouch.co'),
        grafanaGpu: asString(runtimeLinks?.grafanaGpu, 'https://grafana.getouch.co'),
      },
      commandPolicy: {
        mode: 'inline-fixed-commands',
        allowedActions: Array.isArray(runtimeCommandPolicy?.allowedActions) ? runtimeCommandPolicy.allowedActions as VllmDashboardStatus['runtime']['commandPolicy']['allowedActions'] : ['status', 'ollama-unload-current', 'vllm-start', 'vllm-stop', 'restore-ollama', 'openwebui-configure-vllm'],
      },
    },
    errors: rawErrors,
    backendState: root.backendState === 'running' || root.backendState === 'not_running' || root.backendState === 'not_deployed' || root.backendState === 'not_ready' || root.backendState === 'unknown'
      ? root.backendState
      : 'unknown',
    serviceInfo: {
      publicEndpoint: asString(serviceInfo?.publicEndpoint, 'https://vllm.getouch.co/v1'),
      internalBackend: asString(serviceInfo?.internalBackend, 'http://vllm-qwen3-14b-fp8:8000/v1'),
      modelInternal: asString(serviceInfo?.modelInternal, 'Qwen/Qwen3-14B-FP8'),
      modelAlias: asString(serviceInfo?.modelAlias, 'getouch-qwen3-14b'),
      gatewayVersion: asNullableString(serviceInfo?.gatewayVersion),
      backendVersion: asString(serviceInfo?.backendVersion, 'Not running'),
      lastHealthCheck: asString(serviceInfo?.lastHealthCheck, checkedAt),
      gatewayStartedAt: asNullableString(serviceInfo?.gatewayStartedAt),
      backendStartedAt: asNullableString(serviceInfo?.backendStartedAt),
      pepper: {
        source: pepper?.source === 'central' || pepper?.source === 'auth_secret_legacy' || pepper?.source === 'dev_default'
          ? pepper.source
          : 'dev_default',
        algorithm: 'hmac-sha256',
        hashVersion: 1,
        pepperVersion: 1,
      },
    },
    apiAccess: {
      centralKeyCount: asNumber(apiAccess?.centralKeyCount, normalizedApiKeys.length) ?? normalizedApiKeys.length,
      activeKeys: asNumber(apiAccess?.activeKeys, 0) ?? 0,
      revokedKeys: asNumber(apiAccess?.revokedKeys, 0) ?? 0,
      expiredKeys: asNumber(apiAccess?.expiredKeys, 0) ?? 0,
      envKeyCount: asNumber(apiAccess?.envKeyCount, 0) ?? 0,
      envKeys: Array.isArray(apiAccess?.envKeys) ? apiAccess.envKeys as VllmDashboardStatus['apiAccess']['envKeys'] : [],
      centralWiringPending: asBoolean(apiAccess?.centralWiringPending, true),
      requestsLast7Days: asNumber(apiAccess?.requestsLast7Days, normalizedRecentRequests.length) ?? normalizedRecentRequests.length,
      successRate7d: asNumber(apiAccess?.successRate7d),
      keys: normalizedApiKeys as VllmDashboardStatus['apiAccess']['keys'],
      recentRequests: normalizedRecentRequests as VllmDashboardStatus['apiAccess']['recentRequests'],
    },
    openWebUi: {
      url: asString(openWebUi?.url, 'https://ai.getouch.co'),
      expectedTab: 'External',
      expectedModel: asString(openWebUi?.expectedModel, 'getouch-qwen3-14b'),
      providerBaseUrl: asString(openWebUi?.providerBaseUrl, 'https://vllm.getouch.co/v1'),
      providerBaseUrls: normalizedProviderBaseUrls,
      status: openWebUi?.status === 'Not configured' || openWebUi?.status === 'Configured' || openWebUi?.status === 'Visible' || openWebUi?.status === 'Working' || openWebUi?.status === 'Failed' || openWebUi?.status === 'Backend not ready' || openWebUi?.status === 'Unknown'
        ? openWebUi.status
        : 'Unknown',
      note: asString(openWebUi?.note, 'vLLM backend is not running yet. Open WebUI will not show getouch-qwen3-14b until /v1/models is available.'),
    },
    providerBaseUrls: normalizedProviderBaseUrls,
    providerApiKeysConfigured: asBoolean(root.providerApiKeysConfigured, (asNumber(runtimeOpenWebUi?.providerKeysConfigured, 0) ?? 0) > 0),
    openWebuiProviderStatus: root.openWebuiProviderStatus === 'unknown' || root.openWebuiProviderStatus === 'not_configured' || root.openWebuiProviderStatus === 'configured' || root.openWebuiProviderStatus === 'working' || root.openWebuiProviderStatus === 'failed' || root.openWebuiProviderStatus === 'backend_not_ready'
      ? root.openWebuiProviderStatus
      : 'unknown',
    openWebuiProviderModels: asStringArray(root.openWebuiProviderModels),
    apiKeys: normalizedApiKeys as VllmDashboardStatus['apiKeys'],
    recentRequests: normalizedRecentRequests as VllmDashboardStatus['recentRequests'],
    usage: {
      requestsLast7Days: asNumber(usage?.requestsLast7Days, asNumber(apiAccess?.requestsLast7Days, normalizedRecentRequests.length) ?? normalizedRecentRequests.length) ?? normalizedRecentRequests.length,
      successRate7d: asNumber(usage?.successRate7d, asNumber(apiAccess?.successRate7d)),
      lastCheckedAt: asString(usage?.lastCheckedAt, checkedAt),
    },
    resourceUsage: {
      available: asBoolean(resourceUsage?.available, false),
      gpuMemoryPercent: asNumber(resourceUsage?.gpuMemoryPercent),
      gpuMemoryLabel: asString(resourceUsage?.gpuMemoryLabel, 'Not available'),
      gpuUtilPercent: asNumber(resourceUsage?.gpuUtilPercent),
      gpuUtilLabel: asString(resourceUsage?.gpuUtilLabel, 'Not available'),
      ramPercent: asNumber(resourceUsage?.ramPercent),
      ramLabel: asString(resourceUsage?.ramLabel, 'Not available'),
    },
  };
}

export function VllmServiceEndpointConsole() {
  const [data, setData] = useState<VllmDashboardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [quickTests, setQuickTests] = useState<QuickTestMap>({});
  const [logState, setLogState] = useState<VllmLogsResult | null>(null);
  const [keyDetail, setKeyDetail] = useState<ApiKeyDetail | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{ title: string; plaintext: string; keyPrefix: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formTenant, setFormTenant] = useState('');
  const [formEnvironment, setFormEnvironment] = useState<'live' | 'test'>('live');
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function requestJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: 'no-store', ...init });
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, payload: payload as T | null };
  }

  async function loadDashboard() {
    const result = await requestJson<VllmDashboardStatus>('/api/admin/service-endpoints/vllm/status');
    const normalized = normalizeDashboardPayload(result.payload);
    if (!result.ok || !normalized) {
      throw new Error((result.payload as { error?: string } | null)?.error || 'Unable to load vLLM dashboard');
    }
    setData(normalized);
    setError(null);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadDashboard();
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load vLLM dashboard');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const displayKeys = useMemo<DisplayKeyRow[]>(() => {
    if (!data) return [];
    const central = data.apiAccess.keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      tenant: key.tenantId || 'Getouch',
      status: key.status,
      lastUsed: formatAgo(key.lastUsedAt ? key.lastUsedAt.toISOString() : null),
      source: 'central' as const,
    }));
    const env = data.apiAccess.envKeys.map((key) => ({
      id: `env:${key.prefix}`,
      name: key.label,
      keyPrefix: key.prefix,
      tenant: 'Env-managed',
      status: 'active',
      lastUsed: '—',
      source: 'env' as const,
    }));
    return [...env, ...central];
  }, [data]);

  const resourceUsage = useMemo(() => {
    return data?.resourceUsage || {
      available: false,
      gpuMemoryPercent: null,
      gpuMemoryLabel: 'Not available',
      gpuUtilPercent: null,
      gpuUtilLabel: 'Not available',
      ramPercent: null,
      ramLabel: 'Not available',
    };
  }, [data]);

  const backendBlocker = useMemo(() => {
    if (!data) return null;
    return data.runtime.actions.startBlockedReason
      || data.runtime.vllm.blockedReason
      || data.runtime.runtime.warning
      || null;
  }, [data]);

  const maintenanceBlockReason = useMemo(() => {
    if (!data) return null;
    const ollamaResident = data.runtime.ollama.containerStatus === 'running' && Boolean(data.runtime.ollama.residentModel);
    const vllmUndeployed = data.runtime.vllm.containerStatus === 'missing' || !data.runtime.vllm.configuredInCompose;
    return ollamaResident && vllmUndeployed
      ? 'Ollama is currently consuming VRAM; vLLM backend is not deployed/wired yet.'
      : null;
  }, [data]);

  const vllmPlannedNotDeployed = useMemo(() => {
    if (!data) return true;
    return data.runtime.vllm.containerStatus === 'missing' || !data.runtime.vllm.configuredInCompose;
  }, [data]);

  const currentProviderNote = useMemo(() => {
    if (!data) return 'Open WebUI models are currently not served by vLLM.';
    const usesAssistantPipelines = data.openWebUi.providerBaseUrls.some((url) => url.includes('pipelines'));
    return usesAssistantPipelines
      ? 'Open WebUI models are currently served by Ollama and assistant/pipeline providers, not vLLM.'
      : 'Open WebUI models are currently served by Ollama, not vLLM.';
  }, [data]);

  const summaryCards = useMemo<SummaryCard[]>(() => {
    if (!data) return [];

    const uptimeStartedAt = data.serviceInfo.backendStartedAt || data.serviceInfo.gatewayStartedAt;
    const uptimeLabel = data.serviceInfo.backendStartedAt
      ? `Backend since ${formatDateTime(data.serviceInfo.backendStartedAt)}`
      : data.serviceInfo.gatewayStartedAt
        ? `Gateway since ${formatDateTime(data.serviceInfo.gatewayStartedAt)}`
        : 'No uptime source available';

    return [
      {
        label: 'STATUS',
        value: vllmPlannedNotDeployed ? 'Planned' : data.gateway.backend.ready ? 'Healthy' : data.gateway.enabled ? 'Degraded' : 'Not Configured',
        detail: vllmPlannedNotDeployed ? 'Awaiting approved deployment' : `/ready: ${data.gateway.backend.ready ? '200' : '503'}`,
        tone: vllmPlannedNotDeployed ? 'warning' : toneForGateway(data.gateway.status),
        icon: '◉',
      },
      {
        label: 'BACKEND',
        value: vllmPlannedNotDeployed
          ? 'Not Deployed'
          : data.runtime.vllm.status === 'Running'
          ? 'Running'
          : data.runtime.vllm.containerStatus === 'missing'
            ? 'Not Deployed'
            : data.runtime.vllm.status,
        detail: vllmPlannedNotDeployed ? currentProviderNote : maintenanceBlockReason || backendBlocker || data.runtime.docker.vllmContainer,
        tone: vllmPlannedNotDeployed ? 'warning' : toneForBackend(data.runtime.vllm.status),
        icon: '▣',
      },
      {
        label: 'MODEL ALIAS',
        value: data.serviceInfo.modelAlias,
        detail: data.serviceInfo.modelInternal,
        tone: 'active',
        icon: '◎',
      },
      {
        label: 'UPTIME',
        value: vllmPlannedNotDeployed ? 'N/A' : formatDurationSince(uptimeStartedAt),
        detail: vllmPlannedNotDeployed ? 'Backend not deployed' : uptimeLabel,
        tone: vllmPlannedNotDeployed ? 'warning' : uptimeStartedAt ? 'healthy' : 'warning',
        icon: '⏱',
      },
      {
        label: 'TOTAL REQUESTS',
        value: vllmPlannedNotDeployed ? 'N/A' : String(data.apiAccess.requestsLast7Days),
        detail: vllmPlannedNotDeployed ? 'Backend not deployed' : 'Last 7 days',
        tone: vllmPlannedNotDeployed ? 'warning' : data.apiAccess.requestsLast7Days > 0 ? 'active' : 'warning',
        icon: '↺',
      },
      {
        label: 'SUCCESS RATE',
        value: vllmPlannedNotDeployed ? 'N/A' : data.apiAccess.successRate7d === null ? 'No data' : `${data.apiAccess.successRate7d}%`,
        detail: vllmPlannedNotDeployed ? 'Backend not deployed' : 'Last 7 days',
        tone: vllmPlannedNotDeployed ? 'warning' : data.apiAccess.successRate7d !== null && data.apiAccess.successRate7d >= 99 ? 'healthy' : 'warning',
        icon: '◔',
      },
    ];
  }, [backendBlocker, currentProviderNote, data, maintenanceBlockReason, vllmPlannedNotDeployed]);

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
      setError(null);
    } catch {
      setError(`Unable to copy ${label.toLowerCase()}.`);
    }
  }

  async function runQuickTest(kind: 'health' | 'ready' | 'models') {
    startTransition(async () => {
      const result = await requestJson<VllmQuickTestResult>(`/api/admin/service-endpoints/vllm/test-${kind}`, { method: 'POST' });
      const payload = result.payload || {
        ok: false,
        checkedAt: new Date().toISOString(),
        statusCode: result.status,
        message: `Test failed with status ${result.status}`,
      };
      setQuickTests((current) => ({ ...current, [kind]: payload }));
      if (result.ok) {
        setMessage(payload.message);
        setError(null);
      } else {
        setError(payload.message);
      }
      try {
        await loadDashboard();
      } catch {
        // Preserve existing dashboard state if reload fails.
      }
    });
  }

  async function openLogs(source: 'gateway' | 'backend') {
    startTransition(async () => {
      const result = await requestJson<VllmLogsResult>(`/api/admin/service-endpoints/vllm/logs/${source}`);
      if (result.payload) {
        setLogState(result.payload);
        if (!result.ok) {
          setError(result.payload.message);
        }
      } else {
        setLogState({
          source,
          available: false,
          checkedAt: new Date().toISOString(),
          container: null,
          lines: [],
          message: `Unable to load ${source} logs.`,
        });
      }
    });
  }

  async function viewKey(id: string) {
    startTransition(async () => {
      const result = await requestJson<ApiKeyDetail>(`/api/admin/api-keys/${id}`);
      if (result.ok && result.payload) {
        setKeyDetail(result.payload);
      } else {
        setError('Unable to load API key details.');
      }
    });
  }

  async function mutateKey(id: string, action: 'rotate' | 'revoke') {
    const confirmed = window.confirm(action === 'rotate'
      ? 'Rotate this API key? The new key will be shown once.'
      : 'Revoke this API key? Existing clients will stop working.');
    if (!confirmed) return;

    startTransition(async () => {
      const result = await requestJson<{ ok: boolean; plaintext?: string; key?: { keyPrefix: string } }>(`/api/admin/api-keys/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!result.ok || !result.payload) {
        setError(`Unable to ${action} API key.`);
        return;
      }
      if (action === 'rotate' && result.payload.plaintext && result.payload.key?.keyPrefix) {
        setRevealedSecret({ title: 'Rotated API Key', plaintext: result.payload.plaintext, keyPrefix: result.payload.key.keyPrefix });
      }
      setMessage(action === 'rotate' ? 'API key rotated.' : 'API key revoked.');
      await loadDashboard();
    });
  }

  async function submitCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    if (!formName.trim()) {
      setFormError('Key name is required.');
      return;
    }
    if (formEnvironment === 'live' && data.serviceInfo.pepper.source !== 'central') {
      setFormError('CENTRAL_API_KEY_PEPPER must be configured before creating live keys.');
      return;
    }

    startTransition(async () => {
      const result = await requestJson<{ ok: boolean; plaintext: string; key: { keyPrefix: string } }>('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          environment: formEnvironment,
          tenantId: formTenant.trim() || null,
          services: ['ai'],
          scopes: ['ai:chat', 'ai:models', 'model:getouch-qwen3-14b'],
        }),
      });
      if (!result.ok || !result.payload) {
        setFormError((result.payload as { error?: string } | null)?.error || 'Unable to create API key.');
        return;
      }
      setRevealedSecret({ title: 'New API Key', plaintext: result.payload.plaintext, keyPrefix: result.payload.key.keyPrefix });
      setFormName('');
      setFormTenant('');
      setFormEnvironment('live');
      setFormError(null);
      setCreateOpen(false);
      setMessage('API key created. Plaintext shown once only.');
      await loadDashboard();
    });
  }

  if (loading) {
    return <section className="portal-panel">Loading vLLM Gateway dashboard…</section>;
  }

  if (error && !data) {
    return <section className="portal-panel">{error}</section>;
  }

  if (!data) {
    return <section className="portal-panel">Unable to load vLLM Gateway dashboard.</section>;
  }

  const headerStatus = vllmPlannedNotDeployed
    ? 'Planned'
    : !data.gateway.enabled || data.gateway.auth.keyCount === 0
      ? 'Not Configured'
    : data.gateway.backend.ready
      ? 'Active'
      : data.runtime.vllm.containerStatus === 'missing'
        ? 'Backend Down'
        : 'Degraded';

  const cUrlExample = `curl -X POST https://vllm.getouch.co/v1/chat/completions \\
  -H "Authorization: Bearer <GETOUCH_VLLM_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "getouch-qwen3-14b",
    "messages": [
      {
        "role": "user",
        "content": "Hello"
      }
    ],
    "temperature": 0.2
  }'`;

  return (
    <>
      <div className="portal-ai-runtime-shell portal-vllm-shell">
        <div className="portal-vllm-breadcrumb">
            <span className="portal-vllm-breadcrumb-muted">AI Services</span>
          <span className="portal-vllm-breadcrumb-sep">/</span>
            <span className="portal-vllm-breadcrumb-active">vLLM Gateway</span>
        </div>

        {error ? <div className="portal-ai-error">{error}</div> : null}
        {message ? <div className="portal-ai-success">{message}</div> : null}

        {data.serviceInfo.pepper.source !== 'central' ? (
          <div className="portal-warning-box">
            <div className="portal-warning-title">Critical configuration warning</div>
            <ul className="portal-warning-list">
              <li>CENTRAL_API_KEY_PEPPER is not in dedicated mode.</li>
              <li>Live API key creation is blocked until the dedicated pepper is configured.</li>
            </ul>
          </div>
        ) : null}

        <section className="portal-panel portal-panel-fill">
          <div className="portal-panel-head portal-panel-head-inline">
            <div>
              <h3 className="portal-panel-title">vLLM Gateway</h3>
              <p className="portal-page-sub">Admin and control UI for the protected public endpoint at {data.serviceInfo.publicEndpoint}. Raw vLLM stays private.</p>
            </div>
            <div className="portal-action-row">
              <span className={statusClass(headerStatus === 'Active' ? 'healthy' : 'warning')}>{headerStatus}</span>
              <a href="#api-docs" className="portal-action-link">API Docs</a>
              <button type="button" className="portal-action-link" onClick={() => setCreateOpen(true)}>Add API Key</button>
            </div>
          </div>
        </section>

        <SummaryGrid cards={summaryCards} />

        <div className="portal-vllm-grid">
          <section className="portal-panel portal-panel-fill">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Service Information</h3>
                <p className="portal-page-sub">Current public endpoint, internal backend, model mapping, and deployed gateway metadata.</p>
              </div>
            </div>
            <div className="portal-info-table">
              <div className="portal-info-table-row"><span className="portal-info-table-label">Public Endpoint</span><span className="portal-info-table-value"><span className="portal-vllm-inline-copy">{data.serviceInfo.publicEndpoint}<button type="button" className="portal-action-link" onClick={() => void copyText(data.serviceInfo.publicEndpoint, 'Public endpoint')}>Copy</button></span></span></div>
              {vllmPlannedNotDeployed ? (
                <div className="portal-info-table-row"><span className="portal-info-table-label" /><span className="portal-info-table-value portal-page-sub">Public endpoint reserved, pending approved deployment.</span></div>
              ) : null}
              <div className="portal-info-table-row"><span className="portal-info-table-label">{vllmPlannedNotDeployed ? 'Planned Internal Backend' : 'Internal Backend'}</span><span className="portal-info-table-value"><span className="portal-vllm-inline-copy">{data.serviceInfo.internalBackend}<button type="button" className="portal-action-link" onClick={() => void copyText(data.serviceInfo.internalBackend, 'Internal backend')}>Copy</button></span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Model (Internal)</span><span className="portal-info-table-value">{data.serviceInfo.modelInternal}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">{vllmPlannedNotDeployed ? 'Planned Public Model Alias' : 'Model Alias (Public)'}</span><span className="portal-info-table-value"><span className="portal-vllm-inline-copy">{data.serviceInfo.modelAlias}<button type="button" className="portal-action-link" onClick={() => void copyText(data.serviceInfo.modelAlias, 'Model alias')}>Copy</button></span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Gateway Version</span><span className="portal-info-table-value">{data.serviceInfo.gatewayVersion || 'Unknown'}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Backend Version</span><span className="portal-info-table-value">{data.serviceInfo.backendVersion}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Last Health Check</span><span className="portal-info-table-value">{formatDateTime(data.serviceInfo.lastHealthCheck)}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">CENTRAL_API_KEY_PEPPER</span><span className="portal-info-table-value">{data.serviceInfo.pepper.source === 'central' ? 'Configured (Central)' : data.serviceInfo.pepper.source === 'auth_secret_legacy' ? 'Legacy AUTH_SECRET' : 'Missing / Dev default'}</span></div>
            </div>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">{vllmPlannedNotDeployed ? 'Resource Usage (AI Host)' : 'Resource Usage (Backend)'}</h3>
                <p className="portal-page-sub">{vllmPlannedNotDeployed ? 'Host metrics are available. vLLM gateway runtime is not deployed yet.' : 'Real GPU and host memory metrics from the AI runtime probe.'}</p>
              </div>
            </div>
            <div className="portal-vllm-meter-grid">
              <div className="portal-vllm-meter-card">
                <div className="portal-vllm-meter-ring" style={meterStyle(resourceUsage.gpuMemoryPercent)}><span>{resourceUsage.gpuMemoryPercent === null ? '—' : `${resourceUsage.gpuMemoryPercent}%`}</span></div>
                <div className="portal-vllm-meter-title">GPU Memory</div>
                <div className="portal-vllm-meter-sub">{resourceUsage.gpuMemoryLabel}</div>
              </div>
              <div className="portal-vllm-meter-card">
                <div className="portal-vllm-meter-ring" style={meterStyle(resourceUsage.gpuUtilPercent)}><span>{resourceUsage.gpuUtilPercent === null ? '—' : `${resourceUsage.gpuUtilPercent}%`}</span></div>
                <div className="portal-vllm-meter-title">GPU Utilization</div>
                <div className="portal-vllm-meter-sub">{resourceUsage.gpuUtilLabel}</div>
              </div>
              <div className="portal-vllm-meter-card">
                <div className="portal-vllm-meter-ring" style={meterStyle(resourceUsage.ramPercent)}><span>{resourceUsage.ramPercent === null ? '—' : `${resourceUsage.ramPercent}%`}</span></div>
                <div className="portal-vllm-meter-title">RAM Usage</div>
                <div className="portal-vllm-meter-sub">{resourceUsage.ramLabel}</div>
              </div>
            </div>
            <p className="portal-page-sub">Last checked {formatDateTime(data.checkedAt)}. If the backend is not running, these values may be unavailable.</p>
          </section>
        </div>

        <div className="portal-vllm-grid">
          <section id="api-access" className="portal-panel portal-panel-fill">
            <div className="portal-panel-head portal-panel-head-inline">
              <div>
                <h3 className="portal-panel-title">API Access</h3>
                <p className="portal-page-sub">Central API key inventory for AI scopes. Full key material is never shown here.</p>
              </div>
              <button type="button" className="portal-action-link" onClick={() => setCreateOpen(true)}>Add API Key</button>
            </div>
            {data.apiAccess.centralWiringPending ? (
              <div className="portal-warning-box" style={{ marginBottom: '1rem' }}>
                <div className="portal-warning-title">Central key wiring pending</div>
                <ul className="portal-warning-list">
                  <li>vLLM gateway is currently using env-based keys.</li>
                  <li>Central API keys are visible here for readiness and future cutover planning.</li>
                </ul>
              </div>
            ) : null}
            <div className="portal-summary-grid" style={{ marginTop: 0 }}>
              <section className="portal-summary-card"><div className="portal-summary-label">TOTAL KEYS</div><div className="portal-summary-value">{displayKeys.length}</div></section>
              <section className="portal-summary-card"><div className="portal-summary-label">ACTIVE KEYS</div><div className="portal-summary-value portal-summary-value-active">{data.apiAccess.activeKeys + data.apiAccess.envKeyCount}</div></section>
              <section className="portal-summary-card"><div className="portal-summary-label">REVOKED KEYS</div><div className="portal-summary-value portal-summary-value-warning">{data.apiAccess.revokedKeys}</div></section>
              <section className="portal-summary-card"><div className="portal-summary-label">EXPIRED KEYS</div><div className="portal-summary-value portal-summary-value-warning">{data.apiAccess.expiredKeys}</div></section>
            </div>
            <div className="portal-vllm-table-wrap">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key Prefix</th>
                    <th>Tenant</th>
                    <th>Status</th>
                    <th>Last Used</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayKeys.length ? displayKeys.map((key) => (
                    <tr key={key.id}>
                      <td><div className="portal-table-name">{key.name}</div><div className="portal-table-desc">{key.source === 'env' ? 'Env-managed gateway key' : 'Central API key'}</div></td>
                      <td>{key.keyPrefix}</td>
                      <td>{key.tenant}</td>
                      <td><span className={statusClass(key.status === 'active' ? 'active' : 'warning')}>{key.status}</span></td>
                      <td>{key.lastUsed}</td>
                      <td>{key.source === 'central' ? <div className="portal-vllm-inline-actions"><button type="button" className="portal-action-link" onClick={() => void viewKey(key.id)}>View</button><button type="button" className="portal-action-link" onClick={() => void mutateKey(key.id, 'rotate')}>Rotate</button><button type="button" className="portal-action-link" onClick={() => void mutateKey(key.id, 'revoke')}>Revoke</button></div> : <span className="portal-table-desc">Env-managed</span>}</td>
                    </tr>
                  )) : <tr><td colSpan={6}>No vLLM API keys yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Quick Actions</h3>
                <p className="portal-page-sub">Server-side probes only. No secrets are exposed to the browser.</p>
              </div>
            </div>
            <div className="portal-vllm-action-stack">
              <div className="portal-vllm-action-row"><button type="button" className="portal-action-link" onClick={() => void runQuickTest('health')} disabled={isPending}>Test /health</button><span className="portal-table-desc">{quickTests.health ? `${quickTests.health.statusCode ?? '—'} · ${quickTests.health.message}` : 'Expect 200 when gateway is reachable.'}</span></div>
              <div className="portal-vllm-action-row"><button type="button" className="portal-action-link" onClick={() => void runQuickTest('ready')} disabled={isPending}>Test /ready</button><span className="portal-table-desc">{quickTests.ready ? `${quickTests.ready.statusCode ?? '—'} · ${quickTests.ready.message}` : 'Expect 200 or 503 depending on backend state.'}</span></div>
              <div className="portal-vllm-action-row"><button type="button" className="portal-action-link" onClick={() => void runQuickTest('models')} disabled={isPending || !data.gateway.auth.adminTestKeyConfigured}>Test /v1/models</button><span className="portal-table-desc">{data.gateway.auth.adminTestKeyConfigured ? quickTests.models ? `${quickTests.models.statusCode ?? '—'} · ${quickTests.models.message}` : 'Uses a server-side admin test key only.' : 'Admin test key not configured.'}</span></div>
              <div className="portal-vllm-action-row"><button type="button" className="portal-action-link" onClick={() => void openLogs('gateway')} disabled={isPending}>View Logs (Gateway)</button><span className="portal-table-desc">Sanitized application logs only.</span></div>
              <div className="portal-vllm-action-row"><button type="button" className="portal-action-link" onClick={() => void openLogs('backend')} disabled={isPending}>View Logs (Backend)</button><span className="portal-table-desc">Sanitized vLLM container logs only.</span></div>
              <div className="portal-vllm-action-row"><a href={data.openWebUi.url} target="_blank" rel="noopener noreferrer" className="portal-action-link">Open WebUI</a><span className="portal-table-desc">Opens {data.openWebUi.url}.</span></div>
            </div>
          </section>
        </div>

        <div className="portal-vllm-grid">
          <section className="portal-panel">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Recent Requests</h3>
                <p className="portal-page-sub">From central API key usage logs when available. Prompts and Authorization headers are never shown.</p>
              </div>
            </div>
            <div className="portal-vllm-table-wrap">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Tenant / Key</th>
                    <th>Endpoint</th>
                    <th>Status</th>
                    <th>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.apiAccess.recentRequests.length ? data.apiAccess.recentRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{formatDateTime(request.time)}</td>
                      <td>{request.tenantOrKey}</td>
                      <td>{request.endpoint}</td>
                      <td>{request.status ?? '—'}</td>
                      <td>{request.latencyMs !== null ? `${request.latencyMs} ms` : '—'}</td>
                    </tr>
                  )) : <tr><td colSpan={5}>No recent vLLM requests yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Open WebUI Provider Status</h3>
                <p className="portal-page-sub">vLLM will only appear under External once the provider is configured and the backend is ready.</p>
              </div>
            </div>
            <div className="portal-info-table">
              <div className="portal-info-table-row"><span className="portal-info-table-label">Open WebUI URL</span><span className="portal-info-table-value">{data.openWebUi.url}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Expected Tab</span><span className="portal-info-table-value">{data.openWebUi.expectedTab}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Expected Model</span><span className="portal-info-table-value">{data.openWebUi.expectedModel}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Provider Base URL</span><span className="portal-info-table-value">{data.openWebUi.providerBaseUrl}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Status</span><span className="portal-info-table-value"><span className={statusClass(toneForOpenWebUi(data.openWebUi.status))}>{data.openWebUi.status}</span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Configured Base URLs</span><span className="portal-info-table-value">{data.openWebUi.providerBaseUrls.length ? data.openWebUi.providerBaseUrls.join(', ') : 'No OpenAI-compatible providers configured'}</span></div>
            </div>
            <p className="portal-page-sub" style={{ marginTop: '0.85rem' }}>{data.openWebUi.note}</p>
          </section>
        </div>

        <section id="api-docs" className="portal-panel portal-panel-fill">
          <div className="portal-panel-head portal-panel-head-inline">
            <div>
              <h3 className="portal-panel-title">How to Use</h3>
              <p className="portal-page-sub">OpenAI-compatible endpoint for Open WebUI External Models, Dify, n8n, SDK clients, and custom applications.</p>
            </div>
            <button type="button" className="portal-action-link" onClick={() => void copyText(cUrlExample, 'cURL example')}>Copy</button>
          </div>
          <pre className="portal-code-block">{cUrlExample}</pre>
          <div className="portal-vllm-note-list">
            <div>This endpoint can be used in Open WebUI External Models.</div>
            <div>This endpoint can be used in Dify, n8n, OpenAI SDK clients, and custom applications.</div>
            <div>Model alias getouch-qwen3-14b maps to Qwen/Qwen3-14B-FP8.</div>
            <div>litellm.getouch.co is reserved for the future LiteLLM routing layer and is not used by the vLLM gateway.</div>
          </div>
        </section>
      </div>

      {createOpen ? (
        <div className="portal-modal-backdrop" role="presentation">
          <div className="portal-modal" role="dialog" aria-modal="true">
            <div className="portal-modal-head">
              <div>
                <div className="portal-modal-title">Add API Key</div>
                <div className="portal-modal-copy">Suggested scopes: ai:chat, ai:models, model:getouch-qwen3-14b</div>
              </div>
              <button type="button" className="portal-modal-close" onClick={() => setCreateOpen(false)}>Close</button>
            </div>
            <form className="portal-modal-body" onSubmit={submitCreateKey}>
              <label className="portal-form-label">Key Name</label>
              <input className="portal-text-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Production App" />
              <label className="portal-form-label" style={{ marginTop: '0.9rem' }}>Tenant</label>
              <input className="portal-text-input" value={formTenant} onChange={(e) => setFormTenant(e.target.value)} placeholder="Getouch" />
              <label className="portal-form-label" style={{ marginTop: '0.9rem' }}>Environment</label>
              <select className="portal-text-input" value={formEnvironment} onChange={(e) => setFormEnvironment(e.target.value === 'test' ? 'test' : 'live')}>
                <option value="live">Live</option>
                <option value="test">Test</option>
              </select>
              {formError ? <div className="portal-ai-error" style={{ marginTop: '0.9rem' }}>{formError}</div> : null}
              <div className="portal-modal-actions">
                <button type="button" className="portal-admin-btn portal-admin-btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" className="portal-admin-btn portal-admin-btn-primary" disabled={isPending || (formEnvironment === 'live' && data.serviceInfo.pepper.source !== 'central')}>Create Key</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {revealedSecret ? (
        <div className="portal-modal-backdrop" role="presentation">
          <div className="portal-modal" role="dialog" aria-modal="true">
            <div className="portal-modal-head">
              <div>
                <div className="portal-modal-title">{revealedSecret.title}</div>
                <div className="portal-modal-copy">This plaintext is shown once only. It is not stored and cannot be retrieved later.</div>
              </div>
              <button type="button" className="portal-modal-close" onClick={() => setRevealedSecret(null)}>Close</button>
            </div>
            <div className="portal-modal-body">
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Key Prefix</span><span className="portal-info-table-value">{revealedSecret.keyPrefix}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Plaintext</span><span className="portal-info-table-value">{revealedSecret.plaintext}</span></div>
              </div>
              <div className="portal-modal-actions">
                <button type="button" className="portal-admin-btn portal-admin-btn-secondary" onClick={() => void copyText(revealedSecret.plaintext, 'API key')}>Copy</button>
                <button type="button" className="portal-admin-btn portal-admin-btn-primary" onClick={() => setRevealedSecret(null)}>Done</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {keyDetail ? (
        <div className="portal-modal-backdrop" role="presentation">
          <div className="portal-modal" role="dialog" aria-modal="true">
            <div className="portal-modal-head">
              <div>
                <div className="portal-modal-title">{keyDetail.key.name}</div>
                <div className="portal-modal-copy">Metadata, recent usage, and audit only. Full secret is never available here.</div>
              </div>
              <button type="button" className="portal-modal-close" onClick={() => setKeyDetail(null)}>Close</button>
            </div>
            <div className="portal-modal-body">
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Key Prefix</span><span className="portal-info-table-value">{keyDetail.key.keyPrefix}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Tenant</span><span className="portal-info-table-value">{keyDetail.key.tenantId || 'Getouch'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Status</span><span className="portal-info-table-value">{keyDetail.key.status}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Scopes</span><span className="portal-info-table-value">{keyDetail.key.scopes.join(', ') || '—'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Created</span><span className="portal-info-table-value">{formatDateTime(keyDetail.key.createdAt)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Last Used</span><span className="portal-info-table-value">{formatDateTime(keyDetail.key.lastUsedAt)}</span></div>
              </div>
              <div className="portal-vllm-modal-section">
                <div className="portal-panel-label">Recent Usage</div>
                <div className="portal-vllm-log-box">{keyDetail.usage.length ? keyDetail.usage.slice(0, 10).map((row) => `${formatDateTime(row.createdAt)} · ${row.route || '—'} · ${row.statusCode ?? '—'} · ${row.latencyMs ?? '—'} ms`).join('\n') : 'No usage yet.'}</div>
              </div>
              <div className="portal-vllm-modal-section">
                <div className="portal-panel-label">Audit</div>
                <div className="portal-vllm-log-box">{keyDetail.audit.length ? keyDetail.audit.slice(0, 10).map((row) => `${formatDateTime(row.createdAt)} · ${row.action}${row.summary ? ` · ${row.summary}` : ''}`).join('\n') : 'No audit events yet.'}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {logState ? (
        <div className="portal-modal-backdrop" role="presentation">
          <div className="portal-modal" role="dialog" aria-modal="true">
            <div className="portal-modal-head">
              <div>
                <div className="portal-modal-title">{logState.source === 'gateway' ? 'Gateway Logs' : 'Backend Logs'}</div>
                <div className="portal-modal-copy">{logState.container ? `${logState.container} · checked ${formatDateTime(logState.checkedAt)}` : logState.message}</div>
              </div>
              <button type="button" className="portal-modal-close" onClick={() => setLogState(null)}>Close</button>
            </div>
            <div className="portal-modal-body">
              <div className="portal-vllm-log-box">{logState.lines.length ? logState.lines.join('\n') : logState.message}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
