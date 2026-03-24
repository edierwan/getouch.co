import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { appProvisions } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

const products = [
  {
    name: 'Getouch AI Chat',
    description: 'Chat with AI, generate images, analyze documents, and search the web.',
    url: 'https://ai.getouch.co',
    icon: '🧠',
    status: 'live' as const,
    app: 'open_webui',
  },
  {
    name: 'S3 Storage',
    description: 'Manage your files with S3-compatible cloud storage.',
    url: 'https://s3.getouch.co',
    icon: '📦',
    status: 'live' as const,
    app: 's3',
  },
  {
    name: 'Search Engine',
    description: 'Privacy-first meta search engine powered by SearXNG.',
    url: 'https://search.getouch.co',
    icon: '🔍',
    status: 'live' as const,
    app: 'search',
  },
  {
    name: 'News',
    description: 'AI-curated news aggregation and analysis platform.',
    url: 'https://news.getouch.co',
    icon: '📰',
    status: 'live' as const,
    app: 'news',
  },
  {
    name: 'WhatsApp API',
    description: 'Business messaging and automation via WhatsApp.',
    url: 'https://wa.getouch.co',
    icon: '💬',
    status: 'coming_soon' as const,
    app: 'whatsapp',
  },
  {
    name: 'Analytics',
    description: 'Self-hosted web analytics and insights dashboard.',
    url: '#',
    icon: '📊',
    status: 'coming_soon' as const,
    app: 'analytics',
  },
];

export default async function PortalPage() {
  const session = await getSession();

  // Get user's provisioned apps
  const userProvisions = session
    ? await db
        .select({ app: appProvisions.app })
        .from(appProvisions)
        .where(eq(appProvisions.userId, session.userId))
    : [];
  const provisionedApps = new Set(userProvisions.map((p) => p.app));

  return (
    <main className="portal-main">
      <div className="portal-container">
        <div className="portal-header">
          <h1 className="portal-greeting">
            Welcome back, {session?.name}.
          </h1>
          <p className="portal-sub">Access your Getouch products and services.</p>
        </div>

        <section className="portal-products">
          <div className="portal-grid">
            {products.map((product) => {
              const isLive = product.status === 'live';
              const isProvisioned = provisionedApps.has(product.app);

              return isLive ? (
                <a
                  key={product.app}
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-card portal-card-live"
                >
                  <div className="portal-card-icon">{product.icon}</div>
                  <div className="portal-card-body">
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                  </div>
                  <div className="portal-card-meta">
                    <span className="portal-status portal-status-live">Live</span>
                    <span className="portal-arrow">→</span>
                  </div>
                </a>
              ) : (
                <div key={product.app} className="portal-card portal-card-soon">
                  <div className="portal-card-icon">{product.icon}</div>
                  <div className="portal-card-body">
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                  </div>
                  <div className="portal-card-meta">
                    <span className="portal-status portal-status-soon">Coming Soon</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="portal-account">
          <h2>Account</h2>
          <div className="portal-account-card">
            <div className="portal-account-row">
              <span className="portal-account-label">Name</span>
              <span className="portal-account-value">{session?.name}</span>
            </div>
            <div className="portal-account-row">
              <span className="portal-account-label">Email</span>
              <span className="portal-account-value">{session?.email}</span>
            </div>
            <div className="portal-account-row">
              <span className="portal-account-label">Role</span>
              <span className={`role-badge role-${session?.role}`}>{session?.role}</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
