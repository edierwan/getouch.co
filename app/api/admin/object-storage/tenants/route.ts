import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { objectStorageTenantMappings } from '@/lib/object-storage/schema';
import { requireAdmin } from '../_helpers';
import { logActivity } from '../_activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const rows = await db
      .select()
      .from(objectStorageTenantMappings)
      .orderBy(sql`created_at DESC`);
    return NextResponse.json({ tenants: rows });
  } catch {
    return NextResponse.json({ tenants: [], degraded: true, blocker: 'migrations_pending' });
  }
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as {
    tenantId?: string;
    tenantName?: string;
    bucket?: string;
    prefix?: string;
    services?: string[];
    quotaBytes?: number;
    policy?: string;
    retentionDays?: number;
  };
  if (!body.tenantId || !body.bucket) {
    return NextResponse.json({ error: 'tenantId_and_bucket_required' }, { status: 400 });
  }
  const prefix = (body.prefix ?? `${body.tenantId}/`).replace(/^\/+/, '');
  try {
    const [row] = await db
      .insert(objectStorageTenantMappings)
      .values({
        tenantId: body.tenantId,
        tenantName: body.tenantName ?? null,
        bucket: body.bucket,
        prefix,
        services: body.services ?? [],
        quotaBytes: body.quotaBytes ?? null,
        policy: body.policy ?? 'read-write',
        retentionDays: body.retentionDays ?? null,
      })
      .returning();
    await logActivity({
      eventType: 'tenant.mapped',
      tenantId: body.tenantId,
      bucket: body.bucket,
      actor: session?.email ?? null,
      details: { prefix, services: body.services ?? [] },
    });
    return NextResponse.json({ ok: true, tenant: row });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'insert_failed' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  try {
    await db.delete(objectStorageTenantMappings).where(eq(objectStorageTenantMappings.id, id));
    await logActivity({ eventType: 'tenant.unmapped', actor: session?.email ?? null, details: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'delete_failed' },
      { status: 500 },
    );
  }
}
