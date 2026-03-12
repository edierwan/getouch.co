const capabilities = [
  {
    icon: '💬',
    title: 'AI Chat',
    desc: 'Multi-model conversations powered by local LLMs. Context-aware, fast, and private.',
    tag: 'Live'
  },
  {
    icon: '🎨',
    title: 'Image Generation',
    desc: 'Create visuals from text prompts using diffusion models running on your own GPU.',
    tag: 'Available'
  },
  {
    icon: '📄',
    title: 'Document AI',
    desc: 'Upload PDFs, docs, and spreadsheets — ask questions and get answers with RAG.',
    tag: 'Available'
  },
  {
    icon: '🔍',
    title: 'Web Search',
    desc: 'AI-enhanced web search that combines live results with model reasoning.',
    tag: 'Available'
  },
  {
    icon: '🤖',
    title: 'AI Agents',
    desc: 'Autonomous agents that can browse, code, analyze data, and execute multi-step tasks.',
    tag: 'Available'
  },
  {
    icon: '🛡️',
    title: 'Self-Hosted',
    desc: 'Everything runs on your infrastructure. Your data never leaves your server.',
    tag: 'Always'
  }
];

const specs = [
  { label: 'GPU', value: 'RTX 5060 Ti 16GB' },
  { label: 'RAM', value: '64 GB DDR5' },
  { label: 'Storage', value: '1.5 TB NVMe' },
  { label: 'Models', value: 'Qwen3 14B + more' }
];

export default function HomePage() {
  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <a href="/" className="logo">
            <span className="logo-icon">◆</span> Getouch
          </a>
          <div className="nav-links">
            <a href="#capabilities">Features</a>
            <a href="#infrastructure">Infrastructure</a>
            <a href="/admin">Admin</a>
            <a href="https://ai.getouch.co" className="nav-cta">
              Open AI Chat
            </a>
          </div>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-glow" />
          <div className="container">
            <div className="hero-badge">Self-Hosted AI Platform</div>
            <h1>
              Your AI.<br />
              Your Infrastructure.<br />
              <span className="gradient-text">Your Rules.</span>
            </h1>
            <p className="hero-sub">
              Getouch is a full-stack AI platform running on dedicated GPU hardware.
              Chat, generate images, analyze documents, search the web, and deploy
              agents — all from one interface, all on your own server.
            </p>
            <div className="hero-actions">
              <a href="https://ai.getouch.co" className="btn btn-primary">
                <span>Launch AI Chat</span>
                <span className="btn-arrow">→</span>
              </a>
              <a href="#capabilities" className="btn btn-ghost">
                Explore Features
              </a>
            </div>
            <div className="hero-stats">
              {specs.map((s) => (
                <div key={s.label} className="stat">
                  <span className="stat-value">{s.value}</span>
                  <span className="stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="capabilities" id="capabilities">
          <div className="container">
            <div className="section-header">
              <span className="section-tag">Capabilities</span>
              <h2>Everything AI, one platform</h2>
              <p>Six core capabilities, zero external API dependencies.</p>
            </div>
            <div className="cap-grid">
              {capabilities.map((c) => (
                <article key={c.title} className="cap-card">
                  <div className="cap-icon">{c.icon}</div>
                  <div className="cap-tag">{c.tag}</div>
                  <h3>{c.title}</h3>
                  <p>{c.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="infra" id="infrastructure">
          <div className="container">
            <div className="infra-grid">
              <div className="infra-content">
                <span className="section-tag">Infrastructure</span>
                <h2>Built for real workloads</h2>
                <p>
                  Running on a dedicated server with NVIDIA RTX 5060 Ti (16 GB VRAM),
                  64 GB system RAM, and 1.5 TB NVMe storage. Models run natively via
                  Ollama with full GPU acceleration — no cloud API calls, no token limits.
                </p>
                <ul className="infra-list">
                  <li>Cloudflare Tunnel for secure edge ingress</li>
                  <li>Caddy reverse proxy with automatic TLS</li>
                  <li>PostgreSQL 16 for structured data</li>
                  <li>Docker Compose orchestration</li>
                  <li>Coolify for deployment management</li>
                  <li>Tailscale for private admin access</li>
                </ul>
              </div>
              <div className="infra-visual">
                <div className="arch-card">
                  <div className="arch-row">
                    <span className="arch-label">Edge</span>
                    <span className="arch-item">Cloudflare Tunnel</span>
                  </div>
                  <div className="arch-arrow">↓</div>
                  <div className="arch-row">
                    <span className="arch-label">Proxy</span>
                    <span className="arch-item">Caddy</span>
                  </div>
                  <div className="arch-arrow">↓</div>
                  <div className="arch-row">
                    <span className="arch-label">AI</span>
                    <span className="arch-item">Open WebUI + Ollama (GPU)</span>
                  </div>
                  <div className="arch-arrow">↓</div>
                  <div className="arch-row">
                    <span className="arch-label">Data</span>
                    <span className="arch-item">PostgreSQL + NVMe</span>
                  </div>
                  <div className="arch-arrow">↓</div>
                  <div className="arch-row">
                    <span className="arch-label">Ops</span>
                    <span className="arch-item">Coolify + Tailscale</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div className="container">
            <div className="cta-card">
              <h2>Ready to start?</h2>
              <p>Open the AI interface and begin chatting with locally-hosted models.</p>
              <a href="https://ai.getouch.co" className="btn btn-primary btn-lg">
                <span>Open Getouch AI</span>
                <span className="btn-arrow">→</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span className="footer-brand">◆ Getouch</span>
          <div className="footer-links">
            <a href="https://ai.getouch.co">AI Chat</a>
            <a href="/admin">Admin</a>
            <a href="https://coolify.getouch.co">Coolify</a>
            <a href="https://db.getouch.co">Database</a>
          </div>
          <span className="footer-copy">&copy; 2026 Getouch</span>
        </div>
      </footer>
    </>
  );
}