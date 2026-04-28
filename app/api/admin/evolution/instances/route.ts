import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionInstances } from '@/lib/schema';
import { listInstances, recordEvent, slugify } from '@/lib/evolution';
import { requireAdmin } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const rows = await listInstances();
    return NextResponse.json({ instances: rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[evolution][instances][GET] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  if (!name || name.length > 120) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  const internalUrl = String(body.internalUrl ?? '').trim();
  if (!internalUrl) {
    return NextResponse.json({ error: 'internal_url_required' }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(internalUrl)) {
    return NextResponse.json({ error: 'internal_url_invalid' }, { status: 400 });
  }

  const slug = slugify(typeof body.slug === 'string' && body.slug ? body.slug : name);

  try {
    const existing = await db
      .select({ id: evolutionInstances.id })
      .from(evolutionInstances)
      .where(eq(evolutionInstances.slug, slug))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'slug_taken' }, { status: 409 });
    }

    const [created] = await db
      .insert(evolutionInstances)
      .values({
        name,
        slug,
        internalUrl,
        publicUrl: typeof body.publicUrl === 'string' && body.publicUrl ? body.publicUrl : null,
        status: 'unknown',
        version: typeof body.version === 'string' && body.version ? body.version : null,
        region: typeof body.region === 'string' && body.region ? body.region : null,
        notes: typeof body.notes === 'string' && body.notes ? body.notes : null,
        metadata: {},
      })
      .returning();

    await recordEvent({
      eventType: 'instance.created',
      summary: `Instance "${name}" created`,
      actorEmail: auth.session?.email ?? null,
      instanceId: created.id,
      payload: { slug, internalUrl },
    });

    return NextResponse.json({ instance: created }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[evolution][instances][POST] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
