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
            <a href="#product" className="lp-nav-link">Product</a>
            <a href="#pricing" className="lp-nav-link">Pricing</a>
            <a href="/admin" className="lp-nav-admin">Admin</a>
            <a href="https://ai.getouch.co" className="lp-nav-cta">Try Getouch</a>
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
            <a href="https://auth.getouch.co/auth/register" className="lp-btn-primary">Register</a>
          </div>
        </div>
      </section>

      {/* ── Product Section ── */}
      <section id="product" className="lp-section">
        <div className="lp-container">
          <p className="lp-section-tag">Product</p>
          <h2 className="lp-section-title">Everything you need, self-hosted</h2>
          <div className="lp-features">
            <div className="lp-feature-card">
              <span className="lp-feature-icon">🧠</span>
              <h3>AI Chat</h3>
              <p>Conversational AI powered by open-source models running on your own GPU.</p>
            </div>
            <div className="lp-feature-card">
              <span className="lp-feature-icon">🖼️</span>
              <h3>Image Generation</h3>
              <p>Create images with Stable Diffusion and other generative models locally.</p>
            </div>
            <div className="lp-feature-card">
              <span className="lp-feature-icon">📄</span>
              <h3>Document Analysis</h3>
              <p>Upload and analyze documents with RAG-powered retrieval and summarization.</p>
            </div>
            <div className="lp-feature-card">
              <span className="lp-feature-icon">🔍</span>
              <h3>Web Search</h3>
              <p>Privacy-first web search integrated directly into your AI conversations.</p>
            </div>
            <div className="lp-feature-card">
              <span className="lp-feature-icon">🤖</span>
              <h3>Autonomous Agents</h3>
              <p>Run task-driven agents that can browse, code, and solve complex problems.</p>
            </div>
            <div className="lp-feature-card">
              <span className="lp-feature-icon">🔒</span>
              <h3>Full Privacy</h3>
              <p>Your data never leaves your infrastructure. No third-party API calls required.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing Section ── */}
      <section id="pricing" className="lp-section lp-section-alt">
        <div className="lp-container">
          <p className="lp-section-tag">Pricing</p>
          <h2 className="lp-section-title">Simple, transparent pricing</h2>
          <div className="lp-pricing-grid">
            <div className="lp-pricing-card">
              <h3>Free</h3>
              <p className="lp-pricing-price">$0<span>/month</span></p>
              <ul className="lp-pricing-features">
                <li>AI Chat access</li>
                <li>Web search</li>
                <li>Document upload (5 files)</li>
                <li>Community support</li>
              </ul>
              <a href="https://auth.getouch.co/auth/register" className="lp-btn-secondary lp-pricing-btn">Get Started</a>
            </div>
            <div className="lp-pricing-card lp-pricing-featured">
              <h3>Pro</h3>
              <p className="lp-pricing-price">Coming Soon</p>
              <ul className="lp-pricing-features">
                <li>Everything in Free</li>
                <li>Unlimited documents</li>
                <li>Image generation</li>
                <li>Autonomous agents</li>
                <li>Priority support</li>
              </ul>
              <span className="lp-btn-primary lp-pricing-btn lp-pricing-soon">Coming Soon</span>
            </div>
            <div className="lp-pricing-card">
              <h3>Enterprise</h3>
              <p className="lp-pricing-price">Contact Us</p>
              <ul className="lp-pricing-features">
                <li>Everything in Pro</li>
                <li>Dedicated GPU instance</li>
                <li>Custom model fine-tuning</li>
                <li>SSO &amp; team management</li>
                <li>SLA guarantee</li>
              </ul>
              <a href="mailto:admin@getouch.co" className="lp-btn-secondary lp-pricing-btn">Contact Sales</a>
            </div>
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