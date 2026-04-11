import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { logout } from '@/app/auth/actions';

const NAV_SECTIONS = [
  {
    label: 'OVERVIEW',
    items: [{ label: 'Dashboard', href: '/admin', icon: '▦' }],
  },
  {
    label: 'INFRASTRUCTURE',
    items: [
      { label: 'Servers & Nodes', href: '/admin/servers', icon: '□' },
      { label: 'Databases', href: '/admin/databases', icon: '▤' },
      { label: 'Reverse Proxy', href: '/admin/reverse-proxy', icon: '⇄' },
    ],
  },
  {
    label: 'PLATFORM',
    items: [
      { label: 'Coolify', href: 'https://coolify.getouch.co', icon: '◈', external: true },
      { label: 'Deployments', href: '/admin/servers', icon: '↑' },
    ],
  },
  {
    label: 'APPLICATIONS',
    items: [
      { label: 'App Registry', href: '/admin/databases', icon: '▣' },
      { label: 'Users', href: '/admin/users', icon: '◉' },
    ],
  },
  {
    label: 'AI & AUTOMATION',
    items: [
      { label: 'AI Services', href: 'https://ai.getouch.co', icon: '◎', external: true },
      { label: 'SearXNG', href: 'https://search.getouch.co', icon: '◌', external: true },
    ],
  },
  {
    label: 'COMMUNICATION',
    items: [
      { label: 'WhatsApp API', href: 'https://wa.getouch.co', icon: '◐', external: true },
      { label: 'Chatwoot', href: 'https://chat.getouch.co', icon: '◑', external: true },
    ],
  },
  {
    label: 'MONITORING',
    items: [
      { label: 'System Health', href: '/admin', icon: '◍' },
      { label: 'Grafana', href: 'https://grafana.getouch.co', icon: '◫', external: true },
      { label: 'Analytics', href: 'https://analytics.getouch.co', icon: '▥', external: true },
    ],
  },
  {
    label: 'ACCESS',
    items: [{ label: 'Quick Links', href: '/admin', icon: '⊞' }],
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  return (
    <div className="portal-shell">
      {/* Sidebar */}
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <span className="portal-brand-dot">◆</span>
          <div>
            <div className="portal-brand-name">GetTouch</div>
            <div className="portal-brand-sub">INFRASTRUCTURE</div>
          </div>
        </div>

        <nav className="portal-nav">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="portal-nav-section">
              <div className="portal-nav-label">{section.label}</div>
              {section.items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  className="portal-nav-item"
                >
                  <span className="portal-nav-icon">{item.icon}</span>
                  {item.label}
                  {item.external && <span className="portal-nav-ext">↗</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="portal-sidebar-footer">
          <span className="portal-user-dot">◉</span>
          <span className="portal-user-name">{session.name}</span>
          <form action={logout} style={{ marginLeft: 'auto' }}>
            <button type="submit" className="portal-logout-btn">↪</button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <div className="portal-main">
        <header className="portal-header">
          <div>
            <h1 className="portal-header-title">GetTouch.co &mdash; INFRASTRUCTURE</h1>
          </div>
          <div className="portal-header-right">
            <span className="portal-badge">PRODUCTION</span>
            <form action={logout}>
              <button type="submit" className="portal-header-logout">Logout</button>
            </form>
          </div>
        </header>

        <div className="portal-content">
          {children}
        </div>
      </div>
    </div>
  );
}
