import DashboardClient from './dashboard/DashboardClient';
import { getInfrastructureStorageSnapshot } from '@/lib/infrastructure';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const storage = await getInfrastructureStorageSnapshot();
  return (
    <div className="portal-body">
      <DashboardClient storage={storage} />
    </div>
  );
}
