import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { logout } from '@/app/auth/actions';

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  return (
    <>
      <nav className="portal-nav">
        <div className="portal-nav-inner">
          <a href="/portal" className="portal-brand">
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="16" fill="url(#pn)" />
              <path d="M20 32c0-6.627 5.373-12 12-12s12 5.373 12 12-5.373 12-12 12" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
              <circle cx="32" cy="32" r="4" fill="#fff" />
              <defs><linearGradient id="pn" x1="0" y1="0" x2="64" y2="64"><stop stopColor="#6366f1" /><stop offset="1" stopColor="#a855f7" /></linearGradient></defs>
            </svg>
            <span>Getouch</span>
          </a>
          <div className="portal-nav-links">
            <span className="portal-user">{session.name}</span>
            <form action={logout}>
              <button type="submit" className="portal-logout">Logout</button>
            </form>
          </div>
        </div>
      </nav>
      {children}
      <footer className="portal-footer">
        <span className="portal-footer-copy">&copy; 2026 Getouch. All rights reserved.</span>
      </footer>
    </>
  );
}
