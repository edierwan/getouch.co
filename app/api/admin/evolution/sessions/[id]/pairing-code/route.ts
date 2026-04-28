import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionSessions } from '@/lib/schema';
import { evolutionFetch, recordEvent } from '@/lib/evolution';
import { formatPairingCode, normalizeMyPhone } from '@/lib/phone';
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

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: { phoneNumber?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const normalizedPhone = normalizeMyPhone(String(body.phoneNumber ?? ''));
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'invalid_phone_number', detail: 'Enter a valid Malaysian phone number.' }, { status: 400 });
  }

  const [row] = await db.select().from(evolutionSessions).where(eq(evolutionSessions.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let resolvedRemoteId = row.evolutionRemoteId ?? row.sessionName;
  let detailPrefix: string | null = null;
  let result = null as Awaited<ReturnType<typeof evolutionFetch<EvolutionQrPayload>>> | Awaited<ReturnType<typeof evolutionFetch<EvolutionCreatePayload>>> | null;

  for (const candidate of getRemoteIdCandidates(row)) {
    const attempt = await evolutionFetch<EvolutionQrPayload>(
      buildConnectPath(candidate, normalizedPhone),
      { method: 'GET', timeoutMs: 8000 },
    );

    if (attempt.ok) {
      if (candidate !== (row.evolutionRemoteId ?? row.sessionName)) {
        detailPrefix = `Resolved using remote session name "${candidate}".`;
      }
      resolvedRemoteId = candidate;
      result = attempt;
      break;
    }

    if (attempt.status !== 404 && !isMissingRemoteInstance(attempt.data)) {
      resolvedRemoteId = candidate;
      result = attempt;
      break;
    }
  }

  if (!result) {
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
        const recovered = await recoverTimedOutConnect(row.sessionName, normalizedPhone);
        if (recovered) {
          resolvedRemoteId = row.sessionName;
          detailPrefix = 'Evolution runtime session was missing. Recreation is still starting in the background.';
          result = recovered;
        }
      }

      if (!result) {
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

    if (!result) {
      resolvedRemoteId = created.data?.instance?.instanceName ?? row.sessionName;
      detailPrefix = 'Evolution runtime session was missing. The portal recreated it and requested a fresh pairing code.';
      const createdQr = normalizeQrPayload(created.data);
      result = createdQr.qr || createdQr.qrCode || createdQr.pairingCode || createdQr.state
        ? created
        : await evolutionFetch<EvolutionQrPayload>(
            buildConnectPath(resolvedRemoteId, normalizedPhone),
            { method: 'GET', timeoutMs: 8000 },
          );
    }
  }

  if (result && !result.ok && isRetryableTimeoutFailure(result.status, result.error)) {
    const recovered = await recoverTimedOutConnect(resolvedRemoteId, normalizedPhone);
    if (recovered) {
      detailPrefix ??= 'Evolution is still starting the runtime session.';
      result = recovered;
    }
  }

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      status: result.status,
      error: result.error ?? 'backend_error',
      detail: getFailureDetail({
        status: result.status,
        error: result.error,
        data: result.data,
        remoteId: resolvedRemoteId,
      }),
    }, { status: EVOLUTION_DEPENDENCY_FAILURE_STATUS });
  }

  const qr = normalizeQrPayload(result.data);
  const state = qr.state ?? await fetchConnectionState(resolvedRemoteId);
  const sessionStatus = mapBackendStateToSessionStatus(state);
  const detail = [detailPrefix, getDetailForState({ ...qr, state })].filter(Boolean).join(' ') || null;

  await db.update(evolutionSessions).set({
    evolutionRemoteId: resolvedRemoteId,
    status: sessionStatus,
    qrStatus: state === 'open' ? 'connected' : qr.qr || qr.qrCode || qr.pairingCode ? 'pending' : row.qrStatus,
    qrExpiresAt: sessionStatus === 'qr_pending' ? new Date(Date.now() + 60 * 1000) : row.qrExpiresAt,
    updatedAt: new Date(),
    lastConnectedAt: state === 'open' ? new Date() : row.lastConnectedAt,
  }).where(eq(evolutionSessions.id, id));

  await recordEvent({
    eventType: 'session.pairing_requested',
    summary: `Pairing code requested for "${row.sessionName}"`,
    actorEmail: auth.session?.email ?? null,
    instanceId: row.instanceId,
    sessionId: id,
    tenantId: row.tenantId,
    payload: { phoneNumber: normalizedPhone },
  });

  return NextResponse.json({
    ok: true,
    qr: qr.qr,
    qrCode: qr.qrCode,
    pairingCode: qr.pairingCode,
    pairingCodeFormatted: formatPairingCode(qr.pairingCode),
    state,
    connected: state === 'open',
    waitRecommended: !qr.pairingCode && !qr.qr && !qr.qrCode && (state === 'connecting' || state === 'qr' || state === null),
    detail: qr.pairingCode ? detail : detail ?? 'Evolution did not return a pairing code yet. Try again or use QR Code.',
    qrExpiresAt: sessionStatus === 'qr_pending' ? new Date(Date.now() + 60 * 1000).toISOString() : row.qrExpiresAt?.toISOString() ?? null,
    lastCheckedAt: new Date().toISOString(),
  });
}