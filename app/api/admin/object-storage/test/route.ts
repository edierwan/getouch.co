import { NextRequest, NextResponse } from 'next/server';
import { createBucket, uploadObject, deleteObject, listObjects } from '@/lib/object-storage/seaweed';
import { requireAdmin } from '../_helpers';
import { logActivity } from '../_activity';

export const dynamic = 'force-dynamic';

const SMOKE_BUCKET = 'getouch-smoketest';

export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const url = new URL(req.url);
  const op = url.searchParams.get('op') ?? 'roundtrip';

  if (op === 'roundtrip') {
    const steps: Array<{ step: string; ok: boolean; detail?: string }> = [];

    const c = await createBucket(SMOKE_BUCKET);
    steps.push({ step: 'create_bucket', ok: c.ok, detail: c.error });

    const filename = `smoke-${Date.now()}.txt`;
    const body = new TextEncoder().encode(`portal-smoketest ${new Date().toISOString()}`);
    const u = await uploadObject(SMOKE_BUCKET, '', filename, body, 'text/plain');
    steps.push({ step: 'upload_object', ok: u.ok, detail: u.error });

    const list = await listObjects(SMOKE_BUCKET, '');
    steps.push({ step: 'list_objects', ok: list.length > 0, detail: `count=${list.length}` });

    const d = await deleteObject(SMOKE_BUCKET, filename);
    steps.push({ step: 'delete_object', ok: d.ok, detail: d.error });

    const allOk = steps.every((s) => s.ok);
    await logActivity({
      eventType: 'gateway.smoketest',
      bucket: SMOKE_BUCKET,
      actor: session?.email ?? null,
      status: allOk ? 'ok' : 'degraded',
      details: { steps },
    });
    return NextResponse.json({ ok: allOk, steps });
  }

  return NextResponse.json({ error: 'unknown_op' }, { status: 400 });
}
