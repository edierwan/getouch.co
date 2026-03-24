import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { logout } from '@/app/auth/actions';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <a href="/" className="logo">
            <span className="logo-icon">◆</span> Getouch
          </a>
          <div className="nav-links">
            <a href="/admin">Dashboard</a>
            <a href="/admin/users">Users</a>
            <a href="https://ai.getouch.co" className="nav-cta">
              Try Getouch
            </a>
            <span className="nav-user">{session.name}</span>
            <form action={logout}>
              <button type="submit" className="nav-logout">
                Logout
              </button>
            </form>
          </div>
        </div>
      </nav>
      {children}
      <footer className="footer">
        <div className="container footer-inner">
          <span className="footer-brand">◆ Getouch</span>
          <span className="footer-copy">&copy; 2026 Getouch</span>
        </div>
      </footer>
    </>
  );
}
