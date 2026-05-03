'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Breadcrumb, SummaryGrid } from '../../ui';
import type { ModelRuntimeManagerStatus, ModelRuntimeSwitchResult } from '@/lib/model-runtime-manager';

type SummaryCard = {
  label: string;
  value: string;
  detail?: string;
  tone?: 'healthy' | 'active' | 'warning';
  icon: string;
};

type DiagnosticLogResult = {
  source: 'gateway' | 'backend';
  available: boolean;
  checkedAt: string;
  container: string | null;
  lines: string[];
  message: string;
};

function formatDateTime(value: string | null) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not recorded';
  return parsed.toLocaleString();
}

function statusClass(tone: 'healthy' | 'active' | 'warning') {
  return tone === 'warning'
    ? 'portal-status portal-status-warning'
    : tone === 'active'
      ? 'portal-status portal-status-active'
      : 'portal-status portal-status-good';
}

function toneForStatus(value: string) {
  if (['Ready', 'Healthy', 'Working', 'Active', 'available', 'active'].includes(value)) return 'active' as const;
  if (['Configured'].includes(value)) return 'healthy' as const;
  return 'warning' as const;
}

function meterStyle(percent: number | null) {
  const safePercent = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return {
    background: `conic-gradient(rgba(88, 215, 176, 0.95) ${safePercent}%, rgba(255, 255, 255, 0.08) ${safePercent}% 100%)`,
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : `Request failed with ${response.status}`,
    );
  }

  return payload as T;
}

async function requestSwitchPlan(modelId: string) {
  const response = await fetch('/api/admin/service-endpoints/vllm/model-switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId }),
  });

  const payload = await response.json().catch(() => null) as ModelRuntimeSwitchResult | null;
  if (!payload) {
    throw new Error(`Model switch review failed with ${response.status}`);
  }

  return payload;
}

