import InfrastructureClient from './InfrastructureClient';
import { getInfrastructureStorageSnapshot } from '@/lib/infrastructure';

export const dynamic = 'force-dynamic';

export default async function InfrastructurePage() {
  const storage = await getInfrastructureStorageSnapshot();

  return <InfrastructureClient storage={storage} />;
}