import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionInstances } from '@/lib/schema';
import { recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [row] = await db.select().from(evolutionInstances).where(eq(evolutionInstances.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ instance: row });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const updates: Partial<typeof evolutionInstances.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 120);
  if (typeof body.internalUrl === 'string' && /^https?:\/\//i.test(body.internalUrl)) updates.internalUrl = body.internalUrl;
  if (typeof body.publicUrl === 'string') updates.publicUrl = body.publicUrl || null;
  if (typeof body.notes === 'string') updates.notes = body.notes || null;
  if (typeof body.region === 'string') updates.region = body.region || null;

  const [updated] = await db.update(evolutionInstances).set(updates).where(eq(evolutionInstances.id, id)).returning();
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordEvent({
    eventType: 'instance.updated', summary: `Instance "${updated.name}" updated`,
    actorEmail: auth.session?.email ?? null, instanceId: id, payload: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ instance: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const [deleted] = await db.delete(evolutionInstances).where(eq(evolutionInstances.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordEvent({
    eventType: 'instance.deleted', severity: 'warn',
    summary: `Instance "${deleted.name}" deleted`,
    actorEmail: auth.session?.email ?? null, instanceId: id,
  });

  return NextResponse.json({ ok: true });
}
