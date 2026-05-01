import DashboardClient from './dashboard/DashboardClient';
import { getInfrastructureStorageSnapshot } from '@/lib/infrastructure';
import { getPlatformServicesSnapshot } from '@/lib/platform-services';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const [storage, services] = await Promise.all([
    getInfrastructureStorageSnapshot(),
    getPlatformServicesSnapshot(),
  ]);

  return (
    <div className="portal-body">
      <DashboardClient storage={storage} services={services} />
    </div>
  );
}
