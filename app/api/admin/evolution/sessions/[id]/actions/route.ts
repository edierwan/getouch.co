import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionSessions } from '@/lib/schema';
import { evolutionFetch, recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }
const ACTIONS = new Set(['connect', 'reconnect', 'disconnect', 'qr']);

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: { action?: string };
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body.action ?? '').toLowerCase();
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: 'invalid_action', allowed: Array.from(ACTIONS) }, { status: 400 });
  }

  const [row] = await db.select().from(evolutionSessions).where(eq(evolutionSessions.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const remoteId = row.evolutionRemoteId ?? row.sessionName;

  if (action === 'connect' || action === 'reconnect' || action === 'qr') {
    const r = await evolutionFetch<{ qrcode?: { code?: string; base64?: string }; pairingCode?: string; instance?: unknown }>(
      `/instance/connect/${encodeURIComponent(remoteId)}`,
      { method: 'GET', timeoutMs: 8000 },
    );
    if (r.ok) {
      await db.update(evolutionSessions).set({
        status: 'qr_pending', qrStatus: 'pending', updatedAt: new Date(),
        qrExpiresAt: new Date(Date.now() + 60 * 1000),
      }).where(eq(evolutionSessions.id, id));
      await recordEvent({
        eventType: `session.${action}_requested`,
        summary: `Session ${action} requested for "${row.sessionName}"`,
        actorEmail: auth.session?.email ?? null,
        instanceId: row.instanceId, sessionId: id, tenantId: row.tenantId,
      });
      return NextResponse.json({
        ok: true,
        qr: r.data?.qrcode?.base64 ?? null,
        qrCode: r.data?.qrcode?.code ?? null,
        pairingCode: r.data?.pairingCode ?? null,
      });
    }
    return NextResponse.json({ ok: false, status: r.status, error: r.error ?? 'backend_error' }, { status: 502 });
  }

  if (action === 'disconnect') {
    const r = await evolutionFetch(`/instance/logout/${encodeURIComponent(remoteId)}`, {
      method: 'DELETE', timeoutMs: 6000,
    });
    await db.update(evolutionSessions).set({
      status: 'disconnected', qrStatus: null, qrExpiresAt: null,
      lastDisconnectedAt: new Date(), updatedAt: new Date(),
    }).where(eq(evolutionSessions.id, id));
    await recordEvent({
      eventType: 'session.disconnected', severity: 'warn',
      summary: `Session "${row.sessionName}" disconnected`,
      actorEmail: auth.session?.email ?? null,
      instanceId: row.instanceId, sessionId: id, tenantId: row.tenantId,
    });
    return NextResponse.json({ ok: r.ok || true });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
