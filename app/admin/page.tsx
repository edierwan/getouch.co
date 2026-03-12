const services = [
  {
    name: 'Getouch AI',
    desc: 'Open WebUI — AI Chat, Image Gen, RAG, Agents',
    url: 'https://ai.getouch.co',
    status: 'live',
    icon: '🧠'
  },
  {
    name: 'Coolify',
    desc: 'Deployment & container management platform',
    url: 'https://coolify.getouch.co',
    status: 'live',
    icon: '🚀'
  },
  {
    name: 'pgAdmin',
    desc: 'PostgreSQL database management UI',
    url: 'https://db.getouch.co',
    status: 'live',
    icon: '🗄️'
  },
  {
    name: 'WhatsApp API',
    desc: 'WhatsApp Business messaging gateway',
    url: 'https://wa.getouch.co',
    status: 'live',
    icon: '💬'
  },
  {
    name: 'Grafana',
    desc: 'Metrics dashboards and observability',
    url: 'https://grafana.getouch.co',
    status: 'planned',
    icon: '📊'
  },
  {
    name: 'Prometheus',
    desc: 'Metrics collection and alerting',
    url: 'https://metrics.getouch.co',
    status: 'planned',
    icon: '📈'
  },
  {
    name: 'Bot Service',
    desc: 'Chatbot orchestration engine',
    url: 'https://bot.getouch.co',
    status: 'planned',
    icon: '🤖'
  },
  {
    name: 'API Gateway',
    desc: 'Central REST/GraphQL API endpoint',
    url: 'https://api.getouch.co',
    status: 'planned',
    icon: '⚡'
  },
  {
    name: 'Analytics',
    desc: 'Self-hosted web analytics',
    url: 'https://analytics.getouch.co',
    status: 'planned',
    icon: '📉'
  },
  {
    name: 'SMS Gateway',
    desc: 'SMS messaging service',
    url: 'https://sms.getouch.co',
    status: 'planned',
    icon: '📱'
  }
];

const infra = [
  { label: 'Server', value: 'Ubuntu 24.04 LTS' },
  { label: 'CPU', value: '12 cores' },
  { label: 'RAM', value: '64 GB DDR5' },
  { label: 'GPU', value: 'RTX 5060 Ti 16GB' },
  { label: 'Disk', value: '100 GB (OS) + 1.5 TB (Data)' },
  { label: 'Edge', value: 'Cloudflare Tunnel' },
  { label: 'Proxy', value: 'Caddy' },
  { label: 'Database', value: 'PostgreSQL 16' },
  { label: 'Container', value: 'Docker Compose' },
  { label: 'VPN', value: 'Tailscale' }
];

export default function AdminPage() {
  const live = services.filter((s) => s.status === 'live');
  const planned = services.filter((s) => s.status === 'planned');

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <a href="/" className="logo">
            <span className="logo-icon">◆</span> Getouch
          </a>
          <div className="nav-links">
            <a href="/">Home</a>
            <a href="https://ai.getouch.co" className="nav-cta">
              Open AI Chat
            </a>
          </div>
        </div>
      </nav>

      <main className="admin-main">
        <div className="container">
          <div className="admin-header">
            <span className="section-tag">Admin Dashboard</span>
            <h1>Platform Overview</h1>
            <p className="admin-sub">
              Monitor all services and infrastructure for the Getouch platform.
            </p>
          </div>

          <section className="admin-section">
            <h2>Active Services</h2>
            <div className="service-grid">
              {live.map((s) => (
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
          </section>

          <section className="admin-section">
            <h2>Planned Services</h2>
            <div className="service-grid">
              {planned.map((s) => (
                <div key={s.name} className="service-card service-planned">
                  <div className="service-icon">{s.icon}</div>
                  <div className="service-info">
                    <h3>{s.name}</h3>
                    <p>{s.desc}</p>
                    <span className="service-url">{s.url.replace('https://', '')}</span>
                  </div>
                  <div className="service-status status-planned">Planned</div>
                </div>
              ))}
            </div>
          </section>

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

      <footer className="footer">
        <div className="container footer-inner">
          <span className="footer-brand">◆ Getouch</span>
          <span className="footer-copy">&copy; 2026 Getouch</span>
        </div>
      </footer>

      <style>{`
        .admin-main { padding: 8rem 0 4rem; }
        .admin-header { margin-bottom: 3rem; }
        .admin-header h1 { font-size: 2.5rem; font-weight: 800; letter-spacing: -0.03em; }
        .admin-sub { color: var(--text-secondary); font-size: 1.05rem; margin-top: 0.5rem; }

        .admin-section { margin-bottom: 3rem; }
        .admin-section h2 {
          font-size: 1.3rem; font-weight: 700; margin-bottom: 1.25rem;
          padding-bottom: 0.75rem; border-bottom: 1px solid var(--border);
        }

        .service-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }

        .service-card {
          display: flex; align-items: flex-start; gap: 1rem;
          padding: 1.25rem 1.5rem;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius); transition: border-color 0.2s, transform 0.2s;
        }
        a.service-card:hover { border-color: var(--accent); transform: translateY(-1px); }

        .service-icon { font-size: 1.8rem; flex-shrink: 0; }
        .service-info { flex: 1; min-width: 0; }
        .service-info h3 { font-size: 1rem; font-weight: 700; }
        .service-info p { color: var(--text-secondary); font-size: 0.84rem; margin-top: 0.2rem; }
        .service-url { color: var(--accent-light); font-size: 0.78rem; font-weight: 500; }

        .service-status {
          flex-shrink: 0; padding: 0.2rem 0.6rem;
          border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .status-live {
          background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.25);
          color: var(--success);
        }
        .status-planned {
          background: rgba(139, 139, 148, 0.1); border: 1px solid rgba(139, 139, 148, 0.2);
          color: var(--text-secondary);
        }

        .service-planned { opacity: 0.6; }

        .infra-table {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
        }
        .infra-row {
          display: flex; justify-content: space-between;
          padding: 0.85rem 1.5rem;
          border-bottom: 1px solid var(--border);
        }
        .infra-row:last-child { border-bottom: none; }
        .infra-label { color: var(--text-secondary); font-size: 0.9rem; }
        .infra-value { font-weight: 600; font-size: 0.9rem; }

        @media (max-width: 700px) {
          .service-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
