'use client';

import { useState, useEffect, useCallback } from 'react';

type ServiceStatus = 'HEALTHY' | 'ACTIVE' | 'ONLINE' | 'CHECKING' | 'DEGRADED' | 'UNKNOWN';

interface ServiceDef {
  name: string;
  type: string;
  category: string;
  url?: string;
  healthUrl?: string;
  description?: string;
}

const SERVICES: ServiceDef[] = [
  // Infrastructure
  { name: 'Caddy', type: 'Reverse Proxy', category: 'Infrastructure', description: 'HTTPS edge proxy for all services' },
  { name: 'PostgreSQL 16', type: 'Database', category: 'Infrastructure', description: 'Primary relational database', healthUrl: 'https://getouch.co/api/admin/health?svc=postgres' },
  { name: 'pgAdmin 4', type: 'Admin', category: 'Infrastructure', url: 'https://db.getouch.co', healthUrl: 'https://db.getouch.co' },
  { name: 'Cloudflare Tunnel', type: 'Network', category: 'Infrastructure', description: 'Zero-trust edge tunnel' },
  // Platform
  { name: 'Coolify', type: 'DevOps', category: 'Platform', url: 'https://coolify.getouch.co', healthUrl: 'https://coolify.getouch.co', description: 'Container deployment platform' },
  { name: 'Getouch.co (Prod)', type: 'App', category: 'Platform', url: 'https://getouch.co', healthUrl: 'https://getouch.co', description: 'Main web application' },
  { name: 'Getouch News', type: 'App', category: 'Platform', url: 'https://news.getouch.co', healthUrl: 'https://news.getouch.co', description: 'News portal' },
  // AI & Automation
  { name: 'Open WebUI', type: 'AI', category: 'AI & Automation', url: 'https://ai.getouch.co', healthUrl: 'https://ai.getouch.co', description: 'AI chat + models UI' },
  { name: 'Ollama', type: 'AI Engine', category: 'AI & Automation', description: 'Local LLM inference (GPU)' },
  { name: 'SearXNG', type: 'Search', category: 'AI & Automation', url: 'https://search.getouch.co', healthUrl: 'https://search.getouch.co', description: 'Private meta search engine' },
  // Identity
  { name: 'Getouch SSO', type: 'Auth', category: 'Identity', url: 'https://st-sso.getouch.co', description: 'Central identity (Supabase)' },
  { name: 'Serapod Staging', type: 'Supabase', category: 'Identity', url: 'https://st-stg-serapod.getouch.co', description: 'Serapod staging stack' },
  { name: 'QRSys Dev', type: 'Supabase', category: 'Identity', url: 'https://st-dev-qrsys.getouch.co', description: 'QR System development' },
  { name: 'QRSys Prod', type: 'Supabase', category: 'Identity', url: 'https://st-prd-qrsys.getouch.co', description: 'QR System production' },
  // Communication
  { name: 'WhatsApp API', type: 'Messaging', category: 'Communication', url: 'https://wa.getouch.co', healthUrl: 'https://wa.getouch.co/healthz', description: 'WhatsApp Business gateway' },
  { name: 'Chatwoot', type: 'Support', category: 'Communication', description: 'Customer support platform' },
  // Storage
  { name: 'SeaweedFS', type: 'Object Storage', category: 'Storage', url: 'https://s3api.getouch.co', description: 'S3-compatible distributed storage' },
  { name: 'Filestash', type: 'File Browser', category: 'Storage', url: 'https://s3.getouch.co', healthUrl: 'https://s3.getouch.co', description: 'Web-based file manager' },
  // Monitoring
  { name: 'Grafana', type: 'Metrics', category: 'Monitoring', url: 'https://grafana.getouch.co', healthUrl: 'https://grafana.getouch.co', description: 'Dashboards & observability' },
  { name: 'Umami Analytics', type: 'Analytics', category: 'Monitoring', url: 'https://analytics.getouch.co', healthUrl: 'https://analytics.getouch.co', description: 'Self-hosted web analytics' },
];

const QUICK_ACTIONS = [
  { label: 'Open Coolify', url: 'https://coolify.getouch.co', icon: '🚀' },
  { label: 'Open AI', url: 'https://ai.getouch.co', icon: '🧠' },
  { label: 'pgAdmin', url: 'https://db.getouch.co', icon: '🗄️' },
  { label: 'Grafana', url: 'https://grafana.getouch.co', icon: '📊' },
  { label: 'S3 Storage', url: 'https://s3.getouch.co', icon: '📦' },
  { label: 'Analytics', url: 'https://analytics.getouch.co', icon: '📉' },
];

