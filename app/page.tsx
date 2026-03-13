export default function HomePage() {
  return (
    <div className="landing">
      <a href="/admin/" className="admin-link">Admin</a>
      <a href="https://ai.getouch.co" className="logo-link">
        <div className="logo-mark">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="64" height="64" rx="16" fill="url(#g)" />
            <path d="M20 32c0-6.627 5.373-12 12-12s12 5.373 12 12-5.373 12-12 12" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
            <circle cx="32" cy="32" r="4" fill="#fff" />
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="64" y2="64">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#a855f7" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 className="logo-text">Getouch</h1>
      </a>
    </div>
  );
}