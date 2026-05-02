import { NextRequest, NextResponse } from 'next/server';
import { createBucket } from '@/lib/object-storage/seaweed';
import { getObjectStorageSnapshot } from '@/lib/object-storage/telemetry';
import { requireAdmin } from '../_helpers';
import { logActivity } from '../_activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const snapshot = await getObjectStorageSnapshot();
  const buckets = snapshot.buckets;
  return NextResponse.json({ buckets });
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { name?: string; tenantId?: string };
  const name = String(body.name ?? '').trim().toLowerCase();
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });

  const result = await createBucket(name);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'failed' }, { status: 500 });

  await logActivity({
    eventType: 'bucket.created',
    bucket: name,
    tenantId: body.tenantId ?? null,
    actor: session?.email ?? null,
  });
  return NextResponse.json({ ok: true, bucket: name });
}
