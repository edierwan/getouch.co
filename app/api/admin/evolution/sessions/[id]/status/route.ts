import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionSessions } from '@/lib/schema';
import {
  fetchConnectionState,
  getDetailForState,
  getRemoteIdCandidates,
  mapBackendStateToSessionStatus,
} from '../../_shared';
import { requireAdmin } from '../../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

function deriveDetailState(status: typeof evolutionSessions.$inferSelect.status, state: string | null) {
  if (state) return state;
  if (status === 'connected') return 'open';
  if (status === 'qr_pending' || status === 'connecting') return 'connecting';
  if (status === 'disconnected') return 'disconnected';
  if (status === 'error') return 'failed';
  return null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const [row] = await db.select().from(evolutionSessions).where(eq(evolutionSessions.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let resolvedRemoteId = row.evolutionRemoteId ?? row.sessionName;
  let state: string | null = null;

  for (const candidate of getRemoteIdCandidates(row)) {
    const nextState = await fetchConnectionState(candidate);
    if (nextState) {
      resolvedRemoteId = candidate;
      state = nextState;
      break;
    }
  }

  const sessionStatus = state ? mapBackendStateToSessionStatus(state) : row.status;
  const detailState = deriveDetailState(row.status, state);
  const detail = getDetailForState({
    state: detailState,
    qr: null,
    qrCode: null,
    pairingCode: null,
    qrCount: row.qrStatus === 'pending' ? 0 : null,
  });

  const shouldUpdate = resolvedRemoteId !== row.evolutionRemoteId || sessionStatus !== row.status;
  if (shouldUpdate || (state === 'open' && !row.lastConnectedAt)) {
    await db.update(evolutionSessions).set({
      evolutionRemoteId: resolvedRemoteId,
      status: sessionStatus,
      lastConnectedAt: state === 'open' ? new Date() : row.lastConnectedAt,
      lastDisconnectedAt: state === 'close' || state === 'disconnected' ? new Date() : row.lastDisconnectedAt,
      updatedAt: new Date(),
    }).where(eq(evolutionSessions.id, id));
  }

  return NextResponse.json({
    ok: true,
    state,
    connected: state === 'open' || sessionStatus === 'connected',
    waitRecommended: state === 'connecting' || state === 'qr' || (!state && row.status === 'qr_pending'),
    detail,
    qrExpiresAt: row.qrExpiresAt?.toISOString() ?? null,
    lastCheckedAt: new Date().toISOString(),
    session: {
      ...row,
      evolutionRemoteId: resolvedRemoteId,
      status: sessionStatus,
    },
  });
}