import DashboardClient from './DashboardClient';
import { getInfrastructureStorageSnapshot } from '@/lib/infrastructure';
import { getPlatformServicesSnapshot } from '@/lib/platform-services';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
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
