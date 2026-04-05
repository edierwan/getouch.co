'use client';

import { useState } from 'react';

type Tab = 'overview' | 'services' | 'infra';

interface Props {
  sessionName: string | null;
  stats: { total: number; active: number; pending: number; provisioned: number };
  recentUsers: { id: string; name: string; email: string; role: string }[];
}

const serviceCategories = [
  {
    name: 'AI & Chat',
    services: [
      { name: 'Getouch AI', desc: 'AI Chat, Image Gen, RAG, Agents', url: 'https://ai.getouch.co', icon: '🧠' },
      { name: 'WhatsApp API', desc: 'WhatsApp Business messaging', url: 'https://wa.getouch.co', icon: '💬' },
    ],
  },
  {
    name: 'Database',
    services: [
      { name: 'pgAdmin', desc: 'PostgreSQL database management', url: 'https://db.getouch.co', icon: '🗄️' },
    ],
    subgroups: [
      {
        name: 'Supabase',
        services: [
          { name: 'Getouch SSO', desc: 'Central shared sign-in / identity', url: 'https://st-sso.getouch.co', icon: '🔐' },
          { name: 'Serapod Staging', desc: 'Serapod staging database', url: 'https://st-stg-serapod.getouch.co', icon: '⚡' },
          { name: 'QR System Dev', desc: 'QR System development', url: 'https://st-dev-qrsys.getouch.co', icon: '🔧' },
          { name: 'QR System Prod', desc: 'QR System production', url: 'https://st-prd-qrsys.getouch.co', icon: '🟢' },
        ],
      },
    ],
  },
  {
    name: 'Storage',
    services: [
      { name: 'S3 Storage', desc: 'File browser & management (Filestash)', url: 'https://s3.getouch.co', icon: '📦' },
      { name: 'S3 API', desc: 'S3-compatible object storage API', url: 'https://s3api.getouch.co', icon: '🔌' },
    ],
  },
  {
    name: 'DevOps',
    services: [
      { name: 'Coolify', desc: 'Deployment & container management', url: 'https://coolify.getouch.co', icon: '🚀' },
      { name: 'SearXNG', desc: 'Private meta search engine', url: 'https://search.getouch.co', icon: '🔍' },
      { name: 'Grafana', desc: 'Metrics & observability', url: 'https://grafana.getouch.co', icon: '📊' },
      { name: 'Analytics', desc: 'Self-hosted web analytics', url: 'https://analytics.getouch.co', icon: '📉' },
    ],
  },
];

const plannedServices = [
  { name: 'Bot Service', desc: 'Chatbot orchestration engine', icon: '🤖' },
  { name: 'API Gateway', desc: 'Central REST/GraphQL API', icon: '⚡' },
];

const infraSpecs = [
  { label: 'Server', value: 'Ubuntu 24.04 LTS' },
  { label: 'CPU', value: '12 cores' },
  { label: 'RAM', value: '64 GB DDR5' },
  { label: 'GPU', value: 'RTX 5060 Ti 16GB' },
  { label: 'Disk', value: '100 GB + 1.5 TB NVMe' },
  { label: 'Edge', value: 'Cloudflare Tunnel' },
  { label: 'Proxy', value: 'Caddy' },
  { label: 'Database', value: 'PostgreSQL 16' },
  { label: 'Deploy', value: 'Coolify + Docker' },
  { label: 'VPN', value: 'Tailscale' },
];

const tabs: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'services', label: 'Services' },
  { key: 'infra', label: 'Infrastructure' },
];

