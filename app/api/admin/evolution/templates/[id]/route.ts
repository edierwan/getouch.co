import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionTemplates } from '@/lib/schema';
import { recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }
const STATUS_VALUES = new Set(['draft', 'pending', 'approved', 'rejected', 'archived']);

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const updates: Partial<typeof evolutionTemplates.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 160);
  if (typeof body.body === 'string' && body.body.trim()) updates.body = body.body.trim().slice(0, 4000);
  if (typeof body.category === 'string') updates.category = body.category.slice(0, 60) || null;
  if (typeof body.language === 'string') updates.language = body.language.slice(0, 20);
  if (typeof body.status === 'string' && STATUS_VALUES.has(body.status)) updates.status = body.status as 'draft';
  if (Array.isArray(body.variables)) updates.variables = (body.variables as unknown[]).map(String).slice(0, 32);

  const [updated] = await db.update(evolutionTemplates).set(updates).where(eq(evolutionTemplates.id, id)).returning();
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordEvent({
    eventType: 'template.updated',
    summary: `Template "${updated.name}" updated`,
    actorEmail: auth.session?.email ?? null,
    tenantId: updated.tenantId,
  });

  return NextResponse.json({ template: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const [row] = await db.delete(evolutionTemplates).where(eq(evolutionTemplates.id, id)).returning();
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await recordEvent({
    eventType: 'template.deleted', severity: 'warn',
    summary: `Template "${row.name}" deleted`,
    actorEmail: auth.session?.email ?? null,
    tenantId: row.tenantId,
  });
  return NextResponse.json({ ok: true });
}
