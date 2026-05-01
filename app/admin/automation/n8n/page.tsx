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
  return String(code);
}

export default async function N8nAutomationPage() {
  const snapshot = await getPlatformServicesSnapshot();
  const status = describeN8n(snapshot);
  const primary = snapshot.n8n.containers[0] || null;

  return (
    <div className="portal-body">
      <Breadcrumb category="Automation & Data Flow" page="n8n Workflows" />
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
          <div className="portal-info-table-row"><span className="portal-info-table-label">Configured URL</span><span className="portal-info-table-value">{snapshot.n8n.publicUrl || 'Not configured'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Origin route</span><span className="portal-info-table-value">{formatOriginStatus(snapshot.n8n.publicOriginCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Internal URL</span><span className="portal-info-table-value">{snapshot.n8n.internalUrl || 'Unknown'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Runtime source</span><span className="portal-info-table-value">{formatRuntimeSource(resolveRuntimeSource(primary))}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Container</span><span className="portal-info-table-value">{primary?.name || 'None detected'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Health</span><span className="portal-info-table-value">{primary?.health || primary?.status || 'Unknown'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Auth</span><span className="portal-info-table-value">{snapshot.n8n.basicAuthEnabled ? 'Basic auth enabled' : 'No auth signal detected'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Metrics</span><span className="portal-info-table-value">Workflow metrics awaiting API integration</span></div>
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