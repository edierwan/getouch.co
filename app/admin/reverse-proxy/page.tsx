const proxyRows = [
  {
    name: 'Caddy',
    description: 'Primary reverse proxy terminating TLS and routing public traffic to containers.',
    endpoint: 'https://getouch.co',
    status: 'HEALTHY',
  },
  {
    name: 'Cloudflare Tunnel',
    description: 'Ingress path from the public internet into the VPS without exposing host ports directly.',
    endpoint: 'cloudflared + getouch.co',
    status: 'ACTIVE',
  },
  {
    name: 'Tailscale',
    description: 'Private admin and operations access path into the machine.',
    endpoint: '100.84.14.93',
    status: 'ACTIVE',
  },
  {
    name: 'SSL Automation',
    description: 'Let\'s Encrypt certificate issuance and renewal through the proxy layer.',
    endpoint: 'getouch.co/*.getouch.co',
    status: 'HEALTHY',
  },
];

export default function ReverseProxyPage() {
  return (
    <div className="portal-body">
      <div className="portal-page-header">
        <div>
          <h2 className="portal-page-title">Reverse Proxy</h2>
          <p className="portal-page-sub">Ingress, SSL, and routing layers exposed by the getouch.co infrastructure.</p>
        </div>
      </div>

      <section className="portal-section">
        <h3 className="portal-section-title">PROXY STACK</h3>
        <table className="portal-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Description</th>
              <th>Endpoint</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {proxyRows.map((row) => (
              <tr key={row.name}>
                <td className="portal-table-name">{row.name}</td>
                <td className="portal-table-desc">{row.description}</td>
                <td className="portal-table-cat">{row.endpoint}</td>
                <td>
                  <span className={`portal-status${row.status === 'DEGRADED' ? ' portal-status-bad' : ' portal-status-good'}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}