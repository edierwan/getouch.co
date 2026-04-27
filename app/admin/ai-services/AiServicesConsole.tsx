'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { SummaryGrid } from '../ui';

type AiRuntimeStatus = {
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
};

type ActionKey = 'unload' | 'start' | 'stop' | 'restore' | 'configure';

type ActionResponse = {
  ok: boolean;
  action: string;
  message: string;
  checkedAt: string;
  status: AiRuntimeStatus;
};

type SummaryCardShape = {
  label: string;
  value: string;
  detail?: string;
  tone?: 'healthy' | 'active' | 'warning';
  icon: string;
};

type RuntimeAction = {
  key: ActionKey;
  title: string;
  description: string;
  warnings: string[];
  route: string;
  confirmLabel: string;
  tone: 'primary' | 'secondary' | 'danger';
};

const ACTIONS: Record<ActionKey, RuntimeAction> = {
  unload: {
    key: 'unload',
    title: 'Unload Ollama Resident Model',
    description: 'This unloads the currently resident Ollama model from GPU memory without deleting the service or model files.',
    warnings: [
      'Existing Open WebUI requests using the resident model may be interrupted.',
      'Only the currently loaded model is unloaded. Ollama stays installed and running.',
      'Run this only during a maintenance window if active users may be affected.',
    ],
    route: '/api/admin/ai-runtime/ollama/unload',
    confirmLabel: 'Unload resident model',
    tone: 'danger',
  },
  start: {
    key: 'start',
    title: 'Start vLLM Trial',
    description: 'This starts the internal-only vLLM trial for Qwen/Qwen3-14B-FP8. It is not a parallel production mode.',
    warnings: [
      'Unload the current Ollama resident model first to free GPU memory.',
      'If VRAM is still insufficient, vLLM may fail or enter a restart loop.',
      'No public port or subdomain will be exposed by this action.',
    ],
    route: '/api/admin/ai-runtime/vllm/start',
    confirmLabel: 'Start vLLM trial',
    tone: 'danger',
  },
  stop: {
    key: 'stop',
    title: 'Stop vLLM Trial',
    description: 'This stops only the vLLM trial container/service.',
    warnings: [
      'It does not delete Ollama models or volumes.',
      'Open WebUI traffic routed to vLLM would stop until Ollama mode is restored or vLLM is restarted.',
    ],
    route: '/api/admin/ai-runtime/vllm/stop',
    confirmLabel: 'Stop vLLM',
    tone: 'danger',
  },
  restore: {
    key: 'restore',
    title: 'Restore Ollama Mode',
    description: 'This stops vLLM if present and confirms the stack returns to Ollama-first operation.',
    warnings: [
      'This does not delete any model files or volumes.',
      'It may interrupt a vLLM trial session and should be done intentionally.',
    ],
    route: '/api/admin/ai-runtime/restore-ollama',
    confirmLabel: 'Restore Ollama mode',
    tone: 'secondary',
  },
  configure: {
    key: 'configure',
    title: 'Configure Open WebUI vLLM Provider',
    description: 'This is reserved for an approved maintenance window because Open WebUI provider changes may require configuration updates and a restart.',
    warnings: [
      'Existing Ollama provider wiring must remain intact.',
      'Do not apply this until the vLLM trial service is configured and validated.',
    ],
    route: '/api/admin/ai-runtime/openwebui/configure-vllm',
    confirmLabel: 'Continue with provider setup',
    tone: 'secondary',
  },
};

function formatMiB(value: number | null) {
  if (value === null || Number.isNaN(value)) return 'Unknown';
  return `${(value / 1024).toFixed(1)} GiB`;
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not checked yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not checked yet';
  return parsed.toLocaleString();
}

function statusClass(tone: 'healthy' | 'active' | 'warning') {
  if (tone === 'warning') return 'portal-status portal-status-warning';
  if (tone === 'active') return 'portal-status portal-status-active';
  return 'portal-status portal-status-good';
}

