import ServersClient from './ServersClient';
import { getInfrastructureNodeSnapshot, getInfrastructureStorageSnapshot } from '@/lib/infrastructure';

export const dynamic = 'force-dynamic';

export default async function ServersPage() {
  const [storage, node] = await Promise.all([
    getInfrastructureStorageSnapshot(),
    getInfrastructureNodeSnapshot(),
  ]);
  return (
    <div className="portal-body">
      <ServersClient storage={storage} node={node} />
    </div>
  );
}