export default function Dashboard({ sessionName, stats, recentUsers }: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <main className="admin-main">
      <div className="container">
        <div className="admin-header">
          <span className="section-tag">Admin Dashboard</span>
          <h1>Platform Overview</h1>
          <p className="admin-sub">Welcome back, {sessionName}.</p>
        </div>

        {/* Tab Navigation */}
        <nav className="tab-nav">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`tab-btn${tab === t.key ? ' tab-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ─── Overview Tab ─── */}
        {tab === 'overview' && (
          <>
            <section className="admin-section">
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-value">{stats.total}</span>
                  <span className="stat-label">Total Users</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stats.active}</span>
                  <span className="stat-label">Active</span>
                </div>
                <div className="stat-card stat-accent">
                  <span className="stat-value">{stats.pending}</span>
                  <span className="stat-label">Pending</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stats.provisioned}</span>
                  <span className="stat-label">AI Provisioned</span>
                </div>
              </div>
            </section>

            {recentUsers.length > 0 && (
              <section className="admin-section">
                <h2>Recent Users</h2>
                <div className="recent-list">
                  {recentUsers.map((u) => (
                    <div key={u.id} className="recent-row">
                      <div className="recent-info">
                        <span className="recent-name">{u.name}</span>
                        <span className="recent-email">{u.email}</span>
                      </div>
                      <span className={`role-badge role-${u.role}`}>{u.role}</span>
                    </div>
                  ))}
                </div>
                <a href="/admin/users" className="view-all-link">View all users →</a>
              </section>
            )}

            <section className="admin-section">
              <h2>Quick Access</h2>
              <div className="quick-links">
                <a href="https://ai.getouch.co/admin" target="_blank" rel="noopener noreferrer" className="quick-card">
                  <span className="quick-icon">🧠</span>
                  <div><h3>Open WebUI Admin</h3><p>Manage AI models, settings &amp; connections</p></div>
                  <span className="quick-arrow">→</span>
                </a>
                <a href="https://db.getouch.co" target="_blank" rel="noopener noreferrer" className="quick-card">
                  <span className="quick-icon">🗄️</span>
                  <div><h3>Database Admin</h3><p>pgAdmin — manage PostgreSQL databases</p></div>
                  <span className="quick-arrow">→</span>
                </a>
                <a href="https://coolify.getouch.co" target="_blank" rel="noopener noreferrer" className="quick-card">
                  <span className="quick-icon">🚀</span>
                  <div><h3>Coolify</h3><p>Deployments &amp; container management</p></div>
                  <span className="quick-arrow">→</span>
                </a>
                <a href="https://s3.getouch.co" target="_blank" rel="noopener noreferrer" className="quick-card">
                  <span className="quick-icon">📦</span>
                  <div><h3>S3 Storage</h3><p>Browse &amp; manage files in S3 buckets</p></div>
                  <span className="quick-arrow">→</span>
                </a>
                <a href="https://grafana.getouch.co" target="_blank" rel="noopener noreferrer" className="quick-card">
                  <span className="quick-icon">📊</span>
                  <div><h3>Grafana</h3><p>Metrics, dashboards &amp; observability</p></div>
                  <span className="quick-arrow">→</span>
                </a>
                <a href="https://analytics.getouch.co" target="_blank" rel="noopener noreferrer" className="quick-card">
                  <span className="quick-icon">📉</span>
                  <div><h3>Analytics</h3><p>Self-hosted web analytics (Umami)</p></div>
                  <span className="quick-arrow">→</span>
                </a>
              </div>
            </section>
          </>
        )}

        {/* ─── Services Tab ─── */}
        {tab === 'services' && (
          <>
            {serviceCategories.map((cat) => (
              <section key={cat.name} className="admin-section">
                <div className="category-header">
                  <h2>{cat.name}</h2>
                </div>
                <div className="service-grid">
                  {cat.services.map((s) => (
                    <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="service-card service-live">
                      <div className="service-icon">{s.icon}</div>
                      <div className="service-info">
                        <h3>{s.name}</h3>
                        <p>{s.desc}</p>
                        <span className="service-url">{s.url.replace('https://', '')}</span>
                      </div>
                      <div className="service-status status-live">Live</div>
                    </a>
                  ))}
                </div>
                {cat.subgroups?.map((sub) => (
                  <div key={sub.name} className="service-subgroup">
                    <h3 className="subgroup-title">{sub.name}</h3>
                    <div className="service-grid">
                      {sub.services.map((s) => (
                        <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="service-card service-live">
                          <div className="service-icon">{s.icon}</div>
                          <div className="service-info">
                            <h3>{s.name}</h3>
                            <p>{s.desc}</p>
                            <span className="service-url">{s.url.replace('https://', '')}</span>
                          </div>
                          <div className="service-status status-live">Live</div>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}

            <section className="admin-section">
              <div className="category-header">
                <h2>Planned</h2>
              </div>
              <div className="service-grid">
                {plannedServices.map((s) => (
                  <div key={s.name} className="service-card service-planned">
                    <div className="service-icon">{s.icon}</div>
                    <div className="service-info">
                      <h3>{s.name}</h3>
                      <p>{s.desc}</p>
                    </div>
                    <div className="service-status status-planned">Planned</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* ─── Infrastructure Tab ─── */}
        {tab === 'infra' && (
          <section className="admin-section">
            <h2>Server Specifications</h2>
            <div className="infra-table">
              {infraSpecs.map((item) => (
                <div key={item.label} className="infra-row">
                  <span className="infra-label">{item.label}</span>
                  <span className="infra-value">{item.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