function toneForRuntime(status: AiRuntimeStatus['runtime']['activeRuntime']) {
  if (status === 'Ollama' || status === 'vLLM') return 'active' as const;
  if (status === 'Maintenance') return 'warning' as const;
  return 'warning' as const;
}

function toneForVllm(status: AiRuntimeStatus['vllm']['status']) {
  if (status === 'Running') return 'active' as const;
  if (status === 'Installed but stopped') return 'healthy' as const;
  return 'warning' as const;
}

function buttonClass(tone: RuntimeAction['tone']) {
  if (tone === 'danger') return 'portal-admin-btn portal-admin-btn-danger';
  if (tone === 'secondary') return 'portal-admin-btn portal-admin-btn-secondary';
  return 'portal-admin-btn portal-admin-btn-primary';
}

export function AiServicesConsole() {
  const [status, setStatus] = useState<AiRuntimeStatus | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<RuntimeAction | null>(null);
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [isRefreshing, startRefreshing] = useTransition();
  const [isRunningAction, startRunningAction] = useTransition();

  async function loadStatus() {
    setError('');

    try {
      const response = await fetch('/api/admin/ai-runtime/status', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to load AI runtime status');
      }

      setStatus(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load AI runtime status');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  const summaryCards = useMemo<SummaryCardShape[]>(() => {
    if (!status) return [];

    return [
      {
        label: 'ACTIVE RUNTIME',
        value: status.runtime.activeRuntime,
        detail: status.runtime.recommendedMode,
        tone: toneForRuntime(status.runtime.activeRuntime),
        icon: '◎',
      },
      {
        label: 'GPU VRAM',
        value: status.gpu.totalVramMiB !== null && status.gpu.usedVramMiB !== null
          ? `${formatMiB(status.gpu.usedVramMiB)} / ${formatMiB(status.gpu.totalVramMiB)}`
          : 'Unavailable',
        detail: status.gpu.freeVramMiB !== null ? `${formatMiB(status.gpu.freeVramMiB)} free` : 'GPU status unknown',
        tone: status.gpu.freeVramMiB !== null && status.gpu.freeVramMiB < 12000 ? 'warning' : 'active',
        icon: '▣',
      },
      {
        label: 'OLLAMA',
        value: status.ollama.containerStatus === 'running' ? 'Active' : status.ollama.containerStatus,
        detail: status.ollama.residentModel ? `Resident: ${status.ollama.residentModel}` : 'No resident model loaded',
        tone: status.ollama.containerStatus === 'running' ? 'active' : 'warning',
        icon: '◌',
      },
      {
        label: 'VLLM TRIAL',
        value: status.vllm.status,
        detail: status.vllm.blockedReason || status.vllm.intendedModel,
        tone: toneForVllm(status.vllm.status),
        icon: '◉',
      },
    ];
  }, [status]);

  const serviceRows = useMemo(() => {
    if (!status) return [];

    return [
      {
        name: 'Dify',
        description: 'Standard self-hosted Dify workspace and application UI.',
        type: 'ORCHESTRATION',
        status: 'ONLINE',
        tone: 'healthy' as const,
        href: 'https://dify.getouch.co',
        detail: 'Existing orchestration workspace remains unchanged.',
      },
      {
        name: 'MCP',
        description: 'Remote MCP endpoint for tooling and workflow exploration.',
        type: 'PROTOCOL',
        status: 'ONLINE',
        tone: 'healthy' as const,
        href: 'https://mcp.getouch.co',
        detail: 'No change to MCP routing or access.',
      },
      {
        name: 'Open WebUI',
        description: 'Operator and end-user AI interface.',
        type: 'PORTAL',
        status: status.openWebUi.reachable ? 'ONLINE' : 'DEGRADED',
        tone: status.openWebUi.reachable ? 'healthy' as const : 'warning' as const,
        href: status.links.openWebUi,
        detail: status.openWebUi.vllmProviderConfigured
          ? `vLLM provider configured${status.openWebUi.vllmProviderUsable ? ' and reachable' : ' but not usable yet'}.`
          : 'Ollama provider remains primary. vLLM provider not configured.',
      },
      {
        name: 'Ollama',
        description: 'Primary local inference backend on the shared GPU node.',
        type: 'INFERENCE',
        status: status.ollama.containerStatus === 'running' ? 'ACTIVE' : status.ollama.containerStatus.toUpperCase(),
        tone: status.ollama.containerStatus === 'running' ? 'active' as const : 'warning' as const,
        detail: status.ollama.residentModel
          ? `Resident model: ${status.ollama.residentModel}${status.ollama.residentProcessor ? ` · ${status.ollama.residentProcessor}` : ''}`
          : 'No resident model loaded right now.',
      },
      {
        name: 'vLLM',
        description: 'OpenAI-compatible inference backend for Qwen/Qwen3-14B-FP8 trial.',
        type: 'INFERENCE',
        status: status.vllm.status.toUpperCase(),
        tone: toneForVllm(status.vllm.status),
        detail: `${status.vllm.intendedEndpoint} · internal-only · public exposure: ${status.vllm.publicExposure}`,
        action: status.vllm.containerStatus === 'running'
          ? { label: 'Stop Trial', onClick: () => openModal('stop') }
          : status.actions.canStartVllmTrial
            ? { label: 'Start Trial', onClick: () => openModal('start') }
            : { label: 'Manage', onClick: () => scrollToInferenceControl() },
      },
      {
        name: 'SearXNG',
        description: 'Private search stack used by AI workflows.',
        type: 'SEARCH',
        status: 'ACTIVE',
        tone: 'active' as const,
        href: 'https://search.getouch.co',
        detail: 'Search and RAG augmentation remain unchanged.',
      },
      {
        name: 'Pipelines',
        description: 'Custom AI automation and orchestration pipelines.',
        type: 'AUTOMATION',
        status: 'ACTIVE',
        tone: 'active' as const,
        detail: 'Pipeline routing stays on the existing Open WebUI path.',
      },
    ];
  }, [status]);

  function openModal(key: ActionKey) {
    setPendingAction(ACTIONS[key]);
    setConfirmArmed(false);
    setError('');
    setMessage('');
  }

  function closeModal() {
    setPendingAction(null);
    setConfirmArmed(false);
  }

  function scrollToInferenceControl() {
    document.getElementById('inference-control-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function runAction(action: RuntimeAction) {
    const response = await fetch(action.route, { method: 'POST' });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : typeof payload?.message === 'string' ? payload.message : `Unable to run ${action.title}`);
    }

    const result = payload as ActionResponse;
    setStatus(result.status);
    setMessage(result.message);
    setError('');
    closeModal();
  }

  function handleConfirmAction() {
    if (!pendingAction || !confirmArmed) {
      setError('Tick the confirmation box before running a maintenance action.');
      return;
    }

    startRunningAction(async () => {
      try {
        await runAction(pendingAction);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : `Unable to run ${pendingAction.title}`);
      }
    });
  }

  if (loading || !status) {
    return <section className="portal-panel">Loading AI runtime controls…</section>;
  }

  return (
    <div className="portal-ai-runtime-shell">
      {error ? <div className="portal-ai-error">{error}</div> : null}
      {message ? <div className="portal-ai-success">{message}</div> : null}

      <SummaryGrid cards={summaryCards} />

      {status.runtime.warning ? (
        <div className="portal-warning-box">
          <div className="portal-warning-title">Maintenance Warning</div>
          <ul className="portal-warning-list">
            <li>{status.runtime.warning}</li>
            <li>Use maintenance mode: unload the current Ollama resident model before starting any vLLM trial.</li>
            <li>No public vLLM endpoint or subdomain is added in this phase.</li>
          </ul>
        </div>
      ) : null}

      <div className="portal-ai-runtime-grid">
        <section id="inference-control-panel" className="portal-panel portal-panel-fill">
          <div className="portal-panel-head portal-panel-head-inline">
            <div>
              <h3 className="portal-panel-title">Inference Control</h3>
              <p className="portal-page-sub">See the current inference backend, GPU pressure, Open WebUI provider readiness, and gated maintenance actions for future vLLM trials.</p>
            </div>
            <div className="portal-action-row">
              <button type="button" className="portal-action-link" onClick={() => startRefreshing(() => loadStatus())}>
                {isRefreshing ? 'Refreshing…' : 'Refresh Status'}
              </button>
              <a href={status.links.openWebUi} target="_blank" rel="noopener noreferrer" className="portal-action-link">Open Open WebUI</a>
              <a href={status.links.grafanaGpu} target="_blank" rel="noopener noreferrer" className="portal-action-link">Open Grafana GPU Dashboard</a>
            </div>
          </div>

          <div className="portal-ai-runtime-card-grid">
            <div className="portal-ai-runtime-card">
              <div className="portal-ai-status-label">Active Runtime</div>
              <div className="portal-ai-runtime-value">{status.runtime.activeRuntime}</div>
              <div className="portal-ai-note">Current default resolves to Ollama while vLLM is not running.</div>
            </div>
            <div className="portal-ai-runtime-card">
              <div className="portal-ai-status-label">Recommended Mode</div>
              <div className="portal-ai-runtime-value portal-ai-runtime-value-small">{status.runtime.recommendedMode}</div>
              <div className="portal-ai-note">{status.runtime.recommendedReason}</div>
            </div>
            <div className="portal-ai-runtime-card">
              <div className="portal-ai-status-label">Last Check</div>
              <div className="portal-ai-runtime-value portal-ai-runtime-value-small">{formatDateTime(status.checkedAt)}</div>
              <div className="portal-ai-note">Docker network: {status.docker.network || 'Unknown'}</div>
            </div>
            <div className="portal-ai-runtime-card">
              <div className="portal-ai-status-label">Open WebUI Provider</div>
              <div className="portal-ai-runtime-value portal-ai-runtime-value-small">
                {status.openWebUi.vllmProviderUsable ? 'vLLM usable' : status.openWebUi.vllmProviderConfigured ? 'Configured' : 'Ollama only'}
              </div>
              <div className="portal-ai-note">
                {status.openWebUi.ollamaProviderAvailable ? 'Ollama provider available.' : 'Ollama provider missing.'}
              </div>
            </div>
          </div>

          <div className="portal-ai-runtime-detail-grid">
            <section className="portal-ai-runtime-section">
              <h4 className="portal-panel-label">GPU STATUS</h4>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">GPU</span><span className="portal-info-table-value">{status.gpu.name || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Total VRAM</span><span className="portal-info-table-value">{formatMiB(status.gpu.totalVramMiB)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Used VRAM</span><span className="portal-info-table-value">{formatMiB(status.gpu.usedVramMiB)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Free VRAM</span><span className="portal-info-table-value">{formatMiB(status.gpu.freeVramMiB)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">GPU Utilization</span><span className="portal-info-table-value">{status.gpu.utilizationGpuPercent !== null ? `${status.gpu.utilizationGpuPercent}%` : 'Unknown'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Temperature</span><span className="portal-info-table-value">{status.gpu.temperatureC !== null ? `${status.gpu.temperatureC} C` : 'Unknown'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Driver / CUDA</span><span className="portal-info-table-value">{status.gpu.driverVersion || 'Unknown'} / {status.gpu.cudaVersion || 'Unknown'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Docker GPU Access</span><span className="portal-info-table-value">{status.gpu.dockerAccess ? 'Available' : status.gpu.dockerAccessError || 'Unavailable'}</span></div>
              </div>
            </section>

            <section className="portal-ai-runtime-section">
              <h4 className="portal-panel-label">OLLAMA STATUS</h4>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Container</span><span className="portal-info-table-value">{status.ollama.containerStatus}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">API</span><span className="portal-info-table-value">{status.ollama.apiReachable ? 'Reachable' : status.ollama.apiError || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Resident model</span><span className="portal-info-table-value">{status.ollama.residentModel || 'None loaded'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Resident VRAM path</span><span className="portal-info-table-value">{status.ollama.residentProcessor || 'Unknown'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Installed models</span><span className="portal-info-table-value">{status.ollama.installedCount ? `${status.ollama.installedCount} installed` : 'Unknown'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Summary</span><span className="portal-info-table-value portal-ai-runtime-wrap">{status.ollama.installedModels.length ? status.ollama.installedModels.join(', ') : 'No model summary available'}</span></div>
              </div>
            </section>

            <section className="portal-ai-runtime-section">
              <h4 className="portal-panel-label">VLLM STATUS</h4>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">State</span><span className="portal-info-table-value">{status.vllm.status}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Model</span><span className="portal-info-table-value">{status.vllm.intendedModel}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Endpoint</span><span className="portal-info-table-value portal-ai-runtime-wrap">{status.vllm.intendedEndpoint}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Public exposure</span><span className="portal-info-table-value">{status.vllm.publicExposure}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Compose service</span><span className="portal-info-table-value">{status.vllm.configuredInCompose ? 'Configured' : 'Not configured yet'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Trial blocker</span><span className="portal-info-table-value portal-ai-runtime-wrap">{status.vllm.blockedReason || status.actions.startBlockedReason || 'No blocker reported'}</span></div>
              </div>
            </section>

            <section className="portal-ai-runtime-section">
              <h4 className="portal-panel-label">OPEN WEBUI PROVIDER</h4>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Reachable</span><span className="portal-info-table-value">{status.openWebUi.reachable ? 'Yes' : status.openWebUi.error || 'No'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Ollama provider</span><span className="portal-info-table-value">{status.openWebUi.ollamaProviderAvailable ? 'Available' : 'Missing'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">vLLM provider</span><span className="portal-info-table-value">{status.openWebUi.vllmProviderConfigured ? 'Configured' : 'Not configured'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">vLLM usable</span><span className="portal-info-table-value">{status.openWebUi.vllmProviderUsable ? 'Yes' : 'No'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Provider endpoints</span><span className="portal-info-table-value portal-ai-runtime-wrap">{status.openWebUi.providerBaseUrls.length ? status.openWebUi.providerBaseUrls.join(', ') : 'No OpenAI-compatible endpoints configured'}</span></div>
              </div>
            </section>
          </div>

          <div className="portal-ai-button-row portal-ai-runtime-actions">
            <button type="button" className="portal-ai-button portal-ai-button-secondary" onClick={() => openModal('unload')} disabled={!status.actions.canUnloadOllama}>Unload Ollama Resident Model</button>
            <button type="button" className="portal-ai-button" onClick={() => openModal('start')} disabled={!status.actions.canStartVllmTrial}>Start vLLM Trial</button>
            <button type="button" className="portal-ai-button portal-ai-button-secondary" onClick={() => openModal('stop')} disabled={!status.actions.canStopVllm}>Stop vLLM</button>
            <button type="button" className="portal-ai-button portal-ai-button-secondary" onClick={() => openModal('restore')} disabled={!status.actions.canRestoreOllama}>Restore Ollama Mode</button>
            <button type="button" className="portal-ai-button portal-ai-button-secondary" onClick={() => openModal('configure')} disabled={!status.actions.canConfigureOpenWebUiVllm}>Configure Open WebUI vLLM Provider</button>
          </div>

          {status.actions.startBlockedReason ? <div className="portal-banner portal-banner-info">vLLM trial start is blocked: {status.actions.startBlockedReason}</div> : null}
          {status.actions.configureBlockedReason ? <div className="portal-banner portal-banner-info">Open WebUI vLLM provider setup remains blocked: {status.actions.configureBlockedReason}</div> : null}
        </section>

        <section className="portal-panel">
          <div className="portal-panel-head">
            <div>
              <h3 className="portal-panel-title">Host Readiness</h3>
              <p className="portal-page-sub">This summarizes the current hardware constraint and the safe trial posture.</p>
            </div>
          </div>
          <div className="portal-info-table">
            <div className="portal-info-table-row"><span className="portal-info-table-label">Single GPU limit</span><span className="portal-info-table-value">16GB shared with Ollama</span></div>
            <div className="portal-info-table-row"><span className="portal-info-table-label">Current free VRAM</span><span className="portal-info-table-value">{formatMiB(status.gpu.freeVramMiB)}</span></div>
            <div className="portal-info-table-row"><span className="portal-info-table-label">System RAM</span><span className="portal-info-table-value">{status.host.memoryUsed || 'Unknown'} / {status.host.memoryTotal || 'Unknown'}</span></div>
            <div className="portal-info-table-row"><span className="portal-info-table-label">Swap usage</span><span className="portal-info-table-value">{status.host.swapUsed || 'Unknown'} / {status.host.swapTotal || 'Unknown'}</span></div>
            <div className="portal-info-table-row"><span className="portal-info-table-label">Disk free on /srv</span><span className="portal-info-table-value">{status.host.diskSrvFree || 'Unknown'}</span></div>
            <div className="portal-info-table-row"><span className="portal-info-table-label">Exposure check</span><span className="portal-info-table-value">{status.docker.publicExposureDetected ? 'Review required' : 'No public vLLM exposure detected'}</span></div>
          </div>
        </section>
      </div>

      <section className="portal-panel portal-panel-fill">
        <h3 className="portal-panel-label">AI & AUTOMATION</h3>
        <div className="portal-resource-list">
          {serviceRows.map((row) => (
            <div key={row.name} className="portal-resource-row">
              <div className="portal-resource-copy">
                <div className="portal-resource-name">{row.name}</div>
                <div className="portal-resource-desc">{row.description}</div>
                <div className="portal-ai-runtime-inline-copy">{row.detail}</div>
              </div>
              <div className="portal-ai-runtime-row-meta">
                <span className="portal-resource-type">{row.type}</span>
                <span className={statusClass(row.tone)}>{row.status}</span>
                {row.href ? <a href={row.href} target="_blank" rel="noopener noreferrer" className="portal-resource-link">↗</a> : null}
                {'action' in row && row.action ? (
                  <button type="button" className="portal-action-link" onClick={row.action.onClick}>{row.action.label}</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {pendingAction ? (
        <div className="portal-modal-backdrop" role="presentation" onClick={closeModal}>
          <div className="portal-modal" role="dialog" aria-modal="true" aria-labelledby="portal-ai-runtime-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="portal-modal-head">
              <h3 id="portal-ai-runtime-modal-title" className="portal-modal-title">{pendingAction.title}</h3>
              <button type="button" className="portal-modal-close" onClick={closeModal} aria-label="Close confirmation">×</button>
            </div>
            <div className="portal-modal-body">
              <p className="portal-modal-copy">{pendingAction.description}</p>
              <div className="portal-warning-box portal-ai-runtime-modal-warning">
                <div className="portal-warning-title">Before you continue</div>
                <ul className="portal-warning-list">
                  {pendingAction.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
              <label className="portal-dify-checkbox portal-restart-confirm">
                <input type="checkbox" checked={confirmArmed} onChange={(event) => setConfirmArmed(event.target.checked)} />
                <span>I understand this is a maintenance action and want to continue deliberately.</span>
              </label>
              <div className="portal-ai-button-row">
                <button type="button" className={buttonClass(pendingAction.tone)} onClick={handleConfirmAction} disabled={isRunningAction}>
                  {isRunningAction ? 'Running…' : pendingAction.confirmLabel}
                </button>
                <button type="button" className="portal-admin-btn portal-admin-btn-secondary" onClick={closeModal} disabled={isRunningAction}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}