import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, waProxy } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const direction = searchParams.get('direction') || undefined;
  const phone = searchParams.get('phone') || undefined;
  const limit = searchParams.get('limit') || '50';

  const r = await waProxy(`/admin/messages`, { query: { direction, phone, limit } });
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error, messages: [] }, { status: r.status === 503 ? 200 : 502 });
  }
  return NextResponse.json({ ok: true, ...((r.data as object) ?? {}) });
}
