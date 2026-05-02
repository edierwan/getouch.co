import { NextResponse } from 'next/server';
import { ENDPOINTS, STORAGE } from '@/lib/object-storage/seaweed';
import { getObjectStorageSnapshot } from '@/lib/object-storage/telemetry';
import { requireAdmin } from '../_helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const snapshot = await getObjectStorageSnapshot();
  const { master, buckets, controlPlane, capacity } = snapshot;

  return NextResponse.json({
    endpoints: ENDPOINTS,
    storage: STORAGE,
    backend: {
      engine: 'SeaweedFS',
      version: 'latest',
      dataPath: STORAGE.dataPath,
      reachable: master.reachable || controlPlane.filerReachable,
      accessSource: controlPlane.source,
      maxVolumes: master.total,
      freeVolumes: master.free,
      activeNodes: master.active,
      allocatedVolumes: master.volumes,
      filesystemCapacity: capacity,
    },
    buckets: buckets.map((bucket) => bucket.name),
    multiTenant: {
      strategy: 'service-bucket-with-tenant-prefix',
      defaultBucket: STORAGE.defaultBucket,
      tenantIdSource: 'portal-control-plane',
    },
    security: {
      adminConsoleProtected: true,
      httpsEnforced: true,
      pathStyleSupport: STORAGE.pathStyle,
      signatureVersion: STORAGE.signatureVersion,
    },
  });
}
