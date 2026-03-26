import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, appProvisions } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const services = [
  {
    name: 'Getouch AI Chat',
    description: 'Chat with AI, generate images, analyse documents, and search the web in real time.',
    url: 'https://ai.getouch.co',
    icon: '🧠',
    status: 'live' as const,
    app: 'open_webui',
    tag: 'AI',
  },
  {
    name: 'Search Engine',
    description: 'Privacy-first meta search powered by SearXNG — no tracking, no ads.',
    url: 'https://search.getouch.co',
    icon: '🔍',
    status: 'live' as const,
    app: 'search',
    tag: 'Search',
  },
  {
    name: 'News',
    description: 'AI-curated news aggregation and analysis platform for Malaysia.',
    url: 'https://news.getouch.co',
    icon: '📰',
    status: 'live' as const,
    app: 'news',
    tag: 'Media',
  },
  {
    name: 'S3 Storage',
    description: 'S3-compatible cloud object storage for files, backups, and assets.',
    url: 'https://s3.getouch.co',
    icon: '📦',
    status: 'live' as const,
    app: 's3',
    tag: 'Storage',
  },
  {
    name: 'WhatsApp API',
    description: 'Business messaging automation and conversational AI via WhatsApp.',
    url: 'https://wa.getouch.co',
    icon: '💬',
    status: 'coming_soon' as const,
    app: 'whatsapp',
    tag: 'Messaging',
  },
  {
    name: 'Analytics',
    description: 'Self-hosted web analytics, event tracking, and insights dashboard.',
    url: '#',
    icon: '📊',
    status: 'coming_soon' as const,
    app: 'analytics',
    tag: 'Analytics',
  },
];

export default async function PortalPage() {
  const session = await getSession();

  // Fetch full user record for phone/verified status
  const [userRecord] = session
    ? await db
        .select({
          phone: users.phone,
          phoneVerified: users.phoneVerified,
          emailVerified: users.emailVerified,
        })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1)
    : [];

  // Get provisioned apps
  const userProvisions = session
    ? await db
        .select({ app: appProvisions.app })
        .from(appProvisions)
        .where(eq(appProvisions.userId, session.userId))
    : [];
  const provisionedApps = new Set(userProvisions.map((p) => p.app));

  const liveCount = services.filter((s) => s.status === 'live').length;
  const isVerified = userRecord?.emailVerified || userRecord?.phoneVerified;

  return (
    <main className="portal-main">
      <div className="portal-container">

        {/* ── Hero greeting ── */}
        <div className="portal-hero">
          <div className="portal-hero-text">
            <div className="portal-hero-tag">Dashboard</div>
            <h1 className="portal-greeting">
              Welcome back, {session?.name?.split(' ')[0]}.
            </h1>
            <p className="portal-sub">
              Access your Getouch services and manage your account.
            </p>
          </div>
          <div className="portal-hero-stats">
            <div className="portal-stat">
              <span className="portal-stat-num">{liveCount}</span>
              <span className="portal-stat-label">Services Live</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat-num">{provisionedApps.size}</span>
              <span className="portal-stat-label">Active</span>
            </div>
            <div className="portal-stat">
              <span className={`portal-stat-num portal-stat-${isVerified ? 'ok' : 'warn'}`}>
                {isVerified ? '✓' : '!'}
              </span>
              <span className="portal-stat-label">
                {isVerified ? 'Verified' : 'Unverified'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Services grid ── */}
        <section className="portal-section">
          <div className="portal-section-hd">
            <h2 className="portal-section-title">Services</h2>
            <span className="portal-section-sub">All Getouch products in one place</span>
          </div>
          <div className="portal-grid">
            {services.map((svc) => {
              const isLive = svc.status === 'live';
              return isLive ? (
                <a
                  key={svc.app}
                  href={svc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-card portal-card-live"
                >
                  <div className="portal-card-top">
                    <span className="portal-card-icon">{svc.icon}</span>
                    <span className="portal-card-tag">{svc.tag}</span>
                  </div>
                  <div className="portal-card-body">
                    <h3>{svc.name}</h3>
                    <p>{svc.description}</p>
                  </div>
                  <div className="portal-card-footer">
                    <span className="portal-status portal-status-live">Live</span>
                    <span className="portal-card-arrow">→</span>
                  </div>
                </a>
              ) : (
                <div key={svc.app} className="portal-card portal-card-soon">
                  <div className="portal-card-top">
                    <span className="portal-card-icon">{svc.icon}</span>
                    <span className="portal-card-tag">{svc.tag}</span>
                  </div>
                  <div className="portal-card-body">
                    <h3>{svc.name}</h3>
                    <p>{svc.description}</p>
                  </div>
                  <div className="portal-card-footer">
                    <span className="portal-status portal-status-soon">Coming Soon</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Account summary ── */}
        <section className="portal-section">
          <div className="portal-section-hd">
            <h2 className="portal-section-title">Account</h2>
            <a href="/portal/profile" className="portal-section-action">Edit profile →</a>
          </div>
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
              <span className="portal-account-label">Phone</span>
              <span className="portal-account-value">
                {userRecord?.phone ?? <span style={{ color: 'var(--text-secondary)' }}>Not set</span>}
                {userRecord?.phone && userRecord.phoneVerified && (
                  <span className="portal-verified-badge">✓ Verified</span>
                )}
              </span>
            </div>
            <div className="portal-account-row">
              <span className="portal-account-label">Role</span>
              <span className={`role-badge role-${session?.role}`}>{session?.role}</span>
            </div>
            <div className="portal-account-row">
              <span className="portal-account-label">Verification</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {userRecord?.emailVerified && (
                  <span className="portal-verified-badge">✓ Email</span>
                )}
                {userRecord?.phoneVerified && (
                  <span className="portal-verified-badge">✓ WhatsApp</span>
                )}
                {!userRecord?.emailVerified && !userRecord?.phoneVerified && (
                  <span className="portal-unverified-badge">⚠ Not verified</span>
                )}
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
