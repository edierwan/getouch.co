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
const EVOLUTION_DEPENDENCY_FAILURE_STATUS = 424;

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

type EvolutionCreatePayload = EvolutionQrPayload & {
  instance?: { instanceName?: string; state?: string };
};

type EvolutionBackendErrorPayload = {
  error?: string;
  response?: {
    message?: string[] | string;
  };
};

function normalizeQrImage(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith('data:image')) return value;

  const compact = value.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return `data:image/png;base64,${compact}`;
  }

  return null;
}

function normalizeQrPayload(data: EvolutionQrPayload | EvolutionCreatePayload | undefined) {
  const nested = data?.qrcode;
  return {
    qr: normalizeQrImage(nested?.base64 ?? data?.base64 ?? null),
    qrCode: nested?.code ?? data?.code ?? null,
    pairingCode: nested?.pairingCode ?? data?.pairingCode ?? null,
    qrCount: nested?.count ?? data?.count ?? null,
    state: data?.instance?.state ?? null,
  };
}

function getBackendMessage(data: EvolutionBackendErrorPayload | EvolutionQrPayload | EvolutionCreatePayload | undefined) {
  const payload = data as EvolutionBackendErrorPayload | undefined;
  const message = payload?.response?.message;
  if (Array.isArray(message)) {
    return typeof message[0] === 'string' ? message[0] : null;
  }
  return typeof message === 'string' ? message : null;
}

function isMissingRemoteInstance(data: EvolutionBackendErrorPayload | EvolutionQrPayload | EvolutionCreatePayload | undefined) {
  const message = getBackendMessage(data)?.toLowerCase() ?? '';
  return message.includes('does not exist') || message.includes('instance') && message.includes('not found');
}

function getRemoteIdCandidates(row: typeof evolutionSessions.$inferSelect) {
  const values = [
    row.evolutionRemoteId?.trim() || null,
    row.sessionName.trim() || null,
    row.sessionName.trim().toLowerCase() || null,
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(values));
}

function getFailureDetail(input: {
  status: number;
  error: string | undefined;
  data: EvolutionBackendErrorPayload | EvolutionQrPayload | EvolutionCreatePayload | undefined;
  remoteId: string;
}) {
  const backendMessage = getBackendMessage(input.data);
  if (input.status === 0) return 'Evolution backend unreachable.';
  if (input.status === 401 || input.status === 403) return 'Evolution auth failed.';
  if (input.status === 404 || isMissingRemoteInstance(input.data)) {
    return `Evolution does not have a runtime session for "${input.remoteId}" yet.`;
  }
  if (backendMessage) return backendMessage;
  if (input.error === 'evolution_not_configured') return 'Evolution backend not configured.';
  return input.error ?? 'Unknown Evolution response.';
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
    let resolvedRemoteId = remoteId;
    let detailPrefix: string | null = null;
    let r = null as Awaited<ReturnType<typeof evolutionFetch<EvolutionQrPayload>>> | Awaited<ReturnType<typeof evolutionFetch<EvolutionCreatePayload>>> | null;

    for (const candidate of getRemoteIdCandidates(row)) {
      const attempt = await evolutionFetch<EvolutionQrPayload>(
        `/instance/connect/${encodeURIComponent(candidate)}`,
        { method: 'GET', timeoutMs: 8000 },
      );

      if (attempt.ok) {
        resolvedRemoteId = candidate;
        if (candidate !== remoteId) {
          detailPrefix = `Resolved using remote session name "${candidate}".`;
        }
        r = attempt;
        break;
      }

      if (attempt.status !== 404 && !isMissingRemoteInstance(attempt.data)) {
        resolvedRemoteId = candidate;
        r = attempt;
        break;
      }
    }

    if (!r) {
      const created = await evolutionFetch<EvolutionCreatePayload>('/instance/create', {
        method: 'POST',
        timeoutMs: 8000,
        body: JSON.stringify({
          instanceName: row.sessionName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });

      if (!created.ok) {
        return NextResponse.json({
          ok: false,
          status: created.status,
          error: created.error ?? 'backend_error',
          detail: `Evolution runtime session is missing and recreation failed. ${getFailureDetail({
            status: created.status,
            error: created.error,
            data: created.data,
            remoteId: row.sessionName,
          })}`,
        }, { status: EVOLUTION_DEPENDENCY_FAILURE_STATUS });
      }

      resolvedRemoteId = created.data?.instance?.instanceName ?? row.sessionName;
      detailPrefix = 'Evolution runtime session was missing. The portal recreated it and requested a fresh QR.';
      const createdQr = normalizeQrPayload(created.data);

      r = createdQr.qr || createdQr.qrCode || createdQr.pairingCode || createdQr.state
        ? created
        : await evolutionFetch<EvolutionQrPayload>(
            `/instance/connect/${encodeURIComponent(resolvedRemoteId)}`,
            { method: 'GET', timeoutMs: 8000 },
          );
    }

    if (r.ok) {
      const qr = normalizeQrPayload(r.data);
      const state = qr.state ?? await fetchConnectionState(resolvedRemoteId);
      const sessionStatus = mapBackendStateToSessionStatus(state);
      const detail = [detailPrefix, getDetailForState({ ...qr, state })].filter(Boolean).join(' ') || null;
      await db.update(evolutionSessions).set({
        evolutionRemoteId: resolvedRemoteId,
        status: sessionStatus,
        qrStatus: state === 'open' ? 'connected' : qr.qr || qr.qrCode || qr.pairingCode ? 'pending' : null,
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
    return NextResponse.json({
      ok: false,
      status: r.status,
      error: r.error ?? 'backend_error',
      detail: getFailureDetail({
        status: r.status,
        error: r.error,
        data: r.data,
        remoteId: resolvedRemoteId,
      }),
    }, { status: EVOLUTION_DEPENDENCY_FAILURE_STATUS });
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
