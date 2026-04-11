import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { logout } from '@/app/auth/actions';
import SidebarNav from './SidebarNav';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <span className="portal-brand-mark">◜</span>
          <div>
            <div className="portal-brand-name">GetTouch Cloud</div>
            <div className="portal-brand-sub">INFRASTRUCTURE</div>
          </div>
        </div>

        <SidebarNav />

        <div className="portal-sidebar-footer">
          <span className="portal-user-name">{session.name}</span>
          <form action={logout}>
            <button type="submit" className="portal-logout-btn">Logout</button>
          </form>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-header">
          <div>
            <h1 className="portal-header-title">GetTouch.co</h1>
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
