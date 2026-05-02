import { Breadcrumb, PageIntro } from '../../ui';
import {
  describeN8n,
  formatRuntimeSource,
  resolveRuntimeSource,
} from '@/lib/platform-service-shared';
import { getPlatformServicesSnapshot } from '@/lib/platform-services';

export const dynamic = 'force-dynamic';

function statusClassName(tone: 'healthy' | 'active' | 'warning' | 'critical' | 'info') {
  if (tone === 'warning' || tone === 'critical') return 'portal-status portal-status-warning';
  if (tone === 'healthy' || tone === 'active') return 'portal-status portal-status-good';
  return 'portal-status portal-status-active';
}

function formatOriginStatus(code: number | null) {
  if (code === null) return 'Unknown';
  if (code === 421) return 'Not served by origin';
  if (code === 401) return '401 Protected';
  if (code === 403) return '403 Forbidden';
  if (code === 405) return '405 Method restricted';
  return String(code);
}

function formatEdgeStatus(code: number | null) {
  if (code === null) return 'Not checked';
  if (code === 401) return '401 Protected';
  if (code === 403) return '403 Forbidden';
  if (code === 405) return '405 Method restricted';
  return String(code);
}

export default async function N8nAutomationPage() {
  const snapshot = await getPlatformServicesSnapshot();
  const status = describeN8n(snapshot);
  const primary = snapshot.n8n.containers[0] || null;

  return (
    <div className="portal-body">
      <Breadcrumb category="AI Engine & Data Flow" page="n8n Workflows" />
      <PageIntro
        title="n8n Workflows"
        subtitle="Workflow automation and integration runner for webhooks, schedules, and AI-triggered actions."
      />

      <section className="portal-panel">
        <div className="portal-panel-head portal-panel-head-inline">
          <div>
            <h3 className="portal-panel-title">Workflow Runtime</h3>
            <p className="portal-page-sub">n8n is currently tracked from the news automation stack without exposing any credentials.</p>
          </div>
          <span className={statusClassName(status.tone)}>{status.label}</span>
        </div>

        <div className="portal-info-table">
          <div className="portal-info-table-row"><span className="portal-info-table-label">Public URL</span><span className="portal-info-table-value">{snapshot.n8n.publicUrl || 'Not configured'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Origin route</span><span className="portal-info-table-value">{formatOriginStatus(snapshot.n8n.publicOriginCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Public edge</span><span className="portal-info-table-value">{formatEdgeStatus(snapshot.n8n.publicEdgeCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Runtime source</span><span className="portal-info-table-value">{primary ? `${formatRuntimeSource(resolveRuntimeSource(primary))} · ${primary.name}` : 'Existing news automation stack'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Health check</span><span className="portal-info-table-value">Public workflow route responds at the origin and basic auth remains enabled.</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Auth / Security</span><span className="portal-info-table-value">{snapshot.n8n.basicAuthEnabled ? 'Basic auth enabled' : 'Authentication signal not detected from probe.'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Setup / Onboarding</span><span className="portal-info-table-value">Workflow metrics are still awaiting API integration.</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Internal URL</span><span className="portal-info-table-value">{snapshot.n8n.internalUrl || 'Unknown'}</span></div>
        </div>

        {snapshot.n8n.publicUrl ? (
          <div className="portal-action-row">
            <a href={snapshot.n8n.publicUrl} target="_blank" rel="noopener noreferrer" className="portal-action-link">Open n8n</a>
          </div>
        ) : null}
      </section>
    </div>
  );
}