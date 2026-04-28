import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionSessions } from '@/lib/schema';
import { evolutionFetch, recordEvent } from '@/lib/evolution';
import {
  buildConnectPath,
  EVOLUTION_DEPENDENCY_FAILURE_STATUS,
  fetchConnectionState,
  getDetailForState,
  getFailureDetail,
  getRemoteIdCandidates,
  isMissingRemoteInstance,
  isRetryableTimeoutFailure,
  mapBackendStateToSessionStatus,
  normalizeQrPayload,
  recoverTimedOutConnect,
  type EvolutionCreatePayload,
  type EvolutionQrPayload,
} from '../../_shared';
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
    let resolvedRemoteId = remoteId;
    let detailPrefix: string | null = null;
    let r = null as Awaited<ReturnType<typeof evolutionFetch<EvolutionQrPayload>>> | Awaited<ReturnType<typeof evolutionFetch<EvolutionCreatePayload>>> | null;

    for (const candidate of getRemoteIdCandidates(row)) {
      const attempt = await evolutionFetch<EvolutionQrPayload>(
        buildConnectPath(candidate),
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
        if (isRetryableTimeoutFailure(created.status, created.error)) {
          const recovered = await recoverTimedOutConnect(row.sessionName);
          if (recovered) {
            resolvedRemoteId = row.sessionName;
            detailPrefix = 'Evolution runtime session was missing. Recreation is still starting in the background.';
            r = recovered;
          }
        }

        if (r) {
          // Continue through the shared success path below with a waiting state.
        } else {
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
      }

      if (!r) {
        resolvedRemoteId = created.data?.instance?.instanceName ?? row.sessionName;
        detailPrefix = 'Evolution runtime session was missing. The portal recreated it and requested a fresh QR.';
        const createdQr = normalizeQrPayload(created.data);

        r = createdQr.qr || createdQr.qrCode || createdQr.pairingCode || createdQr.state
          ? created
          : await evolutionFetch<EvolutionQrPayload>(
              buildConnectPath(resolvedRemoteId),
              { method: 'GET', timeoutMs: 8000 },
            );
      }
    }

    if (r && !r.ok && isRetryableTimeoutFailure(r.status, r.error)) {
      const recovered = await recoverTimedOutConnect(resolvedRemoteId);
      if (recovered) {
        detailPrefix ??= 'Evolution is still starting the runtime session.';
        r = recovered;
      }
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
