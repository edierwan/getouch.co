'use client';

import { useEffect, useState, useTransition } from 'react';
import { Breadcrumb, PageIntro, SummaryGrid } from '../../ui';

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
    providerStatus: string;
    lastHealthCheck: string;
  };
  serviceInformation: {
    publicUrl: string;
    internalUrl: string | null;
    version: string | null;
    databaseStatus: string | null;
    redisStatus: string | null;
    storageStatus: string | null;
    lastHealthCheck: string;
    apiHealthEndpoint: string;
    apiHealthAvailable: boolean;
    appsApiStatus: string;
  };
  quickActions: Array<{ label: string; href: string; external?: boolean }>;
  apiAccess: {
    managerUrl: string;
    secrets: SecretInventoryItem[];
    summary: string;
  };
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

  const cards = data ? [
    {
      label: 'STATUS',
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
      label: 'APPS COUNT',
      value: formatCount(data.summary.appsCount),
      detail: 'Portal-managed Dify app connections.',
      icon: '▣',
    },
    {
      label: 'WORKFLOWS COUNT',
      value: formatCount(data.summary.workflowsCount),
      detail: 'Portal-managed Dify workflow connections.',
      icon: '⇄',
    },
    {
      label: 'API KEYS / PROVIDERS',
      value: data.summary.providerStatus,
      detail: 'No secret values are exposed here.',
      icon: '⚿',
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
      <Breadcrumb category="Communication Hubs" page="Dify" />
      <PageIntro
        title="Dify"
        subtitle="AI workflow and bot builder. The Dify workspace at https://dify.getouch.co remains the source of truth for apps and workflows; this page is the monitoring and quick-action surface."
      />

      {loading && !data ? <section className="portal-panel">Loading Dify endpoint status…</section> : null}
      {error ? <section className="portal-panel">{error}</section> : null}

      {data ? (
        <>
          <SummaryGrid cards={cards} className="portal-summary-grid-compact" />

          <section className="portal-panel" style={{ marginBottom: '1.2rem' }}>
            <div className="portal-panel-head portal-panel-head-inline">
              <div>
                <h3 className="portal-panel-title">Quick Actions</h3>
                <p className="portal-page-sub">This page monitors the endpoint. The native Dify workspace at dify.getouch.co remains the source of truth for apps and workflows.</p>
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
                <div className="portal-info-table-row"><span className="portal-info-table-label">Internal URL</span><span className="portal-info-table-value">{data.serviceInformation.internalUrl || 'Not exposed in portal runtime'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Version</span><span className="portal-info-table-value">{data.serviceInformation.version || 'Not available from portal runtime'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Database status</span><span className="portal-info-table-value">{data.serviceInformation.databaseStatus || 'Not exposed by public endpoint'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Redis status</span><span className="portal-info-table-value">{data.serviceInformation.redisStatus || 'Not exposed by public endpoint'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Storage status</span><span className="portal-info-table-value">{data.serviceInformation.storageStatus || 'Not exposed by public endpoint'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Last health check</span><span className="portal-info-table-value">{formatDateTime(data.serviceInformation.lastHealthCheck)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Console API probe</span><span className="portal-info-table-value">{data.serviceInformation.appsApiStatus}</span></div>
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">API Access</h3>
                </div>
                <a href={data.apiAccess.managerUrl} className="portal-action-link">Open Key Manager</a>
              </div>
              <div className="portal-summary-detail" style={{ marginTop: 0, marginBottom: '0.9rem' }}>
                {data.apiAccess.summary}
              </div>
              {data.apiAccess.secrets.length > 0 ? (
                <div className="portal-info-table">
                  {data.apiAccess.secrets.map((secret) => (
                    <div key={secret.envName} className="portal-info-table-row">
                      <span className="portal-info-table-label">{secret.envName}</span>
                      <span className="portal-info-table-value">{secret.secretType} · {secret.status} · managed by {secret.managedBy}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="portal-summary-detail">No Dify-specific secrets are wired into the portal runtime.</div>
              )}
            </section>
          </div>

          <div className="portal-detail-grid" style={{ marginBottom: '1.2rem' }}>
            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Usage / Activity</h3>
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
                {data.usage.recentApiCallsAvailable
                  ? 'Recent Dify API calls are available.'
                  : 'Recent Dify API calls are not wired into the portal yet, so this section stays empty by design.'}
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">How To Use</h3>
                </div>
                <span className={statusClass(true)}>Info</span>
              </div>
              <div className="portal-activity-list">
                <div className="portal-activity-item">External apps and operators should continue using dify.getouch.co for the native Dify UI and API surface.</div>
                <div className="portal-activity-item">The Getouch portal page at /ai/dify is a control and status view for endpoint reachability, connection inventory, and key wiring.</div>
                <div className="portal-activity-item">No Dify secrets are rendered here. Use the central API Key Manager for managed keys and the native Dify workspace for app-level administration.</div>
                <div className="portal-activity-item">Managed connections tracked in portal: {data.managedConnections.total} total, {data.managedConnections.active} active.</div>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}