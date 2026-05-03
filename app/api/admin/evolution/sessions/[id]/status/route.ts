import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { syncSessionsFromEvolution } from '@/lib/evolution';
import { evolutionSessions } from '@/lib/schema';
import {
  getDetailForState,
} from '../../_shared';
import { requireAdmin } from '../../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

function deriveDetailState(status: typeof evolutionSessions.$inferSelect.status, state: string | null) {
  if (state) return state;
  if (status === 'connected') return 'open';
  if (status === 'pending_connection') return null;
  if (status === 'qr_pending' || status === 'connecting') return 'connecting';
  if (status === 'disconnected') return 'disconnected';
  if (status === 'error') return 'failed';
  return null;
}

function deriveBackendState(status: typeof evolutionSessions.$inferSelect.status): string | null {
  switch (status) {
    case 'connected':
      return 'open';
    case 'connecting':
    case 'qr_pending':
      return 'connecting';
    case 'disconnected':
      return 'disconnected';
    case 'error':
      return 'failed';
    default:
      return null;
  }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const [row] = await db.select().from(evolutionSessions).where(eq(evolutionSessions.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const [session] = await syncSessionsFromEvolution([row]);
  const state = deriveBackendState(session.status);
  const detailState = deriveDetailState(session.status, state);
  const detail = getDetailForState({
    state: detailState,
    qr: null,
    qrCode: null,
    pairingCode: null,
    qrCount: session.qrStatus === 'pending' ? 0 : null,
  });

  const now = new Date().toISOString();

  return NextResponse.json({
    ok: true,
    state,
    connected: state === 'open' || session.status === 'connected',
    waitRecommended: state === 'connecting' || state === 'qr' || (!state && (session.status === 'connecting' || session.status === 'qr_pending')),
    detail,
    qrExpiresAt: session.qrExpiresAt?.toISOString() ?? null,
    lastCheckedAt: now,
    session,
  });
}