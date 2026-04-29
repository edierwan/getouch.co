import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { objectStorageActivity } from '@/lib/schema';
import { requireAdmin } from '../_helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
  const eventType = url.searchParams.get('event');
  const tenantId = url.searchParams.get('tenant');
  const bucket = url.searchParams.get('bucket');

  try {
    let query = db.select().from(objectStorageActivity).$dynamic();
    const filters: Array<ReturnType<typeof sql>> = [];
    if (eventType) filters.push(sql`event_type = ${eventType}`);
    if (tenantId) filters.push(sql`tenant_id = ${tenantId}`);
    if (bucket) filters.push(sql`bucket = ${bucket}`);
    if (filters.length) {
      const combined = filters.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));
      query = query.where(combined);
    }
    const rows = await query.orderBy(sql`created_at DESC`).limit(limit);
    return NextResponse.json({ events: rows });
  } catch {
    return NextResponse.json({ events: [], degraded: true, blocker: 'migrations_pending' });
  }
}
