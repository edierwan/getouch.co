import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionSessions } from '@/lib/schema';
import { evolutionFetch, recordEvent } from '@/lib/evolution';
import { formatPairingCode, normalizeMyPhone } from '@/lib/phone';
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
  let result = null as Awaited<ReturnType<typeof evolutionFetch<EvolutionQrPayload>>> | null;

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
      ? 'Evolution runtime session was missing. The portal created it before requesting a fresh pairing code.'
      : detailPrefix;
    result = await evolutionFetch<EvolutionQrPayload>(
      buildConnectPath(resolvedRemoteId, normalizedPhone),
      { method: 'GET', timeoutMs: 8000 },
    );
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
  const hasConnectArtifact = Boolean(qr.qr || qr.qrCode || qr.pairingCode);
  const sessionStatus = state === 'open'
    ? 'connected'
    : hasConnectArtifact || state === 'connecting' || state === 'qr'
      ? 'connecting'
      : mapBackendStateToSessionStatus(state);
  const now = new Date();
  const pairedNumber = extractPairedNumber(result.data) ?? (state === 'open' ? normalizedPhone : row.pairedNumber);
  const detail = [detailPrefix, getDetailForState({ ...qr, state })].filter(Boolean).join(' ') || null;

  await db.update(evolutionSessions).set({
    evolutionRemoteId: resolvedRemoteId,
    phoneNumber: normalizedPhone,
    pairedNumber,
    status: sessionStatus,
    qrStatus: state === 'open' ? 'connected' : hasConnectArtifact ? 'pending' : row.qrStatus,
    qrExpiresAt: sessionStatus === 'connecting' ? new Date(now.getTime() + 60 * 1000) : row.qrExpiresAt,
    lastQrAt: hasConnectArtifact ? now : row.lastQrAt,
    updatedAt: now,
    lastConnectedAt: state === 'open' ? now : row.lastConnectedAt,
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
    qrExpiresAt: sessionStatus === 'connecting' ? new Date(now.getTime() + 60 * 1000).toISOString() : row.qrExpiresAt?.toISOString() ?? null,
    lastCheckedAt: now.toISOString(),
  });
}