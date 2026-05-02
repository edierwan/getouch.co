import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { objectStorageActivity, objectStorageAccessKeys, objectStorageTenantMappings } from '@/lib/object-storage/schema';
import { ENDPOINTS, STORAGE } from '@/lib/object-storage/seaweed';
import { getObjectStorageSnapshot } from '@/lib/object-storage/telemetry';
import { requireAdmin } from '../_helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const snapshot = await getObjectStorageSnapshot();
  const { master, gateway, capacity, controlPlane } = snapshot;
  const bucketInfos = snapshot.buckets.slice(0, 32);
  const totalObjects = bucketInfos.length > 0 && bucketInfos.some((bucket) => bucket.objectCount == null)
    ? null
    : bucketInfos.reduce((sum, bucket) => sum + (bucket.objectCount ?? 0), 0);
  const totalUsedBytes = capacity.usedBytes;
  const totalCapacityBytes = capacity.totalBytes;
  const freeBytes = capacity.freeBytes;

  let tenantCount = 0;
  let activeKeyCount = 0;
  let recentActivity: Array<{ id: string; eventType: string; tenantId: string | null; bucket: string | null; objectKey: string | null; actor: string | null; sourceIp: string | null; status: string; createdAt: string }> = [];
  let activity24hCount = 0;

  try {
    const tenantsRes = await db.execute(sql`SELECT count(*)::int AS c FROM object_storage_tenant_mappings WHERE status = 'active'`);
    tenantCount = (tenantsRes as unknown as Array<{ c: number }>)[0]?.c ?? 0;
  } catch { /* table may not exist yet */ }

  try {
    const keysRes = await db.execute(sql`SELECT count(*)::int AS c FROM object_storage_access_keys WHERE status = 'active'`);
    activeKeyCount = (keysRes as unknown as Array<{ c: number }>)[0]?.c ?? 0;
  } catch { /* table may not exist yet */ }

  try {
    const rows = await db
      .select()
      .from(objectStorageActivity)
      .orderBy(sql`created_at DESC`)
      .limit(8);
    recentActivity = rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      tenantId: r.tenantId,
      bucket: r.bucket,
      objectKey: r.objectKey,
      actor: r.actor,
      sourceIp: r.sourceIp,
      status: r.status,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
    const counted = await db.execute(
      sql`SELECT count(*)::int AS c FROM object_storage_activity WHERE created_at > now() - interval '24 hours'`,
    );
    activity24hCount = (counted as unknown as Array<{ c: number }>)[0]?.c ?? 0;
  } catch { /* table may not exist yet */ }

  return NextResponse.json({
    status: gateway.reachable && master.reachable && controlPlane.filerReachable ? 'online' : 'degraded',
    health:
      gateway.reachable && master.reachable && controlPlane.filerReachable
        ? capacity.source === 'filesystem-host'
          ? 'Gateway and Seaweed control plane are healthy. Capacity is sourced from the backing filesystem via the host relay.'
          : 'Gateway and Seaweed control plane are healthy.'
        : gateway.reachable
          ? 'Gateway is reachable, but part of the Seaweed control plane is unavailable from the current runtime.'
          : 'Gateway is unreachable.',
    gateway,
    master,
    controlPlane,
    capacity,
    endpoints: ENDPOINTS,
    storage: STORAGE,
    metrics: {
      bucketCount: snapshot.buckets.length,
      tenantCount,
      activeKeyCount,
      totalObjects,
      totalUsedBytes,
      totalCapacityBytes,
      freeBytes,
      activity24hCount,
    },
    buckets: bucketInfos,
    recentActivity,
  });
}

void objectStorageAccessKeys;
void objectStorageTenantMappings;
