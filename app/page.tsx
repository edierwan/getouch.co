export default function HomePage() {
  return (
    <div className="lp">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <a href="/" className="lp-brand">
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="16" fill="url(#gn)" />
              <path d="M20 32c0-6.627 5.373-12 12-12s12 5.373 12 12-5.373 12-12 12" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
              <circle cx="32" cy="32" r="4" fill="#fff" />
              <defs><linearGradient id="gn" x1="0" y1="0" x2="64" y2="64"><stop stopColor="#6366f1" /><stop offset="1" stopColor="#a855f7" /></linearGradient></defs>
            </svg>
            <span>Getouch</span>
          </a>
          <div className="lp-nav-links">
            <a href="/admin" className="lp-nav-admin">Admin</a>
            <a href="https://ai.getouch.co" className="lp-nav-cta">Open Chat</a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero-glow" />
        <div className="lp-hero-content">
          <p className="lp-tag">Self-Hosted AI Platform</p>
          <h1 className="lp-title">
            Your AI.<br />Your Infrastructure.
          </h1>
          <p className="lp-subtitle">
            Chat, generate images, analyze documents, search the web,
            and run autonomous agents — all on your own GPU.
          </p>
          <div className="lp-hero-actions">
            <a href="https://ai.getouch.co" className="lp-btn-primary">Get Started</a>
          </div>
        </div>
      </section>
      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <span className="lp-footer-brand">Getouch</span>
          <span className="lp-footer-copy">© 2026 Getouch. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}