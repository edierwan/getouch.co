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

type EvolutionQrPayload = {
  qrcode?: { code?: string; base64?: string; pairingCode?: string; count?: number };
  pairingCode?: string;
  base64?: string;
  code?: string;
  count?: number;
  instance?: { state?: string };
};

function normalizeQrPayload(data: EvolutionQrPayload | undefined) {
  const nested = data?.qrcode;
  return {
    qr: nested?.base64 ?? data?.base64 ?? null,
    qrCode: nested?.code ?? data?.code ?? null,
    pairingCode: nested?.pairingCode ?? data?.pairingCode ?? null,
    qrCount: nested?.count ?? data?.count ?? null,
    state: data?.instance?.state ?? null,
  };
}

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
    const r = await evolutionFetch<EvolutionQrPayload>(
      `/instance/connect/${encodeURIComponent(remoteId)}`,
      { method: 'GET', timeoutMs: 8000 },
    );
    if (r.ok) {
      const qr = normalizeQrPayload(r.data);
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
        qr: qr.qr,
        qrCode: qr.qrCode,
        pairingCode: qr.pairingCode,
        qrCount: qr.qrCount,
        state: qr.state,
        detail: qr.qr || qr.qrCode || qr.pairingCode
          ? null
          : qr.qrCount === 0
            ? 'Backend is connecting but has not emitted a QR yet.'
            : 'Backend did not return QR data.',
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
