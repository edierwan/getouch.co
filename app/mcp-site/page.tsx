import { getMcpPublicStatus } from '@/lib/mcp-service';

export const dynamic = 'force-dynamic';

function toneClass(tone: 'healthy' | 'warning') {
  return tone === 'healthy' ? 'mcp-site-chip mcp-site-chip-healthy' : 'mcp-site-chip mcp-site-chip-warning';
}

function healthClass(status: 'healthy' | 'warning' | 'degraded') {
  if (status === 'healthy') return 'mcp-site-health-badge mcp-site-health-badge-healthy';
  if (status === 'warning') return 'mcp-site-health-badge mcp-site-health-badge-warning';
  return 'mcp-site-health-badge mcp-site-health-badge-degraded';
}

export default async function McpPublicPage() {
  const data = await getMcpPublicStatus();

  return (
    <div className="mcp-site">
      <nav className="mcp-site-nav">
        <div className="mcp-site-nav-inner">
          <a href="/" className="mcp-site-brand">
            <span className="mcp-site-brand-mark">⌬</span>
            <span>Getouch MCP</span>
          </a>
          <div className="mcp-site-links">
            <a href="#capabilities">Capabilities</a>
            <a href="#clients">Clients</a>
            <a href="#status">Status</a>
            <a href="#support">Support</a>
            <a href="https://portal.getouch.co/service-endpoints/mcp" className="mcp-site-console-link">Portal Console</a>
          </div>
        </div>
      </nav>

      <main className="mcp-site-main">
        <section className="mcp-site-hero">
          <div className="mcp-site-hero-copy">
            <div className="mcp-site-kicker">Developer Endpoint</div>
            <h1>Remote MCP for the Getouch platform.</h1>
            <p>
              Connect any Streamable HTTP MCP client to a single public endpoint with bearer-token
              auth, central API-key validation, database-backed activity logs, and a safe initial tool set.
            </p>
            <div className="mcp-site-hero-actions">
              <a href="#connect" className="mcp-site-primary-action">Connect to /mcp</a>
              <a href="https://portal.getouch.co/service-endpoints/mcp" className="mcp-site-secondary-action">Open operator console</a>
            </div>
          </div>

          <section className="mcp-site-endpoint-card">
            <div className="mcp-site-endpoint-head">
              <span className={toneClass(data.summary.statusTone)}>{data.summary.statusLabel}</span>
              <span className="mcp-site-small">Checked {new Date(data.checkedAt).toLocaleString()}</span>
            </div>
            <div className="mcp-site-endpoint-url">{data.summary.endpointUrl}</div>
            <div className="mcp-site-metric-grid">
              <div className="mcp-site-metric-card">
                <span>Transport</span>
                <strong>{data.summary.transport}</strong>
              </div>
              <div className="mcp-site-metric-card">
                <span>Auth</span>
                <strong>{data.summary.authMode}</strong>
              </div>
              <div className="mcp-site-metric-card">
                <span>Safe tools</span>
                <strong>{data.summary.enabledTools}</strong>
              </div>
              <div className="mcp-site-metric-card">
                <span>Healthy checks</span>
                <strong>{data.summary.healthyServers}</strong>
              </div>
            </div>
          </section>
        </section>

        <section id="capabilities" className="mcp-site-section">
          <div className="mcp-site-section-head">
            <div>
              <span className="mcp-site-section-tag">Capabilities</span>
              <h2>What this endpoint exposes right now</h2>
            </div>
            <p>Read-only, operator-approved tools first. Future scaffolds stay disabled until they pass review.</p>
          </div>

          <div className="mcp-site-capability-grid">
            {data.capabilities.map((item) => (
              <section key={item.title} className="mcp-site-capability-card">
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </section>
            ))}
          </div>
        </section>

        <section id="connect" className="mcp-site-section mcp-site-section-split">
          <div>
            <div className="mcp-site-section-head mcp-site-section-head-compact">
              <div>
                <span className="mcp-site-section-tag">Connect</span>
                <h2>Use central bearer keys</h2>
              </div>
            </div>
            <ol className="mcp-site-steps">
              <li>Generate an MCP access key in the portal console or the API key manager.</li>
              <li>Point your MCP client at the public endpoint URL.</li>
              <li>Initialize the session, then call <code>tools/list</code> and <code>tools/call</code>.</li>
            </ol>
            <div className="mcp-site-callout">
              <strong>Endpoint</strong>
              <span>{data.summary.endpointUrl}</span>
            </div>
          </div>

          <div className="mcp-site-code-stack">
            <section className="mcp-site-code-card">
              <div className="mcp-site-code-label">cURL</div>
              <pre><code>{data.snippets.curl}</code></pre>
            </section>
            <section className="mcp-site-code-card">
              <div className="mcp-site-code-label">JavaScript</div>
              <pre><code>{data.snippets.javascript}</code></pre>
            </section>
          </div>
        </section>

        <section id="clients" className="mcp-site-section">
          <div className="mcp-site-section-head">
            <div>
              <span className="mcp-site-section-tag">Clients</span>
              <h2>Compatibility profile</h2>
            </div>
            <p>The runtime follows the Streamable HTTP JSON-RPC contract and returns standard MCP tool, resource, and prompt shapes.</p>
          </div>

          <div className="mcp-site-compatibility-list">
            {data.compatibility.map((item) => (
              <section key={item.label} className="mcp-site-compatibility-card">
                <div>
                  <h3>{item.label}</h3>
                  <p>{item.detail}</p>
                </div>
                <span className="mcp-site-compatibility-status">{item.status}</span>
              </section>
            ))}
          </div>
        </section>

        <section id="status" className="mcp-site-section">
          <div className="mcp-site-section-head">
            <div>
              <span className="mcp-site-section-tag">Status</span>
              <h2>Current health checks</h2>
            </div>
            <p>Live status is pulled from the same service layer used by the portal MCP console.</p>
          </div>

          <div className="mcp-site-health-list">
            {data.health.tests.map((item) => (
              <section key={item.label} className="mcp-site-health-card">
                <div className="mcp-site-health-head">
                  <h3>{item.label}</h3>
                  <span className={healthClass(item.status)}>{item.status}</span>
                </div>
                <p>{item.detail}</p>
              </section>
            ))}
          </div>
        </section>

        <section id="support" className="mcp-site-section mcp-site-support">
          <div>
            <span className="mcp-site-section-tag">Support</span>
            <h2>Operator workflows</h2>
            <p>
              The public page is intentionally lightweight. Use the portal console for access-key generation,
              server registrations, runtime health checks, and audit visibility.
            </p>
          </div>
          <div className="mcp-site-support-actions">
            <a href="https://portal.getouch.co/service-endpoints/mcp" className="mcp-site-primary-action">Open MCP console</a>
            <a href="https://portal.getouch.co/api-keys" className="mcp-site-secondary-action">Open API keys</a>
          </div>
        </section>
      </main>
    </div>
  );
}