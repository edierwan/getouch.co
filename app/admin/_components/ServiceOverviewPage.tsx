import { Breadcrumb, PageIntro } from '../ui';
import { SERVICE_OVERVIEW_CONFIGS, type ServiceOverviewConfig } from '../_lib/service-overviews';
import { getPlatformServicesSnapshot } from '@/lib/platform-services';
import {
  describeServiceProbe,
  formatRuntimeSource,
  getServiceProbe,
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

function formatRuntimeValue(config: ServiceOverviewConfig, found: boolean, runtimeSource: string, primaryName: string | null) {
  if (primaryName) return `${runtimeSource} · ${primaryName}`;
  if (config.runtimeSourceHint) return config.runtimeSourceHint;
  if (found) return 'Shared or external runtime';
  return runtimeSource;
}

function formatHealthValue(config: ServiceOverviewConfig, probe: { publicOriginCode: number | null; publicEdgeCode: number | null }, fallback: string) {
  if (config.healthCheck) return config.healthCheck;
  if (probe.publicOriginCode !== null || probe.publicEdgeCode !== null) {
    return `Origin ${formatOriginStatus(probe.publicOriginCode)} · Edge ${formatEdgeStatus(probe.publicEdgeCode)}`;
  }
  return fallback;
}

export async function ServiceOverviewPage({ config }: { config: ServiceOverviewConfig }) {
  const snapshot = await getPlatformServicesSnapshot();
  const probe = getServiceProbe(snapshot, config.probeKey);
  const status = describeServiceProbe(probe, config.statusOptions);
  const primary = probe.containers[0] || null;
  const publicUrl = probe.publicUrl || config.externalOpenUrl || null;
  const runtimeSource = formatRuntimeSource(resolveRuntimeSource(primary));

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
          <div className="portal-info-table-row"><span className="portal-info-table-label">Public URL</span><span className="portal-info-table-value">{publicUrl || 'Not configured'}</span></div>
          {config.apiBaseUrl ? <div className="portal-info-table-row"><span className="portal-info-table-label">API Base</span><span className="portal-info-table-value">{config.apiBaseUrl}</span></div> : null}
          <div className="portal-info-table-row"><span className="portal-info-table-label">Origin route</span><span className="portal-info-table-value">{formatOriginStatus(probe.publicOriginCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Public edge</span><span className="portal-info-table-value">{formatEdgeStatus(probe.publicEdgeCode)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Runtime source</span><span className="portal-info-table-value">{formatRuntimeValue(config, probe.found, runtimeSource, primary?.name || null)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Health check</span><span className="portal-info-table-value">{formatHealthValue(config, probe, primary?.health || primary?.status || status.detail)}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Auth / Security</span><span className="portal-info-table-value">{config.securityStatus || 'No special auth requirement recorded.'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Setup / Onboarding</span><span className="portal-info-table-value">{config.setupStatus || 'Operational'}</span></div>
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