import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { evolutionTemplates } from '@/lib/schema';
import { listTemplates, recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_VALUES = new Set(['draft', 'pending', 'approved', 'rejected', 'archived']);

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const rows = await listTemplates();
  return NextResponse.json({ templates: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const name = String(body.name ?? '').trim();
  const bodyText = String(body.body ?? '').trim();
  if (!name || name.length > 160) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (!bodyText) return NextResponse.json({ error: 'body_required' }, { status: 400 });
  if (bodyText.length > 4000) return NextResponse.json({ error: 'body_too_long' }, { status: 400 });

  const variables = Array.isArray(body.variables) ? (body.variables as unknown[]).map(String).slice(0, 32) : [];
  const status = STATUS_VALUES.has(String(body.status)) ? (body.status as 'draft') : 'draft';

  const [created] = await db.insert(evolutionTemplates).values({
    tenantId: typeof body.tenantId === 'string' && body.tenantId ? body.tenantId : null,
    name, body: bodyText, variables,
    category: typeof body.category === 'string' ? body.category.slice(0, 60) : null,
    language: typeof body.language === 'string' ? body.language.slice(0, 20) : 'en',
    status,
    createdByEmail: auth.session?.email ?? null,
  }).returning();

  await recordEvent({
    eventType: 'template.created',
    summary: `Template "${name}" created`,
    actorEmail: auth.session?.email ?? null,
    tenantId: created.tenantId,
  });

  return NextResponse.json({ template: created }, { status: 201 });
}
