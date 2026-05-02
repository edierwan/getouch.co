import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionSessions } from '@/lib/schema';
import { evolutionFetch, recordEvent } from '@/lib/evolution';
import {
  buildConnectPath,
  ensureRemoteSession,
  EVOLUTION_DEPENDENCY_FAILURE_STATUS,
  extractPairedNumber,
  fetchConnectionState,
  getDetailForState,
  getFailureDetail,
  getRemoteIdCandidates,
  isMissingRemoteInstance,
  isRetryableTimeoutFailure,
  mapBackendStateToSessionStatus,
  normalizeQrPayload,
  recoverTimedOutConnect,
  type EvolutionQrPayload,
} from '../../_shared';
import { requireAdmin } from '../../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }
const ACTIONS = new Set(['connect', 'reconnect', 'disconnect', 'logout', 'qr', 'restart']);

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

  if (action === 'connect' || action === 'reconnect' || action === 'qr' || action === 'restart') {
    let resolvedRemoteId = remoteId;
    let detailPrefix: string | null = action === 'restart'
      ? 'Session restart requested. Requesting a fresh connection now.'
      : null;
    let r = null as Awaited<ReturnType<typeof evolutionFetch<EvolutionQrPayload>>> | null;

    if (action === 'restart') {
      await evolutionFetch(`/instance/logout/${encodeURIComponent(remoteId)}`, {
        method: 'DELETE',
        timeoutMs: 6000,
      });
    }

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
      const ensured = await ensureRemoteSession(row.sessionName);
      if (!ensured.ok) {
        return NextResponse.json({
          ok: false,
          status: ensured.status,
          error: ensured.error ?? 'backend_error',
          detail: `Evolution runtime session is missing and recreation failed. ${getFailureDetail({
            status: ensured.status,
            error: ensured.error,
            data: ensured.data,
            remoteId: row.sessionName,
          })}`,
        }, { status: EVOLUTION_DEPENDENCY_FAILURE_STATUS });
      }

      resolvedRemoteId = ensured.remoteId;
      detailPrefix = ensured.created
        ? [detailPrefix, 'Evolution runtime session was missing. The portal created it before requesting a fresh QR.'].filter(Boolean).join(' ')
        : detailPrefix;
      r = await evolutionFetch<EvolutionQrPayload>(
        buildConnectPath(resolvedRemoteId),
        { method: 'GET', timeoutMs: 8000 },
      );
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
      const now = new Date();
      const pairedNumber = extractPairedNumber(r.data) ?? row.pairedNumber ?? row.phoneNumber;
      const detail = [detailPrefix, getDetailForState({ ...qr, state })].filter(Boolean).join(' ') || null;
      await db.update(evolutionSessions).set({
        evolutionRemoteId: resolvedRemoteId,
        status: sessionStatus,
        qrStatus: state === 'open' ? 'connected' : qr.qr || qr.qrCode || qr.pairingCode ? 'pending' : null,
        updatedAt: now,
        qrExpiresAt: sessionStatus === 'qr_pending' ? new Date(now.getTime() + 60 * 1000) : null,
        lastQrAt: qr.qr || qr.qrCode ? now : row.lastQrAt,
        lastConnectedAt: state === 'open' ? now : row.lastConnectedAt,
        pairedNumber: state === 'open' ? pairedNumber : row.pairedNumber,
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

  if (action === 'disconnect' || action === 'logout') {
    const r = await evolutionFetch(`/instance/logout/${encodeURIComponent(remoteId)}`, {
      method: 'DELETE', timeoutMs: 6000,
    });
    const now = new Date();
    await db.update(evolutionSessions).set({
      status: 'disconnected', qrStatus: null, qrExpiresAt: null,
      lastDisconnectedAt: now, updatedAt: now,
    }).where(eq(evolutionSessions.id, id));
    await recordEvent({
      eventType: action === 'logout' ? 'session.logged_out' : 'session.disconnected', severity: 'warn',
      summary: `Session "${row.sessionName}" ${action === 'logout' ? 'logged out' : 'disconnected'}`,
      actorEmail: auth.session?.email ?? null,
      instanceId: row.instanceId, sessionId: id, tenantId: row.tenantId,
    });
    return NextResponse.json({ ok: r.ok || true, state: 'disconnected' });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
