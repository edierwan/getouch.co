import {
  type AdminServiceWithStatus,
  ENVIRONMENT_INFO,
  NETWORK_INFO,
  QUICK_ACTIONS,
} from './data';

function StatusBadge({ status }: { status: AdminServiceWithStatus['status'] }) {
  const tone = status === 'DEGRADED' ? ' portal-status-bad' : ' portal-status-good';
  return <span className={`portal-status${tone}`}>{status}</span>;
}

interface Props {
  stats: { users: number; pending: number; aiProvisioned: number };
  services: AdminServiceWithStatus[];
  lastChecked: string;
}

export default function PortalDashboard({ stats, services, lastChecked }: Props) {
  const healthyCount = services.filter((service) => service.status !== 'DEGRADED').length;
  const degradedCount = services.filter((service) => service.status === 'DEGRADED').length;

  return (
    <div className="portal-body">
      {/* Page title */}
      <div className="portal-page-header">
        <div>
          <h2 className="portal-page-title">Dashboard</h2>
          <p className="portal-page-sub">Infrastructure overview</p>
        </div>
        <div className="portal-inline-meta">Last checked: {lastChecked}</div>
      </div>

      {/* Stats row */}
      <div className="portal-stats-row">
        <div className="portal-stat-card">
          <span className="portal-stat-val">{services.length}</span>
          <span className="portal-stat-lbl">Total Services</span>
        </div>
        <div className="portal-stat-card portal-stat-green">
          <span className="portal-stat-val">{healthyCount}</span>
          <span className="portal-stat-lbl">Healthy</span>
        </div>
        <div className={`portal-stat-card${degradedCount > 0 ? ' portal-stat-red' : ''}`}>
          <span className="portal-stat-val">{degradedCount}</span>
          <span className="portal-stat-lbl">Degraded</span>
        </div>
        <div className="portal-stat-card">
          <span className="portal-stat-val">{stats.users}</span>
          <span className="portal-stat-lbl">Users</span>
        </div>
        <div className="portal-stat-card">
          <span className="portal-stat-val">{stats.aiProvisioned}</span>
          <span className="portal-stat-lbl">AI Users</span>
        </div>
        <div className={`portal-stat-card${stats.pending > 0 ? ' portal-stat-amber' : ''}`}>
          <span className="portal-stat-val">{stats.pending}</span>
          <span className="portal-stat-lbl">Pending</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="portal-section">
        <h3 className="portal-section-title">QUICK ACTIONS</h3>
        <div className="portal-actions-row">
          {QUICK_ACTIONS.map((a) => (
            <a key={a.label} href={a.url} target="_blank" rel="noopener noreferrer" className="portal-action-btn">
              {a.label}
            </a>
          ))}
          <a href="/admin/users" className="portal-action-btn">
            Manage Users
          </a>
        </div>
      </div>

      {/* Main content: Service Health + Side panels */}
      <div className="portal-grid">
        {/* Service Health Table */}
        <div className="portal-table-wrap portal-grid-span-2">
          <div className="portal-section">
            <h3 className="portal-section-title">SERVICE HEALTH</h3>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc) => (
                  <tr key={svc.name}>
                    <td className="portal-table-name">{svc.name}</td>
                    <td className="portal-table-desc">{svc.description}</td>
                    <td className="portal-table-cat">{svc.type}</td>
                    <td><StatusBadge status={svc.status} /></td>
                    <td>
                      {svc.url ? (
                        <a href={svc.url} target="_blank" rel="noopener noreferrer" className="portal-table-link">
                          ↗
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Network Panel */}
        <div className="portal-side-panel">
          <h3 className="portal-section-title">NETWORK</h3>
          <div className="portal-info-list">
            {NETWORK_INFO.map((item) => (
              <div key={item.label} className="portal-info-row">
                <span className="portal-info-label">{item.label}</span>
                <span className="portal-info-value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Environment Panel */}
        <div className="portal-side-panel">
          <h3 className="portal-section-title">ENVIRONMENT</h3>
          <div className="portal-info-list">
            {ENVIRONMENT_INFO.map((item) => (
              <div key={item.label} className="portal-info-row">
                <span className="portal-info-label">{item.label}</span>
                <span className="portal-info-value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="portal-side-panel">
          <h3 className="portal-section-title">RECENT ACTIVITY</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Activity log will appear here once event tracking is configured.
          </p>
        </div>
      </div>
    </div>
  );
}
