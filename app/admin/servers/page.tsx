import ServersClient from './ServersClient';
import { getInfrastructureStorageSnapshot } from '@/lib/infrastructure';

export const dynamic = 'force-dynamic';

export default async function ServersPage() {
  const storage = await getInfrastructureStorageSnapshot();
  return (
    <div className="portal-body">
      <ServersClient storage={storage} />
    </div>
  );
}
