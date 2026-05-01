import DashboardClient from './DashboardClient';
import { getInfrastructureStorageSnapshot } from '@/lib/infrastructure';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const storage = await getInfrastructureStorageSnapshot();
  return (
    <div className="portal-body">
      <DashboardClient storage={storage} />
    </div>
  );
}
