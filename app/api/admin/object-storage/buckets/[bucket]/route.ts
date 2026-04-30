import { NextRequest, NextResponse } from 'next/server';
import { deleteBucket, describeBucket } from '@/lib/object-storage/seaweed';
import { requireAdmin } from '../../_helpers';
import { logActivity } from '../../_activity';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ bucket: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { bucket } = await ctx.params;
  const info = await describeBucket(bucket);
  return NextResponse.json({ bucket: info });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ bucket: string }> }) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const { bucket } = await ctx.params;
  const force = new URL(req.url).searchParams.get('force') === '1';

  const info = await describeBucket(bucket);
  if (!force && (info.objectCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'bucket_not_empty', objectCount: info.objectCount },
      { status: 409 },
    );
  }

  const result = await deleteBucket(bucket, force);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'failed' }, { status: 500 });

  await logActivity({
    eventType: 'bucket.deleted',
    bucket,
    actor: session?.email ?? null,
    details: { force },
  });
  return NextResponse.json({ ok: true });
}