export function VllmServiceEndpointConsole() {
  const [data, setData] = useState<ModelRuntimeManagerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reviewModelId, setReviewModelId] = useState<string | null>(null);
  const [switchResult, setSwitchResult] = useState<ModelRuntimeSwitchResult | null>(null);
  const [logState, setLogState] = useState<DiagnosticLogResult | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError('');
        const payload = await requestJson<ModelRuntimeManagerStatus>('/api/admin/service-endpoints/vllm/status');
        if (!active) return;
        setData(payload);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load runtime manager status.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const reviewModel = data?.modelCatalog.find((model) => model.modelId === reviewModelId) || null;

  const summaryCards = useMemo<SummaryCard[]>(() => {
    if (!data) return [];

    return [
      {
        label: 'Runtime Status',
        value: data.runtime.status,
        detail: data.runtime.detail,
        tone: toneForStatus(data.runtime.status),
        icon: '◎',
      },
      {
        label: 'Active Model',
        value: data.runtime.activeModelDisplayName || 'None active',
        detail: data.runtime.activeModelId || 'No live vLLM model is running.',
        tone: data.runtime.activeModelId ? 'active' : 'warning',
        icon: '◌',
      },
      {
        label: 'Public Alias',
        value: data.runtime.publicAlias,
        detail: 'Apps should call the Platform Broker, not LiteLLM or vLLM directly.',
        tone: 'healthy',
        icon: '⇄',
      },
      {
        label: 'LiteLLM Route',
        value: data.liteLlm.status,
        detail: data.liteLlm.detail,
        tone: toneForStatus(data.liteLlm.status),
        icon: '↗',
      },
      {
        label: 'OpenWebUI',
        value: data.openWebUi.status,
        detail: data.openWebUi.detail,
        tone: toneForStatus(data.openWebUi.status),
        icon: '⌘',
      },
      {
        label: 'Ollama GPU State',
        value: data.ollama.status,
        detail: data.ollama.detail,
        tone: data.ollama.gpuConflict ? 'warning' : 'healthy',
        icon: '◴',
      },
    ];
  }, [data]);

  async function refreshStatus() {
    const payload = await requestJson<ModelRuntimeManagerStatus>('/api/admin/service-endpoints/vllm/status');
    setData(payload);
  }

  async function runModelSwitch() {
    if (!reviewModelId) return;
    const result = await requestSwitchPlan(reviewModelId);
    setSwitchResult(result);
    setReviewModelId(null);
    setData(result.status);
    setMessage(result.message);
    setError('');
  }

  async function openLogs(source: 'gateway' | 'backend') {
    try {
      const result = await requestJson<DiagnosticLogResult>(`/api/admin/service-endpoints/vllm/logs/${source}`);
      setLogState(result);
      setError('');
    } catch (logError) {
      setError(logError instanceof Error ? logError.message : `Unable to load ${source} logs.`);
    }
  }

  function handleReview(modelId: string) {
    setReviewModelId(modelId);
    setSwitchResult(null);
    setMessage('');
    setError('');
  }

  function handleConfirmSwitch() {
    startTransition(async () => {
      try {
        await runModelSwitch();
      } catch (switchError) {
        setError(switchError instanceof Error ? switchError.message : 'Unable to review the switch plan.');
      }
    });
  }

  function handleRefresh() {
    startTransition(async () => {
      try {
        await refreshStatus();
        setMessage('Runtime status refreshed.');
        setError('');
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh runtime status.');
      }
    });
  }

  if (loading) {
    return <section className="portal-panel">Loading Model Runtime Manager…</section>;
  }

  if (!data) {
    return <section className="portal-panel">Unable to load Model Runtime Manager.</section>;
  }

  return (
    <>
      <div className="portal-ai-runtime-shell portal-vllm-shell">
        <Breadcrumb category="AI Services" page="Model Runtime Manager" />

        {error ? <div className="portal-ai-error">{error}</div> : null}
        {message ? <div className="portal-ai-success">{message}</div> : null}

        <section className="portal-panel portal-panel-fill">
          <div className="portal-panel-head portal-panel-head-inline">
            <div>
              <h3 className="portal-panel-title">vLLM Model Runtime Manager</h3>
              <p className="portal-page-sub">
                Operator view for the active model runtime, LiteLLM route readiness, OpenWebUI test wiring,
                and GPU pressure. Product apps should use only Platform Broker env keys.
              </p>
            </div>
            <div className="portal-action-row">
              <button type="button" className="portal-action-link" onClick={handleRefresh}>
                {isPending ? 'Refreshing…' : 'Refresh Status'}
              </button>
              <a href={data.openWebUi.url} target="_blank" rel="noopener noreferrer" className="portal-action-link">Open OpenWebUI</a>
            </div>
          </div>
        </section>

        <SummaryGrid cards={summaryCards} />

        <div className="portal-vllm-grid">
          <section className="portal-panel portal-panel-fill">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Runtime Overview</h3>
                <p className="portal-page-sub">Primary operator state for the production model runtime path.</p>
              </div>
            </div>
            <div className="portal-info-table">
              <div className="portal-info-table-row"><span className="portal-info-table-label">Runtime Status</span><span className="portal-info-table-value"><span className={statusClass(toneForStatus(data.runtime.status))}>{data.runtime.status}</span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Active Model</span><span className="portal-info-table-value">{data.runtime.activeModelDisplayName || 'None active'}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Public Model Alias</span><span className="portal-info-table-value">{data.runtime.publicAlias}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Backend Health</span><span className="portal-info-table-value"><span className={statusClass(toneForStatus(data.backendHealth.status))}>{data.backendHealth.status}</span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">LiteLLM Route Status</span><span className="portal-info-table-value"><span className={statusClass(toneForStatus(data.liteLlm.status))}>{data.liteLlm.status}</span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">OpenWebUI Provider</span><span className="portal-info-table-value"><span className={statusClass(toneForStatus(data.openWebUi.status))}>{data.openWebUi.status}</span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Last Health Check</span><span className="portal-info-table-value">{formatDateTime(data.runtime.lastHealthCheckAt)}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Last Model Switch</span><span className="portal-info-table-value">{formatDateTime(data.runtime.lastModelSwitchAt)}</span></div>
            </div>
            <p className="portal-page-sub" style={{ marginTop: '0.85rem' }}>{data.runtime.detail}</p>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Resource Usage</h3>
                <p className="portal-page-sub">Live GPU and host-memory view for deciding whether the runtime can move.</p>
              </div>
            </div>
            <div className="portal-vllm-meter-grid">
              <div className="portal-vllm-meter-card">
                <div className="portal-vllm-meter-ring" style={meterStyle(data.metrics.gpuMemoryPercent)}><span>{data.metrics.gpuMemoryPercent === null ? '—' : `${data.metrics.gpuMemoryPercent}%`}</span></div>
                <div className="portal-vllm-meter-title">GPU Memory</div>
                <div className="portal-vllm-meter-sub">{data.metrics.gpuMemoryLabel}</div>
              </div>
              <div className="portal-vllm-meter-card">
                <div className="portal-vllm-meter-ring" style={meterStyle(data.metrics.gpuUtilizationPercent)}><span>{data.metrics.gpuUtilizationPercent === null ? '—' : `${data.metrics.gpuUtilizationPercent}%`}</span></div>
                <div className="portal-vllm-meter-title">GPU Utilization</div>
                <div className="portal-vllm-meter-sub">{data.metrics.gpuUtilizationLabel}</div>
              </div>
              <div className="portal-vllm-meter-card">
                <div className="portal-vllm-meter-ring" style={meterStyle(data.metrics.ramPercent)}><span>{data.metrics.ramPercent === null ? '—' : `${data.metrics.ramPercent}%`}</span></div>
                <div className="portal-vllm-meter-title">RAM Usage</div>
                <div className="portal-vllm-meter-sub">{data.metrics.ramLabel}</div>
              </div>
            </div>
            <p className="portal-page-sub">Last checked {formatDateTime(data.metrics.lastCheckedAt)}.</p>
          </section>
        </div>

        <div className="portal-vllm-grid">
          <section className="portal-panel portal-panel-fill">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Approved Model Catalog</h3>
                <p className="portal-page-sub">Approved runtime targets only. Free-text model switching is intentionally blocked.</p>
              </div>
            </div>

            <div className="portal-runtime-model-grid">
              {data.modelCatalog.map((model) => (
                <article key={model.modelId} className="portal-runtime-model-card">
                  <div className="portal-runtime-model-head">
                    <div>
                      <div className="portal-runtime-model-name">{model.displayName}</div>
                      <div className="portal-runtime-model-id">{model.modelId}</div>
                    </div>
                    <span className={statusClass(toneForStatus(model.status))}>{model.status.replace(/_/g, ' ')}</span>
                  </div>
                  <dl className="portal-runtime-model-meta">
                    <div><dt>Alias</dt><dd>{model.publicAlias}</dd></div>
                    <div><dt>Estimated VRAM</dt><dd>{model.estimatedVram}</dd></div>
                  </dl>
                  <p className="portal-page-sub">{model.notes}</p>
                  <div className="portal-action-row">
                    <button type="button" className="portal-action-link" onClick={() => handleReview(model.modelId)}>
                      {model.status === 'active' ? 'Review Runtime' : 'Review Switch'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">App Integration</h3>
                <p className="portal-page-sub">Product apps should not know LiteLLM, vLLM, or provider keys.</p>
              </div>
            </div>
            <div className="portal-runtime-env-list">
              <div><strong>PLATFORM_API_URL</strong><span>{data.sourceOfTruth.brokerUrl.replace(/\/ai\/chat$/, '')}</span></div>
              <div><strong>PLATFORM_APP_CODE</strong><span>App-specific value from App Access Control</span></div>
              <div><strong>PLATFORM_APP_KEY</strong><span>Platform App Key only. No LiteLLM or vLLM key in product apps.</span></div>
            </div>
            <p className="portal-page-sub" style={{ marginTop: '0.85rem' }}>
              Broker endpoint: <span className="portal-runtime-inline-code">{data.sourceOfTruth.brokerUrl}</span>
            </p>
          </section>
        </div>

        {data.runtime.switchMode === 'manual' ? (
          <div className="portal-warning-box">
            <div className="portal-warning-title">Manual action required</div>
            <ul className="portal-warning-list">
              <li>{data.runtime.switchModeDetail}</li>
              <li>Current live host check confirms LiteLLM is running, OpenWebUI is not yet pointed at LiteLLM, and no deployed vLLM service exists.</li>
            </ul>
          </div>
        ) : null}

        {switchResult && switchResult.manualSteps.length > 0 ? (
          <section className="portal-panel portal-panel-fill">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Manual Switch Plan</h3>
                <p className="portal-page-sub">Generated from the current runtime state. No fake success is shown.</p>
              </div>
            </div>
            <ol className="portal-runtime-step-list">
              {switchResult.manualSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ) : null}

        <details className="portal-runtime-details">
          <summary>Advanced Diagnostics</summary>
          <div className="portal-vllm-grid" style={{ marginTop: '1rem' }}>
            <section className="portal-panel portal-panel-fill">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Runtime Sources</h3>
                  <p className="portal-page-sub">Implementation details are kept here, not in the primary operator view.</p>
                </div>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Broker AI URL</span><span className="portal-info-table-value">{data.sourceOfTruth.brokerUrl}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">LiteLLM Public</span><span className="portal-info-table-value">{data.sourceOfTruth.liteLlmPublicBaseUrl}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">LiteLLM Internal</span><span className="portal-info-table-value">{data.sourceOfTruth.liteLlmInternalBaseUrl}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Legacy vLLM Public</span><span className="portal-info-table-value">{data.sourceOfTruth.vllmPublicBaseUrl}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">vLLM Internal</span><span className="portal-info-table-value">{data.sourceOfTruth.vllmInternalBaseUrl}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">OpenWebUI</span><span className="portal-info-table-value">{data.sourceOfTruth.openWebUiUrl}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">GPU Metrics</span><span className="portal-info-table-value">{data.sourceOfTruth.gpuMetricsSource}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Legacy Gateway</span><span className="portal-info-table-value"><span className={statusClass(toneForStatus(data.diagnostics.legacyGateway.status))}>{data.diagnostics.legacyGateway.status}</span></span></div>
              </div>
              <div className="portal-action-row" style={{ marginTop: '1rem' }}>
                <button type="button" className="portal-action-link" onClick={() => startTransition(() => void openLogs('backend'))}>View Backend Logs</button>
                <button type="button" className="portal-action-link" onClick={() => startTransition(() => void openLogs('gateway'))}>View Legacy Gateway Logs</button>
                <a href={data.sourceOfTruth.liteLlmPublicBaseUrl.replace(/\/v1$/, '')} target="_blank" rel="noopener noreferrer" className="portal-action-link">Open LiteLLM</a>
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Current Probe Notes</h3>
                  <p className="portal-page-sub">Safe server-side observations only.</p>
                </div>
              </div>
              <div className="portal-vllm-note-list">
                <div>{data.liteLlm.detail}</div>
                <div>{data.openWebUi.detail}</div>
                <div>{data.backendHealth.detail}</div>
                {data.diagnostics.runtimeWarnings.map((note) => (
                  <div key={note}>{note}</div>
                ))}
              </div>
            </section>
          </div>
        </details>
      </div>

      {reviewModel ? (
        <div className="portal-modal-backdrop" role="presentation">
          <div className="portal-modal" role="dialog" aria-modal="true">
            <div className="portal-modal-head">
              <div>
                <div className="portal-modal-title">Confirm Model Switch Review</div>
                <div className="portal-modal-copy">{reviewModel.displayName}</div>
              </div>
              <button type="button" className="portal-modal-close" onClick={() => setReviewModelId(null)}>Close</button>
            </div>
            <div className="portal-modal-body">
              <p className="portal-page-sub">
                This will stop the current vLLM backend, free GPU memory, start the selected model, test health,
                and update LiteLLM routing.
              </p>
              <p className="portal-page-sub" style={{ marginTop: '0.8rem' }}>
                Current environment is manual-gated, so the server will return the exact manual action plan instead of pretending the switch was executed.
              </p>
              <div className="portal-modal-actions">
                <button type="button" className="portal-admin-btn portal-admin-btn-secondary" onClick={() => setReviewModelId(null)}>Cancel</button>
                <button type="button" className="portal-admin-btn portal-admin-btn-primary" onClick={handleConfirmSwitch} disabled={isPending}>
                  {isPending ? 'Reviewing…' : 'Review Switch'}
                </button>
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
                <div className="portal-modal-title">{logState.source === 'backend' ? 'Backend Logs' : 'Legacy Gateway Logs'}</div>
                <div className="portal-modal-copy">{logState.container ? `${logState.container} · ${formatDateTime(logState.checkedAt)}` : logState.message}</div>
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