import { Breadcrumb, PageIntro } from '../ui';
import { SERVICE_OVERVIEW_CONFIGS, type ServiceOverviewConfig } from '../_lib/service-overviews';
import { getPlatformServicesSnapshot } from '@/lib/platform-services';
import {
  describeServiceProbe,
  formatRuntimeSource,
  getCatalogService,
  resolveRuntimeSource,
} from '@/lib/platform-service-shared';

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

function formatEdgeStatus(code: number | null) {
  if (code === null) return 'Not checked';
  return String(code);
}

export async function ServiceOverviewPage({ config }: { config: ServiceOverviewConfig }) {
  const snapshot = await getPlatformServicesSnapshot();
  const probe = getCatalogService(snapshot, config.probeKey);
  const status = describeServiceProbe(probe, config.statusOptions);
  const primary = probe.containers[0] || null;

  return (
    <div className="portal-body">
      <Breadcrumb category={config.category} page={config.title} />
      <PageIntro title={config.title} subtitle={config.subtitle} />

      <section className="portal-panel">
        <div className="portal-panel-head portal-panel-head-inline">
          <div>
            <h3 className="portal-panel-title">Runtime Overview</h3>
            <p className="portal-page-sub">Live portal audit summary for this service without embedding the external UI.</p>
          </div>
          <span className={statusClassName(status.tone)}>{status.label}</span>
        </div>

        <div className="portal-info-table">
          <div className="portal-info-table-row"><span className="portal-info-table-label">Purpose</span><span className="portal-info-table-value">{config.purpose}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Role</span><span className="portal-info-table-value">{config.role}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Public URL</span><span className="portal-info-table-value">{probe.publicUrl || 'Not configured'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Origin route</span><span className="portal-info-table-value">{formatOriginStatus(probe.publicOriginCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Public edge</span><span className="portal-info-table-value">{formatEdgeStatus(probe.publicEdgeCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Internal URL</span><span className="portal-info-table-value">{probe.internalUrl || 'Not available'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Runtime source</span><span className="portal-info-table-value">{formatRuntimeSource(resolveRuntimeSource(primary))}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Container / Service</span><span className="portal-info-table-value">{primary?.name || 'None detected'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Health check</span><span className="portal-info-table-value">{primary?.health || primary?.status || status.detail}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Status detail</span><span className="portal-info-table-value">{status.detail}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Dependencies</span><span className="portal-info-table-value">{config.dependencies.join(' | ')}</span></div>
        </div>

        {config.externalOpenUrl ? (
          <div className="portal-action-row">
            <a href={config.externalOpenUrl} target="_blank" rel="noopener noreferrer" className="portal-action-link">Open {config.title}</a>
          </div>
        ) : null}
      </section>

      <section className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Readiness Notes</h3>
            <p className="portal-page-sub">Current deployment and security posture notes tracked for this runtime.</p>
          </div>
        </div>
        <div className="portal-activity-list">
          {config.readinessNotes.map((note) => (
            <div key={note} className="portal-activity-item">{note}</div>
          ))}
          {probe.notes.map((note) => (
            <div key={note} className="portal-activity-item">{note}</div>
          ))}
        </div>
      </section>

      {config.multiTenantNotes?.length ? (
        <section className="portal-panel">
          <div className="portal-panel-head">
            <div>
              <h3 className="portal-panel-title">Multi-Tenant Readiness</h3>
              <p className="portal-page-sub">Foundation notes for future tenant-aware platform operation.</p>
            </div>
          </div>
          <div className="portal-activity-list">
            {config.multiTenantNotes.map((note) => (
              <div key={note} className="portal-activity-item">{note}</div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export async function ServiceOverviewPageByKey({ configKey }: { configKey: keyof typeof SERVICE_OVERVIEW_CONFIGS }) {
  return <ServiceOverviewPage config={SERVICE_OVERVIEW_CONFIGS[configKey]} />;
}