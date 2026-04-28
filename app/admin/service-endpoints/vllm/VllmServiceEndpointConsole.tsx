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
    if (!result.ok || !result.payload) {
      throw new Error((result.payload as { error?: string } | null)?.error || 'Unable to load vLLM dashboard');
    }
    setData(result.payload);
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
    if (!data) {
      return {
        gpuMemoryPercent: null,
        gpuMemoryLabel: 'Not available',
        gpuUtilPercent: null,
        gpuUtilLabel: 'Not available',
        ramPercent: null,
        ramLabel: 'Not available',
      };
    }

    const totalGpu = data.runtime.gpu.totalVramMiB;
    const usedGpu = data.runtime.gpu.usedVramMiB;
    const gpuMemoryPercent = totalGpu !== null && usedGpu !== null && totalGpu > 0
      ? Math.round((usedGpu / totalGpu) * 100)
      : null;

    const totalRam = parseHumanSize(data.runtime.host.memoryTotal);
    const usedRam = parseHumanSize(data.runtime.host.memoryUsed);
    const ramPercent = totalRam !== null && usedRam !== null && totalRam > 0
      ? Math.round((usedRam / totalRam) * 100)
      : null;

    return {
      gpuMemoryPercent,
      gpuMemoryLabel: gpuMemoryPercent === null
        ? (data.runtime.vllm.containerStatus === 'running' ? 'Not available' : 'Backend not running')
        : `${formatBytes((usedGpu || 0) * 1024 * 1024)} / ${formatBytes((totalGpu || 0) * 1024 * 1024)}`,
      gpuUtilPercent: data.runtime.gpu.utilizationGpuPercent,
      gpuUtilLabel: data.runtime.gpu.utilizationGpuPercent === null
        ? (data.runtime.vllm.containerStatus === 'running' ? 'Not available' : 'Backend not running')
        : `${data.runtime.gpu.utilizationGpuPercent}%`,
      ramPercent,
      ramLabel: totalRam === null || usedRam === null
        ? (data.runtime.vllm.containerStatus === 'running' ? 'Not available' : 'Backend not running')
        : `${data.runtime.host.memoryUsed} / ${data.runtime.host.memoryTotal}`,
    };
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
        value: data.gateway.backend.ready ? 'Healthy' : data.gateway.enabled ? 'Degraded' : 'Not Configured',
        detail: `/ready: ${data.gateway.backend.ready ? '200' : '503'}`,
        tone: toneForGateway(data.gateway.status),
        icon: '◉',
      },
      {
        label: 'BACKEND',
        value: data.runtime.vllm.status === 'Running'
          ? 'Running'
          : data.runtime.vllm.containerStatus === 'missing'
            ? 'Not Deployed'
            : data.runtime.vllm.status,
        detail: data.runtime.docker.vllmContainer,
        tone: toneForBackend(data.runtime.vllm.status),
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
        value: formatDurationSince(uptimeStartedAt),
        detail: uptimeLabel,
        tone: uptimeStartedAt ? 'healthy' : 'warning',
        icon: '⏱',
      },
      {
        label: 'TOTAL REQUESTS',
        value: String(data.apiAccess.requestsLast7Days),
        detail: 'Last 7 days',
        tone: data.apiAccess.requestsLast7Days > 0 ? 'active' : 'warning',
        icon: '↺',
      },
      {
        label: 'SUCCESS RATE',
        value: data.apiAccess.successRate7d === null ? 'No data' : `${data.apiAccess.successRate7d}%`,
        detail: 'Last 7 days',
        tone: data.apiAccess.successRate7d !== null && data.apiAccess.successRate7d >= 99 ? 'healthy' : 'warning',
        icon: '◔',
      },
    ];
  }, [data]);

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
    return <section className="portal-panel">Loading vLLM service endpoint dashboard…</section>;
  }

  if (error && !data) {
    return <section className="portal-panel">{error}</section>;
  }

  if (!data) {
    return <section className="portal-panel">Unable to load vLLM service endpoint dashboard.</section>;
  }

  const headerStatus = !data.gateway.enabled || data.gateway.auth.keyCount === 0
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
          <span className="portal-vllm-breadcrumb-muted">Service Endpoints</span>
          <span className="portal-vllm-breadcrumb-sep">/</span>
          <span className="portal-vllm-breadcrumb-active">vLLM AI Gateway</span>
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
              <h3 className="portal-panel-title">vLLM AI Gateway</h3>
              <p className="portal-page-sub">Admin and control UI for the protected public endpoint at {data.serviceInfo.publicEndpoint}. Raw vLLM stays private.</p>
            </div>
            <div className="portal-action-row">
              <span className={statusClass(headerStatus === 'Active' ? 'active' : 'warning')}>{headerStatus}</span>
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
              <div className="portal-info-table-row"><span className="portal-info-table-label">Internal Backend</span><span className="portal-info-table-value"><span className="portal-vllm-inline-copy">{data.serviceInfo.internalBackend}<button type="button" className="portal-action-link" onClick={() => void copyText(data.serviceInfo.internalBackend, 'Internal backend')}>Copy</button></span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Model (Internal)</span><span className="portal-info-table-value">{data.serviceInfo.modelInternal}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Model Alias (Public)</span><span className="portal-info-table-value"><span className="portal-vllm-inline-copy">{data.serviceInfo.modelAlias}<button type="button" className="portal-action-link" onClick={() => void copyText(data.serviceInfo.modelAlias, 'Model alias')}>Copy</button></span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Gateway Version</span><span className="portal-info-table-value">{data.serviceInfo.gatewayVersion || 'Unknown'}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Backend Version</span><span className="portal-info-table-value">{data.serviceInfo.backendVersion}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Last Health Check</span><span className="portal-info-table-value">{formatDateTime(data.serviceInfo.lastHealthCheck)}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">CENTRAL_API_KEY_PEPPER</span><span className="portal-info-table-value">{data.serviceInfo.pepper.source === 'central' ? 'Configured (Central)' : data.serviceInfo.pepper.source === 'auth_secret_legacy' ? 'Legacy AUTH_SECRET' : 'Missing / Dev default'}</span></div>
            </div>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Resource Usage (Backend)</h3>
                <p className="portal-page-sub">Real GPU and host memory metrics from the AI runtime probe.</p>
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
            <div>llm.getouch.co remains reserved for future LiteLLM and is not used here.</div>
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
