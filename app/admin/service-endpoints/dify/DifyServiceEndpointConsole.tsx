'use client';

import { useEffect, useState, useTransition } from 'react';
import type { SummaryCard } from '../../data';
import { PageIntro, SummaryGrid } from '../../ui';

type SecretInventoryItem = {
  service: string;
  envName: string;
  secretType: string;
  status: 'configured' | 'missing' | 'unknown';
  managedBy: string;
  notes?: string;
};

type DifyDashboardStatus = {
  checkedAt: string;
  summary: {
    statusLabel: string;
    statusTone: 'healthy' | 'warning';
    publicEndpoint: string;
    appsCount: number | null;
    workflowsCount: number | null;
    knowledgeBasesCount: number | null;
    workerStatus: string;
    providerStatus: string;
    lastHealthCheck: string;
  };
  serviceInformation: {
    publicUrl: string;
    internalUrl: string | null;
    version: string | null;
    databaseName: string;
    databaseStatus: string | null;
    redisStatus: string | null;
    storageStatus: string | null;
    deploymentMode: string;
    lastHealthCheck: string;
    apiHealthEndpoint: string;
    apiHealthAvailable: boolean;
    appsApiStatus: string;
  };
  runtimeComponents: Array<{
    key: 'database' | 'redis' | 'worker' | 'sandbox' | 'plugin-daemon';
    label: string;
    status: 'healthy' | 'warning';
    detail: string;
    observable: boolean;
  }>;
  quickActions: Array<{ label: string; href: string; external?: boolean }>;
  apiAccess: {
    managerUrl: string;
    secrets: SecretInventoryItem[];
    summary: string;
  };
  tenantMappings: {
    summary: string;
    rows: Array<{
      id: string;
      tenantId: string;
      difyWorkspaceId: string | null;
      difyAppId: string | null;
      difyWorkflowId: string | null;
      status: string;
      assignedBotWorkflow: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  providerPlan: {
    currentStatus: string;
    currentEndpoint: string;
    currentModelAlias: string;
    futureEndpoint: string;
    note: string;
  };
  integrationFlow: string[];
  usage: {
    recentHealthChecks: Array<{
      id: string;
      label: string;
      domain: string;
      status: string;
      message: string | null;
      testedAt: string | null;
    }>;
    recentApiCallsAvailable: boolean;
  };
  managedConnections: {
    total: number;
    active: number;
  };
  currentProbe: {
    checkedAt: string;
    ok: boolean;
    statusCode: number | null;
    target: string;
    message: string;
  };
};

function formatDateTime(value: string | null) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString();
}

function formatCount(value: number | null) {
  return value === null ? 'Unavailable' : value.toLocaleString();
}

function formatAppsAndWorkflows(apps: number | null, workflows: number | null) {
  if (apps === null && workflows === null) return 'Unavailable';
  return `${formatCount(apps)} / ${formatCount(workflows)}`;
}

function statusClass(ok: boolean) {
  return ok ? 'portal-status portal-status-good' : 'portal-status portal-status-warning';
}

export function DifyServiceEndpointConsole() {
  const [data, setData] = useState<DifyDashboardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/service-endpoints/dify', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || `Failed to load (${response.status})`);
      }
      setData(json as DifyDashboardStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Dify endpoint status');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function runHealthCheck() {
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/service-endpoints/dify/test-health', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || `Health check failed (${response.status})`);
        }
        setHealthMessage(json.message || 'Health check completed.');
        await reload();
      } catch (err) {
        setHealthMessage(err instanceof Error ? err.message : 'Health check failed');
      }
    });
  }

  const runtimeByKey = new Map(data?.runtimeComponents.map((item) => [item.key, item]));
  const workerComponent = runtimeByKey.get('worker');
  const sandboxComponent = runtimeByKey.get('sandbox');
  const pluginDaemonComponent = runtimeByKey.get('plugin-daemon');

  const cards: SummaryCard[] = data ? [
    {
      label: 'DIFY STATUS',
      value: data.summary.statusLabel,
      tone: data.summary.statusTone,
      detail: data.currentProbe.message,
      icon: data.currentProbe.ok ? '♡' : '△',
    },
    {
      label: 'PUBLIC ENDPOINT',
      value: 'dify.getouch.co',
      detail: data.summary.publicEndpoint,
      icon: '↗',
    },
    {
      label: 'APPS / WORKFLOWS',
      value: formatAppsAndWorkflows(data.summary.appsCount, data.summary.workflowsCount),
      detail: 'Portal-managed Dify app and workflow mappings.',
      icon: '⇄',
    },
    {
      label: 'KNOWLEDGE BASES',
      value: formatCount(data.summary.knowledgeBasesCount),
      detail: 'Not exposed by the public Dify endpoint yet.',
      icon: '▤',
    },
    {
      label: 'WORKER STATUS',
      value: workerComponent?.observable ? 'Healthy' : 'Unknown',
      tone: workerComponent?.observable ? 'healthy' : 'warning',
      detail: workerComponent?.detail || data.summary.workerStatus,
      icon: '◷',
    },
    {
      label: 'LAST HEALTH CHECK',
      value: formatDateTime(data.summary.lastHealthCheck),
      detail: `HTTP ${data.currentProbe.statusCode ?? 'n/a'} from ${data.currentProbe.target}`,
      icon: '↻',
    },
  ] : [];

  return (
    <div>
      <PageIntro
        title="Dify AI Workflow Platform"
        subtitle="AI workflow, chatbot, and knowledge base service endpoint powered by Dify."
      />

      {loading && !data ? <section className="portal-panel">Loading Dify endpoint status…</section> : null}
      {error ? <section className="portal-panel">{error}</section> : null}

      {data ? (
        <>
          <SummaryGrid cards={cards} />

          <section className="portal-panel" style={{ marginBottom: '1.2rem' }}>
            <div className="portal-panel-head portal-panel-head-inline">
              <div>
                <h3 className="portal-panel-title">Quick Actions</h3>
                <p className="portal-page-sub">The native Dify workspace at dify.getouch.co remains the source of truth for apps, workflows, and knowledge operations.</p>
              </div>
              <div className="portal-action-row">
                {data.quickActions.map((action) => (
                  <a
                    key={action.label}
                    href={action.href}
                    target={action.external ? '_blank' : undefined}
                    rel={action.external ? 'noopener noreferrer' : undefined}
                    className="portal-action-link"
                  >
                    {action.label}
                  </a>
                ))}
                <button type="button" className="portal-action-link" style={{ cursor: 'pointer' }} onClick={runHealthCheck} disabled={busy}>
                  {busy ? 'Testing…' : 'Test Health'}
                </button>
              </div>
            </div>
            {healthMessage ? <div className="portal-summary-detail">{healthMessage}</div> : null}
          </section>

          <div className="portal-detail-grid" style={{ marginBottom: '1.2rem' }}>
            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Service Information</h3>
                </div>
                <span className={statusClass(data.currentProbe.ok)}>{data.summary.statusLabel}</span>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Public URL</span><span className="portal-info-table-value">{data.serviceInformation.publicUrl}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Database</span><span className="portal-info-table-value">{data.serviceInformation.databaseName}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Redis status</span><span className="portal-info-table-value">{data.serviceInformation.redisStatus || 'Not exposed by public endpoint'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Worker status</span><span className="portal-info-table-value">{workerComponent?.detail || data.summary.workerStatus}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Sandbox status</span><span className="portal-info-table-value">{sandboxComponent?.detail || 'Not exposed by public endpoint'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Plugin daemon status</span><span className="portal-info-table-value">{pluginDaemonComponent?.detail || 'Not exposed by public endpoint'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Version</span><span className="portal-info-table-value">{data.serviceInformation.version || 'Not available from portal runtime'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Deployment mode</span><span className="portal-info-table-value">{data.serviceInformation.deploymentMode}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Last checked</span><span className="portal-info-table-value">{formatDateTime(data.serviceInformation.lastHealthCheck)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Console API probe</span><span className="portal-info-table-value">{data.serviceInformation.appsApiStatus}</span></div>
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Runtime Visibility</h3>
                </div>
                <span className={statusClass(data.runtimeComponents.some((item) => item.observable))}>
                  {data.runtimeComponents.some((item) => item.observable) ? 'Live' : 'Limited'}
                </span>
              </div>
              <div className="portal-activity-list">
                {data.runtimeComponents.map((component) => (
                  <div key={component.key} className="portal-activity-item">
                    <strong>{component.label}</strong> · {component.observable ? 'observable' : 'not exposed'} · {component.detail}
                  </div>
                ))}
              </div>
              <div className="portal-summary-detail" style={{ marginTop: '1rem' }}>
                {data.serviceInformation.databaseStatus}
              </div>
            </section>
          </div>

          <div className="portal-detail-grid" style={{ marginBottom: '1.2rem' }}>
            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Future Tenant Mapping</h3>
                </div>
                <span className={statusClass(data.tenantMappings.rows.length > 0)}>
                  {data.tenantMappings.rows.length > 0 ? 'Mapped' : 'Empty'}
                </span>
              </div>
              {data.tenantMappings.rows.length > 0 ? (
                <div className="portal-activity-list">
                  {data.tenantMappings.rows.map((mapping) => (
                    <div key={mapping.id} className="portal-activity-item">
                      <strong>Portal tenant_id {mapping.tenantId}</strong>
                      {` · workspace ${mapping.difyWorkspaceId || 'unassigned'}`}
                      {` · app ${mapping.difyAppId || 'unassigned'}`}
                      {` · workflow ${mapping.difyWorkflowId || 'unassigned'}`}
                      {` · status ${mapping.status}`}
                      {` · assigned ${mapping.assignedBotWorkflow || 'not assigned'}`}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="portal-summary-detail">{data.tenantMappings.summary}</div>
                  <div className="portal-activity-list" style={{ marginTop: '1rem' }}>
                    <div className="portal-activity-item">Tracked fields will be: Portal tenant_id, Dify workspace id, Dify app id, Dify workflow id, status, and assigned bot/workflow.</div>
                  </div>
                </>
              )}
            </section>

            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Model Provider Plan</h3>
                </div>
                <a href={data.apiAccess.managerUrl} className="portal-action-link">Open Key Manager</a>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Current status</span><span className="portal-info-table-value">{data.providerPlan.currentStatus}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">vLLM API</span><span className="portal-info-table-value">{data.providerPlan.currentEndpoint}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Model alias</span><span className="portal-info-table-value">{data.providerPlan.currentModelAlias}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Future LiteLLM URL</span><span className="portal-info-table-value">{data.providerPlan.futureEndpoint}</span></div>
              </div>
              <div className="portal-summary-detail" style={{ marginTop: '1rem', marginBottom: '0.9rem' }}>{data.providerPlan.note}</div>
              <div className="portal-summary-detail">Portal-visible Dify key inventory: {data.apiAccess.summary}</div>
            </section>
          </div>

          <div className="portal-detail-grid" style={{ marginBottom: '1.2rem' }}>
            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Last Health Checks</h3>
                </div>
                <span className={statusClass(data.usage.recentHealthChecks.length > 0)}>
                  {data.usage.recentHealthChecks.length > 0 ? 'Tracked' : 'Empty'}
                </span>
              </div>
              {data.usage.recentHealthChecks.length > 0 ? (
                <div className="portal-activity-list">
                  {data.usage.recentHealthChecks.map((check) => (
                    <div key={check.id} className="portal-activity-item">
                      <strong>{check.label}</strong> on {check.domain} · {check.status} · {check.testedAt ? formatDateTime(check.testedAt) : 'Never tested'}
                      {check.message ? ` · ${check.message}` : ''}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="portal-summary-detail">No recent Dify health checks are stored in the portal database yet.</div>
              )}
              <div className="portal-summary-detail" style={{ marginTop: '1rem' }}>
                Managed Dify connections tracked in portal: {data.managedConnections.total} total, {data.managedConnections.active} active.
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Future Bot / Handover Flow</h3>
                </div>
                <span className={statusClass(false)}>Planned</span>
              </div>
              <div className="portal-activity-list">
                {data.integrationFlow.map((item) => (
                  <div key={item} className="portal-activity-item">{item}</div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}