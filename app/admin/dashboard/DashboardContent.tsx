import DashboardClient from './DashboardClient';
import { getInfrastructureStorageSnapshot } from '@/lib/infrastructure';
import { getPlatformServicesSnapshot } from '@/lib/platform-services';

export async function DashboardContent() {
  const [storage, services] = await Promise.all([
    getInfrastructureStorageSnapshot(),
    getPlatformServicesSnapshot(),
  ]);

  return <DashboardClient storage={storage} services={services} />;
}

export function DashboardLoading() {
  return (
    <section className="dash-panel">
      <h3 className="dash-panel-title">Loading live platform status</h3>
      <p className="dash-summary-detail">
        The admin shell is ready. Infrastructure and service probes are still loading in the background.
      </p>
    </section>
  );
}