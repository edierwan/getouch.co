import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionSessions } from '@/lib/schema';
import { evolutionFetch, recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [row] = await db.select().from(evolutionSessions).where(eq(evolutionSessions.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ session: row });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const [row] = await db.select().from(evolutionSessions).where(eq(evolutionSessions.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Best-effort: delete on Evolution backend
  if (row.evolutionRemoteId) {
    await evolutionFetch(`/instance/delete/${encodeURIComponent(row.evolutionRemoteId)}`, {
      method: 'DELETE',
      timeoutMs: 6000,
    });
  }

  await db.delete(evolutionSessions).where(eq(evolutionSessions.id, id));
  await recordEvent({
    eventType: 'session.deleted', severity: 'warn',
    summary: `Session "${row.sessionName}" deleted`,
    actorEmail: auth.session?.email ?? null,
    instanceId: row.instanceId, sessionId: id, tenantId: row.tenantId,
  });

  return NextResponse.json({ ok: true });
}
