import { db } from '@/lib/db';
import { users, appProvisions } from '@/lib/schema';
import { getSession } from '@/lib/auth';
import { count, eq, desc } from 'drizzle-orm';

const services = [
  { name: 'Getouch AI', desc: 'AI Chat, Image Gen, RAG, Agents', url: 'https://ai.getouch.co', status: 'live', icon: '🧠' },
  { name: 'Coolify', desc: 'Deployment & container management', url: 'https://coolify.getouch.co', status: 'live', icon: '🚀' },
  { name: 'pgAdmin', desc: 'PostgreSQL database management', url: 'https://db.getouch.co', status: 'live', icon: '🗄️' },
  { name: 'WhatsApp API', desc: 'WhatsApp Business messaging', url: 'https://wa.getouch.co', status: 'live', icon: '💬' },
  { name: 'Grafana', desc: 'Metrics & observability', url: 'https://grafana.getouch.co', status: 'planned', icon: '📊' },
  { name: 'Bot Service', desc: 'Chatbot orchestration engine', url: 'https://bot.getouch.co', status: 'planned', icon: '🤖' },
  { name: 'API Gateway', desc: 'Central REST/GraphQL API', url: 'https://api.getouch.co', status: 'planned', icon: '⚡' },
  { name: 'Analytics', desc: 'Self-hosted web analytics', url: 'https://analytics.getouch.co', status: 'planned', icon: '📉' },
];

const infra = [
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

export default async function AdminPage() {
  const session = await getSession();

  const [[total], [active], [pending], [admins], [provisioned]] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(users).where(eq(users.role, 'user')),
    db.select({ value: count() }).from(users).where(eq(users.role, 'pending')),
    db.select({ value: count() }).from(users).where(eq(users.role, 'admin')),
    db.select({ value: count() }).from(appProvisions).where(eq(appProvisions.app, 'open_webui')),
  ]);

  const recentUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(5);

  const live = services.filter((s) => s.status === 'live');
  const planned = services.filter((s) => s.status === 'planned');

  return (
    <main className="admin-main">
      <div className="container">
        <div className="admin-header">
          <span className="section-tag">Admin Dashboard</span>
          <h1>Platform Overview</h1>
          <p className="admin-sub">Welcome back, {session?.name}.</p>
        </div>

        {/* ─── Stats ─── */}
        <section className="admin-section">
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{total.value}</span>
              <span className="stat-label">Total Users</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{active.value}</span>
              <span className="stat-label">Active</span>
            </div>
            <div className="stat-card stat-accent">
              <span className="stat-value">{pending.value}</span>
              <span className="stat-label">Pending</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{provisioned.value}</span>
              <span className="stat-label">AI Provisioned</span>
            </div>
          </div>
        </section>

        {/* ─── Recent Users ─── */}
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

        {/* ─── Quick Access ─── */}
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
          </div>
        </section>

        {/* ─── Services ─── */}
        <section className="admin-section">
          <h2>Active Services</h2>
          <div className="service-grid">
            {live.map((s) => (
              <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="service-card service-live">
                <div className="service-icon">{s.icon}</div>
                <div className="service-info">
                  <h3>{s.name}</h3><p>{s.desc}</p>
                  <span className="service-url">{s.url.replace('https://', '')}</span>
                </div>
                <div className="service-status status-live">Live</div>
              </a>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <h2>Planned Services</h2>
          <div className="service-grid">
            {planned.map((s) => (
              <div key={s.name} className="service-card service-planned">
                <div className="service-icon">{s.icon}</div>
                <div className="service-info">
                  <h3>{s.name}</h3><p>{s.desc}</p>
                  <span className="service-url">{s.url.replace('https://', '')}</span>
                </div>
                <div className="service-status status-planned">Planned</div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Infrastructure ─── */}
        <section className="admin-section">
          <h2>Infrastructure</h2>
          <div className="infra-table">
            {infra.map((item) => (
              <div key={item.label} className="infra-row">
                <span className="infra-label">{item.label}</span>
                <span className="infra-value">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