const ENV_SPECS = [
  { label: 'CPU', value: '12 vCPU Intel Xeon' },
  { label: 'Memory', value: '64 GB DDR5' },
  { label: 'GPU', value: 'RTX 5060 Ti 16GB' },
  { label: 'Storage', value: '98 GB OS + 1.5 TB NVMe' },
  { label: 'OS', value: 'Ubuntu 24.04 LTS' },
  { label: 'Containers', value: '74 running' },
];

const NETWORK_INFO = [
  { label: 'Domain', value: 'getouch.co' },
  { label: 'SSL', value: 'Let\'s Encrypt — VALID' },
  { label: 'Edge', value: 'Cloudflare Tunnel' },
  { label: 'Firewall', value: 'UFW + DOCKER-USER' },
  { label: 'VPN', value: 'Tailscale (100.84.14.93)' },
];

const CATEGORIES = Array.from(new Set(SERVICES.map((s) => s.category)));

function StatusBadge({ status }: { status: ServiceStatus }) {
  const color =
    status === 'CHECKING' ? '#6b7280' :
    status === 'DEGRADED' || status === 'UNKNOWN' ? '#ef4444' :
    '#22c55e';
  const bg =
    status === 'CHECKING' ? 'rgba(107,114,128,0.12)' :
    status === 'DEGRADED' || status === 'UNKNOWN' ? 'rgba(239,68,68,0.12)' :
    'rgba(34,197,94,0.12)';
  return (
    <span style={{ color, background: bg, padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em' }}>
      {status === 'CHECKING' ? '···' : status}
    </span>
  );
}

interface Props {
  stats: { users: number; pending: number; aiProvisioned: number };
}

export default function PortalDashboard({ stats }: Props) {
  const [statuses, setStatuses] = useState<Record<string, ServiceStatus>>(() =>
    Object.fromEntries(SERVICES.map((s) => [s.name, 'CHECKING']))
  );
  const [lastChecked, setLastChecked] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    const servicesWithHealth = SERVICES.filter((s) => s.healthUrl);
    const results = await Promise.allSettled(
      servicesWithHealth.map(async (svc) => {
        try {
          const resp = await fetch(`/api/admin/health?url=${encodeURIComponent(svc.healthUrl!)}`, {
            signal: AbortSignal.timeout(5000),
          });
          return { name: svc.name, ok: resp.ok };
        } catch {
          return { name: svc.name, ok: false };
        }
      })
    );

    const newStatuses: Record<string, ServiceStatus> = { ...statuses };
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        newStatuses[result.value.name] = result.value.ok ? 'HEALTHY' : 'DEGRADED';
      }
    });
    // Services without healthUrl are ACTIVE (no HTTP check possible)
    SERVICES.filter((s) => !s.healthUrl).forEach((s) => {
      newStatuses[s.name] = 'ACTIVE';
    });
    setStatuses(newStatuses);
    setLastChecked(new Date().toLocaleTimeString());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const healthyCount = Object.values(statuses).filter((s) => s === 'HEALTHY' || s === 'ACTIVE' || s === 'ONLINE').length;
  const degradedCount = Object.values(statuses).filter((s) => s === 'DEGRADED').length;
  const filteredServices = activeCategory
    ? SERVICES.filter((s) => s.category === activeCategory)
    : SERVICES;

  return (
    <div className="portal-body">
      {/* Page title */}
      <div className="portal-page-header">
        <div>
          <h2 className="portal-page-title">Dashboard</h2>
          <p className="portal-page-sub">Infrastructure overview</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {lastChecked && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Last checked: {lastChecked}
            </span>
          )}
          <button onClick={checkHealth} className="portal-refresh-btn">↻ Refresh</button>
        </div>
      </div>

      {/* Stats row */}
      <div className="portal-stats-row">
        <div className="portal-stat-card">
          <span className="portal-stat-val">{SERVICES.length}</span>
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
              <span>{a.icon}</span> {a.label}
            </a>
          ))}
          <a href="/admin/users" className="portal-action-btn">
            <span>◉</span> Manage Users
          </a>
        </div>
      </div>

      {/* Main content: Service Health + Side panels */}
      <div className="portal-grid">
        {/* Service Health Table */}
        <div className="portal-table-wrap" style={{ gridColumn: '1 / -1' }}>
          <div className="portal-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 className="portal-section-title" style={{ marginBottom: 0 }}>SERVICE HEALTH</h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`portal-tag-btn${activeCategory === null ? ' portal-tag-active' : ''}`}
                >All</button>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                    className={`portal-tag-btn${activeCategory === cat ? ' portal-tag-active' : ''}`}
                  >{cat}</button>
                ))}
              </div>
            </div>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.map((svc) => (
                  <tr key={svc.name}>
                    <td className="portal-table-name">{svc.name}</td>
                    <td className="portal-table-cat">{svc.category}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{svc.type}</td>
                    <td><StatusBadge status={statuses[svc.name] ?? 'CHECKING'} /></td>
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
            {ENV_SPECS.map((item) => (
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
