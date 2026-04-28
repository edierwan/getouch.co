import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionWebhooks } from '@/lib/schema';
import { recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const updates: Partial<typeof evolutionWebhooks.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.label === 'string') updates.label = body.label.slice(0, 120) || null;
  if (typeof body.status === 'string' && ['active', 'paused', 'failing'].includes(body.status)) {
    updates.status = body.status as 'active';
  }
  if (Array.isArray(body.events)) {
    updates.events = (body.events as unknown[]).map(String);
  }

  const [updated] = await db.update(evolutionWebhooks).set(updates).where(eq(evolutionWebhooks.id, id)).returning();
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { secretHash: _h, ...rest } = updated;
  return NextResponse.json({ webhook: rest });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [row] = await db.delete(evolutionWebhooks).where(eq(evolutionWebhooks.id, id)).returning();
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await recordEvent({
    eventType: 'webhook.deleted', severity: 'warn',
    summary: `Webhook deleted (${row.label ?? '—'})`,
    actorEmail: auth.session?.email ?? null,
  });
  return NextResponse.json({ ok: true });
}
