import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { objectStorageActivity, objectStorageAccessKeys, objectStorageTenantMappings } from '@/lib/schema';
import { getMasterStatus, listBuckets, describeBucket, ENDPOINTS, STORAGE } from '@/lib/object-storage/seaweed';
import { requireAdmin } from '../_helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [master, buckets] = await Promise.all([getMasterStatus(), listBuckets()]);

  const bucketInfos = await Promise.all(buckets.slice(0, 32).map(describeBucket));
  const totalObjects = bucketInfos.reduce((s, b) => s + (b.objectCount ?? 0), 0);
  const totalUsedBytes = bucketInfos.reduce((s, b) => s + (b.sizeBytes ?? 0), 0);

  // Approx capacity (each volume ≈ 30 GB by default, max=200 from compose)
  const volumeSizeBytes = 30 * 1024 * 1024 * 1024;
  const totalCapacityBytes = master.total != null ? master.total * volumeSizeBytes : null;
  const freeBytes = master.free != null ? master.free * volumeSizeBytes : null;

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
    status: master.reachable ? 'online' : 'degraded',
    health: master.reachable ? 'healthy' : 'unreachable',
    master,
    endpoints: ENDPOINTS,
    storage: STORAGE,
    metrics: {
      bucketCount: buckets.length,
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
