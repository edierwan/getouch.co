import { getServicesWithStatus } from '../data';

export default async function DatabasesPage() {
  const services = await getServicesWithStatus();
  const databaseServices = services.filter((service) =>
    ['Database', 'Database Admin', 'Auth / Supabase', 'Supabase'].includes(service.type)
  );

  return (
    <div className="portal-body">
      <div className="portal-page-header">
        <div>
          <h2 className="portal-page-title">Databases</h2>
          <p className="portal-page-sub">Database engines, admin tools, and Supabase-backed stacks running on the platform.</p>
        </div>
      </div>

      <section className="portal-section">
        <h3 className="portal-section-title">DATABASE SERVICES</h3>
        <table className="portal-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Description</th>
              <th>Type</th>
              <th>Status</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {databaseServices.map((service) => (
              <tr key={service.name}>
                <td className="portal-table-name">{service.name}</td>
                <td className="portal-table-desc">{service.description}</td>
                <td className="portal-table-cat">{service.type}</td>
                <td>
                  <span className={`portal-status${service.status === 'DEGRADED' ? ' portal-status-bad' : ' portal-status-good'}`}>
                    {service.status}
                  </span>
                </td>
                <td>
                  {service.url ? (
                    <a href={service.url} target="_blank" rel="noopener noreferrer" className="portal-table-link">
                      ↗
                    </a>
                  ) : (
                    <span className="portal-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}