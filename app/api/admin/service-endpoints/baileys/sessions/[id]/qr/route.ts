import { NextResponse } from 'next/server';
import { requireAdmin, waProxy } from '../../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  if (!/^[a-z0-9_-]{1,40}$/.test(id)) {
    return NextResponse.json({ error: 'invalid_session_id' }, { status: 400 });
  }
  const r = await waProxy<{ qr?: string | null; status?: string }>(`/admin/sessions/${encodeURIComponent(id)}/qr`);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error ?? 'upstream_error', status: r.status }, { status: r.status === 404 ? 404 : 502 });
  }
  return NextResponse.json({ ok: true, qr: r.data?.qr ?? null, status: r.data?.status ?? null });
}
