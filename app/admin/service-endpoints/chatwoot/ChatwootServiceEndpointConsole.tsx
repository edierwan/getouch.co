'use client';

import { useEffect, useState, useTransition } from 'react';
import { Breadcrumb, PageIntro, SummaryGrid } from '../../ui';
import type { ChatwootDashboardStatus } from '@/lib/service-endpoints-chatwoot';

function formatDateTime(value: string | null) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString();
}

function formatCount(value: number | null) {
  return value === null ? 'Unavailable' : value.toLocaleString();
}

function statusClass(tone: 'healthy' | 'warning') {
  return tone === 'healthy' ? 'portal-status portal-status-good' : 'portal-status portal-status-warning';
}

export function ChatwootServiceEndpointConsole() {
  const [data, setData] = useState<ChatwootDashboardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/service-endpoints/chatwoot', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || `Failed to load (${response.status})`);
      }
      setData(json as ChatwootDashboardStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Chatwoot endpoint status');
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
        const response = await fetch('/api/admin/service-endpoints/chatwoot/test-health', {
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
      label: 'CHATWOOT STATUS',
      value: data.summary.statusLabel,
      tone: data.summary.statusTone,
      detail: data.currentProbe.message,
      icon: data.currentProbe.ok ? '♡' : '△',
    },
    {
      label: 'PUBLIC ENDPOINT',
      value: 'chatwoot.getouch.co',
      detail: data.summary.publicEndpoint,
      icon: '↗',
    },
    {
      label: 'ACCOUNTS / INBOXES',
      value: `${formatCount(data.summary.accountsCount)} / ${formatCount(data.summary.inboxesCount)}`,
      detail: 'Live counts from the Chatwoot runtime database.',
      icon: '▣',
    },
    {
      label: 'CONVERSATIONS',
      value: formatCount(data.summary.conversationsCount),
      detail: 'Conversation rows currently stored in Chatwoot.',
      icon: '◫',
    },
    {
      label: 'WORKER STATUS',
      value: data.summary.workerStatus,
      detail: data.serviceInformation.workerStatus || 'Worker state unavailable',
      icon: '↻',
    },
    {
      label: 'LAST HEALTH CHECK',
      value: formatDateTime(data.summary.lastHealthCheck),
      detail: `HTTP ${data.currentProbe.statusCode ?? 'n/a'} from ${data.currentProbe.target}`,
      icon: '◷',
    },
  ] : [];

  return (
    <div>
      <Breadcrumb category="Communications" page="Chatwoot" />
      <PageIntro
        title="Chatwoot"
        subtitle="Omnichannel customer support and human handover. The Chatwoot agent UI at https://chatwoot.getouch.co is the operator workspace; this page is the portal control and status view."
      />

      {loading && !data ? <section className="portal-panel">Loading Chatwoot endpoint status…</section> : null}
      {error ? <section className="portal-panel">{error}</section> : null}

      {data ? (
        <>
          <SummaryGrid cards={cards} />

          <section className="portal-panel" style={{ marginBottom: '1.2rem' }}>
            <div className="portal-panel-head portal-panel-head-inline">
              <div>
                <h3 className="portal-panel-title">Quick Actions</h3>
                <p className="portal-page-sub">Use Chatwoot as the native agent UI. This portal page is the control and status view for the service endpoint.</p>
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
                <span className={statusClass(data.summary.statusTone)}>{data.summary.statusLabel}</span>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Public URL</span><span className="portal-info-table-value">{data.serviceInformation.publicUrl}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Database</span><span className="portal-info-table-value">{data.serviceInformation.database || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Database status</span><span className="portal-info-table-value">{data.serviceInformation.databaseStatus || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Redis status</span><span className="portal-info-table-value">{data.serviceInformation.redisStatus || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Worker status</span><span className="portal-info-table-value">{data.serviceInformation.workerStatus || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Version</span><span className="portal-info-table-value">{data.serviceInformation.version || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Deployment mode</span><span className="portal-info-table-value">{data.serviceInformation.deploymentMode || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Route status</span><span className="portal-info-table-value">{data.serviceInformation.routeStatus || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Storage</span><span className="portal-info-table-value">{data.serviceInformation.storageStatus || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Last checked</span><span className="portal-info-table-value">{formatDateTime(data.serviceInformation.lastChecked)}</span></div>
              </div>
            </section>

            <section className="portal-panel" id="workers">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Runtime / Workers</h3>
                </div>
                <span className={statusClass(data.runtime.publicPortExposed ? 'warning' : 'healthy')}>
                  {data.runtime.publicPortExposed ? 'Review Needed' : 'Private'}
                </span>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Web container</span><span className="portal-info-table-value">{data.runtime.web.summary}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Worker container</span><span className="portal-info-table-value">{data.runtime.worker.summary}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Redis container</span><span className="portal-info-table-value">{data.runtime.redis.summary}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Direct port exposure</span><span className="portal-info-table-value">{data.serviceInformation.directPortExposure || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Compose project</span><span className="portal-info-table-value">{data.runtime.composeProject || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Web started</span><span className="portal-info-table-value">{formatDateTime(data.runtime.web.startedAt)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Worker started</span><span className="portal-info-table-value">{formatDateTime(data.runtime.worker.startedAt)}</span></div>
              </div>
            </section>
          </div>

          <div className="portal-detail-grid" style={{ marginBottom: '1.2rem' }}>
            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Future Tenant Mapping</h3>
                </div>
                <span className={statusClass(data.tenantMapping.total > 0 ? 'healthy' : 'warning')}>
                  {data.tenantMapping.total > 0 ? 'Tracked' : 'Empty'}
                </span>
              </div>
              <div className="portal-summary-detail" style={{ marginTop: 0, marginBottom: '0.9rem' }}>
                {data.tenantMapping.message}
              </div>
              {data.tenantMapping.rows.length > 0 ? (
                <div className="portal-activity-list">
                  {data.tenantMapping.rows.map((row) => (
                    <div key={row.id} className="portal-activity-item">
                      Portal tenant {row.tenantId} to Chatwoot account {row.chatwootAccountId} to inbox {row.chatwootInboxId ?? 'not mapped'} with status {row.status} and assigned channels {row.assignedChannels?.join(', ') || 'not wired into portal metadata yet'}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="portal-summary-detail">No portal tenant_id mappings are stored yet. Add them only when a Portal tenant is explicitly mapped to a Chatwoot account and inbox.</div>
              )}
            </section>

            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Handover / Integration Plan</h3>
                </div>
                <span className={statusClass(true ? 'healthy' : 'warning')}>Planned</span>
              </div>
              <div className="portal-activity-list">
                <div className="portal-activity-item">WhatsApp message to Baileys or Evolution Gateway, then to the Getouch routing layer, then to Dify when automation is enabled, and finally to Chatwoot when human handover is required.</div>
                <div className="portal-activity-item">Agent replies are expected to originate from Chatwoot and route back through the selected WhatsApp provider later.</div>
                <div className="portal-activity-item">Portal metadata should only store tenant_id to Chatwoot account and inbox mappings. Chatwoot runtime data stays inside the Chatwoot database.</div>
                <div className="portal-activity-item">Current live usage counts: users {formatCount(data.usage.usersCount)}, accounts {formatCount(data.usage.accountsCount)}, inboxes {formatCount(data.usage.inboxesCount)}, conversations {formatCount(data.usage.conversationsCount)}.</div>
              </div>
            </section>
          </div>

          <section className="portal-panel" id="logs" style={{ marginBottom: '1.2rem' }}>
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Recent Logs</h3>
                <p className="portal-page-sub">Recent runtime output from the live Chatwoot containers. Secret-like strings are redacted.</p>
              </div>
            </div>
            <div className="portal-detail-grid">
              <section className="portal-panel portal-panel-fill">
                <h3 className="portal-panel-label">WEB</h3>
                {data.runtime.logs.web.length > 0 ? (
                  <div className="portal-activity-list">
                    {data.runtime.logs.web.map((line, index) => (
                      <div key={`${index}-${line}`} className="portal-activity-item">{line}</div>
                    ))}
                  </div>
                ) : (
                  <div className="portal-summary-detail">No recent web log lines were captured.</div>
                )}
              </section>
              <section className="portal-panel portal-panel-fill">
                <h3 className="portal-panel-label">WORKER</h3>
                {data.runtime.logs.worker.length > 0 ? (
                  <div className="portal-activity-list">
                    {data.runtime.logs.worker.map((line, index) => (
                      <div key={`${index}-${line}`} className="portal-activity-item">{line}</div>
                    ))}
                  </div>
                ) : (
                  <div className="portal-summary-detail">No recent worker log lines were captured.</div>
                )}
              </section>
            </div>
            {data.notes.length > 0 ? (
              <div className="portal-summary-detail" style={{ marginTop: '1rem' }}>
                {data.notes.join(' ')}
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}