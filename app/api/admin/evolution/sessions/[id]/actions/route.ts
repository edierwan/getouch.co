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

type EvolutionConnectionStatePayload = {
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

function mapBackendStateToSessionStatus(state: string | null): typeof evolutionSessions.$inferInsert.status {
  switch (state) {
    case 'open':
      return 'connected';
    case 'connecting':
    case 'qr':
      return 'qr_pending';
    case 'close':
    case 'disconnected':
      return 'disconnected';
    case 'failed':
    case 'refused':
      return 'error';
    default:
      return 'qr_pending';
  }
}

async function fetchConnectionState(remoteId: string): Promise<string | null> {
  const state = await evolutionFetch<EvolutionConnectionStatePayload>(
    `/instance/connectionState/${encodeURIComponent(remoteId)}`,
    { method: 'GET', timeoutMs: 5000 },
  );
  if (!state.ok) return null;
  return state.data?.instance?.state ?? null;
}

function getDetailForState(input: {
  state: string | null;
  qr: string | null;
  qrCode: string | null;
  pairingCode: string | null;
  qrCount: number | null;
}): string | null {
  if (input.qr || input.qrCode || input.pairingCode) return null;
  if (input.state === 'open') return 'Session is already connected.';
  if (input.state === 'connecting' || input.state === 'qr') {
    return input.qrCount === 0
      ? 'Session is connecting. Waiting for Evolution to emit QR...'
      : 'Waiting for Evolution to emit QR...';
  }
  if (input.state === 'close' || input.state === 'disconnected') {
    return 'Session is disconnected. Retry QR to request a new connection.';
  }
  if (input.state === 'failed' || input.state === 'refused') {
    return 'Evolution reported a failed connection state.';
  }
  return 'Backend did not return QR data.';
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
      const state = qr.state ?? await fetchConnectionState(remoteId);
      const sessionStatus = mapBackendStateToSessionStatus(state);
      const detail = getDetailForState({ ...qr, state });
      await db.update(evolutionSessions).set({
        status: sessionStatus,
        qrStatus: qr.qr || qr.qrCode || qr.pairingCode ? 'pending' : null,
        updatedAt: new Date(),
        qrExpiresAt: sessionStatus === 'qr_pending' ? new Date(Date.now() + 60 * 1000) : null,
        lastConnectedAt: state === 'open' ? new Date() : row.lastConnectedAt,
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
        state,
        connected: state === 'open',
        waitRecommended: !qr.qr && !qr.qrCode && !qr.pairingCode && (state === 'connecting' || state === 'qr' || state === null),
        detail,
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
