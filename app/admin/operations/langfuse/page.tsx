import { Breadcrumb, PageIntro } from '../../ui';
import {
  describeClickHouse,
  describeLangfuse,
  describeRedis,
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
  return String(code);
}

export default async function LangfuseOperationsPage() {
  const snapshot = await getPlatformServicesSnapshot();
  const langfuse = describeLangfuse(snapshot);
  const clickhouse = describeClickHouse(snapshot);
  const redis = describeRedis(snapshot);
  const langfusePrimary = snapshot.langfuse.containers[0] || null;
  const clickhousePrimary = snapshot.clickhouse.containers[0] || null;

  return (
    <div className="portal-body">
      <Breadcrumb category="Observability & Tracing" page="Langfuse" />
      <PageIntro
        title="Langfuse"
        subtitle="AI observability surface for tracing, prompt debugging, latency, and tenant-scoped evaluation metadata."
      />

      <section className="portal-panel">
        <div className="portal-panel-head portal-panel-head-inline">
          <div>
            <h3 className="portal-panel-title">Observability Runtime</h3>
            <p className="portal-page-sub">Portal status page for Langfuse without embedding the external UI.</p>
          </div>
          <span className={statusClassName(langfuse.tone)}>{langfuse.label}</span>
        </div>
        <div className="portal-info-table">
          <div className="portal-info-table-row"><span className="portal-info-table-label">Public URL</span><span className="portal-info-table-value">{snapshot.langfuse.publicUrl || 'Not configured'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Origin route</span><span className="portal-info-table-value">{formatOriginStatus(snapshot.langfuse.publicOriginCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Public edge</span><span className="portal-info-table-value">{formatEdgeStatus(snapshot.langfuse.publicEdgeCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Runtime source</span><span className="portal-info-table-value">{langfusePrimary ? `${formatRuntimeSource(resolveRuntimeSource(langfusePrimary))} · ${langfusePrimary.name}` : 'Coolify-managed observability stack'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Health check</span><span className="portal-info-table-value">/api/public/health returns 200 and the public UI is reachable.</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Auth / Security</span><span className="portal-info-table-value">Langfuse remains authenticated and tenant traces should avoid sensitive payloads.</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Setup / Onboarding</span><span className="portal-info-table-value">Project creation and API key onboarding are still pending.</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Status detail</span><span className="portal-info-table-value">{langfuse.detail}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Dependencies</span><span className="portal-info-table-value">PostgreSQL (langfuse), ClickHouse, Redis / queue cache</span></div>
        </div>

        {snapshot.langfuse.publicUrl ? (
          <div className="portal-action-row">
            <a href={snapshot.langfuse.publicUrl} target="_blank" rel="noopener noreferrer" className="portal-action-link">Open Langfuse</a>
          </div>
        ) : null}
      </section>

      <section className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Dependency Status</h3>
            <p className="portal-page-sub">Operational status for the trace store and queue/cache dependencies.</p>
          </div>
        </div>
        <div className="portal-info-table">
          <div className="portal-info-table-row"><span className="portal-info-table-label">ClickHouse</span><span className="portal-info-table-value">{clickhouse.label} · {clickhousePrimary?.name || snapshot.clickhouse.internalUrl || 'Awaiting deployment'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">ClickHouse route</span><span className="portal-info-table-value">{formatOriginStatus(snapshot.clickhouse.publicOriginCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">ClickHouse edge</span><span className="portal-info-table-value">{formatEdgeStatus(snapshot.clickhouse.publicEdgeCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Redis / Queue Cache</span><span className="portal-info-table-value">{redis.label} · {snapshot.redis.primary?.name || 'No Redis runtime detected'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Redis exposure</span><span className="portal-info-table-value">Internal only</span></div>
        </div>
      </section>

      <section className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Multi-Tenant Readiness</h3>
            <p className="portal-page-sub">Required trace metadata for future tenant-aware AI observability.</p>
          </div>
        </div>
        <div className="portal-activity-list">
          <div className="portal-activity-item">Langfuse is installed and healthy, but the first admin onboarding flow still needs to be completed.</div>
          <div className="portal-activity-item">tenant_id and tenant_slug should be attached to every AI trace.</div>
          <div className="portal-activity-item">Include channel, conversation_id, app_id, and workflow_id on every request chain.</div>
          <div className="portal-activity-item">Do not log secrets or sensitive customer payloads in trace metadata.</div>
        </div>
      </section>
    </div>
  );
}