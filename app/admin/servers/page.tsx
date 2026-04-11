import { SERVER_NODES } from '../data';

export default function ServersPage() {
  return (
    <div className="portal-body">
      <div className="portal-page-header">
        <div>
          <h2 className="portal-page-title">Servers & Nodes</h2>
          <p className="portal-page-sub">Compute, access paths, and runtime orchestration for the getouch.co VPS.</p>
        </div>
      </div>

      <div className="portal-card-grid">
        {SERVER_NODES.map((node) => (
          <section key={node.name} className="portal-side-panel">
            <div className="portal-panel-head">
              <h3 className="portal-panel-title">{node.name}</h3>
              <span className="portal-status portal-status-good">{node.status}</span>
            </div>
            <div className="portal-info-list">
              <div className="portal-info-row">
                <span className="portal-info-label">Address</span>
                <span className="portal-info-value">{node.address}</span>
              </div>
              <div className="portal-info-row">
                <span className="portal-info-label">Role</span>
                <span className="portal-info-value">{node.role}</span>
              </div>
              <div className="portal-info-row">
                <span className="portal-info-label">Specs</span>
                <span className="portal-info-value">{node.specs}</span>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}