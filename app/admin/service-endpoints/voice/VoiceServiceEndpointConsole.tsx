'use client';

import { useEffect, useState, useTransition } from 'react';
import { PageIntro, SummaryGrid } from '../../ui';
import type { SummaryCard } from '../../data';
import type { VoiceDashboardStatus } from '@/lib/service-endpoints-voice';

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

export function VoiceServiceEndpointConsole() {
  const [data, setData] = useState<VoiceDashboardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/service-endpoints/voice', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || `Failed to load (${response.status})`);
      }
      setData(json as VoiceDashboardStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load FusionPBX voice endpoint status');
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
        const response = await fetch('/api/admin/service-endpoints/voice/test-health', {
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

  const cards: SummaryCard[] = data ? [
    {
      label: 'PBX STATUS',
      value: data.summary.pbxStatus,
      tone: data.summary.statusTone,
      detail: data.currentProbe.pbx.message,
      icon: data.currentProbe.pbx.ok ? '♡' : '△',
    },
    {
      label: 'FUSIONPBX UI',
      value: 'pbx.getouch.co',
      detail: data.serviceInformation.nativePbxUi,
      icon: '↗',
    },
    {
      label: 'VOICE API STATUS',
      value: data.summary.voiceApiStatus,
      tone: data.summary.voiceApiStatus === 'Healthy' || data.summary.voiceApiStatus === 'Protected' ? 'healthy' : 'warning',
      detail: data.currentProbe.voiceApi.message,
      icon: '◍',
    },
    {
      label: 'DB STATUS',
      value: data.summary.dbStatus,
      tone: data.summary.dbStatus === 'Ready' ? 'healthy' : 'warning',
      detail: `${formatCount(data.runtime.databaseTables)} public tables in voice`,
      icon: '▣',
    },
    {
      label: 'SIP / RTP STATUS',
      value: data.summary.sipRtpStatus,
      tone: data.summary.sipRtpStatus === 'Published' || data.summary.sipRtpStatus === 'SIP only' ? 'healthy' : 'warning',
      detail: data.runtime.directPortExposure,
      icon: '☎',
    },
    {
      label: 'LAST HEALTH CHECK',
      value: formatDateTime(data.summary.lastHealthCheck),
      detail: `PBX ${data.currentProbe.pbx.statusCode ?? 'n/a'} · Voice API ${data.currentProbe.voiceApi.statusCode ?? 'n/a'}`,
      icon: '◷',
    },
  ] : [];

  return (
    <div>
      <PageIntro
        title="FusionPBX Voice Gateway"
        subtitle="PBX and voice service endpoint powered by FusionPBX / FreeSWITCH."
      />

      {loading && !data ? <section className="portal-panel">Loading FusionPBX voice endpoint status…</section> : null}
      {error ? <section className="portal-panel">{error}</section> : null}

      {data ? (
        <>
          <SummaryGrid cards={cards} />

          <section className="portal-panel" style={{ marginBottom: '1.2rem' }}>
            <div className="portal-panel-head portal-panel-head-inline">
              <div>
                <h3 className="portal-panel-title">Quick Actions</h3>
                <p className="portal-page-sub">Use the native FusionPBX UI on pbx.getouch.co as the PBX operator surface. This portal page remains the control and status view for the service endpoint.</p>
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
                  {busy ? 'Testing…' : 'Test PBX Health'}
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
                <div className="portal-info-table-row"><span className="portal-info-table-label">Native PBX UI</span><span className="portal-info-table-value">{data.serviceInformation.nativePbxUi}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Voice API endpoint</span><span className="portal-info-table-value">{data.serviceInformation.voiceApiUrl}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Database</span><span className="portal-info-table-value">{data.serviceInformation.database}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Engine</span><span className="portal-info-table-value">{data.serviceInformation.engine}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Version</span><span className="portal-info-table-value">{data.serviceInformation.version || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Deployment mode</span><span className="portal-info-table-value">{data.serviceInformation.deploymentMode || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Route status</span><span className="portal-info-table-value">{data.serviceInformation.routeStatus}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Last checked</span><span className="portal-info-table-value">{formatDateTime(data.serviceInformation.lastChecked)}</span></div>
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Runtime / Networking</h3>
                </div>
                <span className={statusClass(data.summary.sipRtpStatus === 'Published' || data.summary.sipRtpStatus === 'SIP only' ? 'healthy' : 'warning')}>
                  {data.summary.sipRtpStatus}
                </span>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">FusionPBX web</span><span className="portal-info-table-value">{data.runtime.web.summary}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">FreeSWITCH</span><span className="portal-info-table-value">{data.runtime.freeswitch.summary}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">PBX route</span><span className="portal-info-table-value">{data.runtime.routeConfigured.pbx ? 'Configured' : 'Missing'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Voice route</span><span className="portal-info-table-value">{data.runtime.routeConfigured.voice ? 'Configured' : 'Missing'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Direct port exposure</span><span className="portal-info-table-value">{data.runtime.directPortExposure}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Compose project</span><span className="portal-info-table-value">{data.runtime.composeProject || 'Unavailable'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Domains</span><span className="portal-info-table-value">{formatCount(data.runtime.domainCount)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Extensions</span><span className="portal-info-table-value">{formatCount(data.runtime.extensionCount)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Trunks</span><span className="portal-info-table-value">{formatCount(data.runtime.trunkCount)}</span></div>
              </div>
            </section>
          </div>

          <div className="portal-detail-grid" style={{ marginBottom: '1.2rem' }}>
            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Future Tenant Mapping</h3>
                </div>
                <span className={statusClass(data.tenantMapping.rows.length > 0 ? 'healthy' : 'warning')}>
                  {data.tenantMapping.rows.length > 0 ? 'Tracked' : 'Empty'}
                </span>
              </div>
              <div className="portal-summary-detail" style={{ marginTop: 0, marginBottom: '0.9rem' }}>
                {data.tenantMapping.message}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>tenant_id</th>
                      <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>FusionPBX domain</th>
                      <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>extensions</th>
                      <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>trunks</th>
                      <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tenantMapping.rows.length > 0 ? data.tenantMapping.rows.map((row) => (
                      <tr key={`${row.tenantId}-${row.fusionpbxDomain || 'pending'}`}>
                        <td style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{row.tenantId}</td>
                        <td style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{row.fusionpbxDomain || 'Pending'}</td>
                        <td style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{row.extensions}</td>
                        <td style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{row.trunks}</td>
                        <td style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{row.status}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} style={{ padding: '0.9rem 0.5rem', color: 'rgba(255,255,255,0.72)' }}>
                          No tenant mappings yet. The future control-plane mapping is Portal tenant_id → FusionPBX domain/account → extensions and trunks.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-panel-head">
                <div>
                  <h3 className="portal-panel-title">Health Notes</h3>
                </div>
                <span className={statusClass(data.summary.statusTone)}>{data.summary.statusLabel}</span>
              </div>
              <div className="portal-activity-list">
                <div className="portal-activity-item">PBX UI: {data.currentProbe.pbx.message}</div>
                <div className="portal-activity-item">Voice API: {data.currentProbe.voiceApi.message}</div>
                <div className="portal-activity-item">Database status: {data.summary.dbStatus}.</div>
                <div className="portal-activity-item">SIP / RTP exposure: {data.summary.sipRtpStatus}.</div>
                <div className="portal-activity-item">FusionPBX UI remains the native admin interface at pbx.getouch.co. voice.getouch.co remains reserved for the future Getouch Voice API surface.</div>
              </div>
            </section>
          </div>

          <section className="portal-panel" id="logs" style={{ marginBottom: '1.2rem' }}>
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Recent Logs</h3>
                <p className="portal-page-sub">Recent runtime output from the live FusionPBX and FreeSWITCH containers. Secret-like strings are redacted.</p>
              </div>
            </div>
            <div className="portal-detail-grid">
              <section className="portal-panel portal-panel-fill">
                <h3 className="portal-panel-label">FUSIONPBX UI</h3>
                {data.runtime.logs.web.length > 0 ? (
                  <div className="portal-activity-list">
                    {data.runtime.logs.web.map((line, index) => (
                      <div key={`${index}-${line}`} className="portal-activity-item">{line}</div>
                    ))}
                  </div>
                ) : (
                  <div className="portal-summary-detail">No recent FusionPBX log lines were captured.</div>
                )}
              </section>
              <section className="portal-panel portal-panel-fill">
                <h3 className="portal-panel-label">FREESWITCH</h3>
                {data.runtime.logs.freeswitch.length > 0 ? (
                  <div className="portal-activity-list">
                    {data.runtime.logs.freeswitch.map((line, index) => (
                      <div key={`${index}-${line}`} className="portal-activity-item">{line}</div>
                    ))}
                  </div>
                ) : (
                  <div className="portal-summary-detail">No recent FreeSWITCH log lines were captured.</div>
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