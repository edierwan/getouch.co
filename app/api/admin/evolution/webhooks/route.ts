import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionWebhooks } from '@/lib/schema';
import { generateWebhookSecret, listWebhooks, recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = [
  'message.received', 'message.sent', 'message.failed',
  'session.connected', 'session.disconnected', 'qr.updated',
];

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const rows = await listWebhooks();
  // Never return secret_hash
  const sanitized = rows.map(({ secretHash: _h, ...rest }) => rest);
  return NextResponse.json({ webhooks: sanitized, allowedEvents: ALLOWED_EVENTS });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const url = String(body.url ?? '').trim();
  if (!/^https?:\/\//i.test(url) || url.length > 2000) {
    return NextResponse.json({ error: 'url_invalid' }, { status: 400 });
  }
  const events = Array.isArray(body.events)
    ? (body.events as unknown[]).map(String).filter((e) => ALLOWED_EVENTS.includes(e))
    : [];
  if (events.length === 0) {
    return NextResponse.json({ error: 'events_required' }, { status: 400 });
  }

  const secret = generateWebhookSecret();
  const [created] = await db.insert(evolutionWebhooks).values({
    tenantId: typeof body.tenantId === 'string' && body.tenantId ? body.tenantId : null,
    instanceId: typeof body.instanceId === 'string' && body.instanceId ? body.instanceId : null,
    sessionId: typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : null,
    label: typeof body.label === 'string' ? body.label.slice(0, 120) : null,
    url, events, secretHash: secret.hash, secretPrefix: secret.prefix,
    status: 'active',
  }).returning();

  await recordEvent({
    eventType: 'webhook.created',
    summary: `Webhook created (${created.label ?? new URL(url).hostname})`,
    actorEmail: auth.session?.email ?? null,
    tenantId: created.tenantId, instanceId: created.instanceId, sessionId: created.sessionId,
  });

  // Plaintext secret returned ONCE.
  const { secretHash: _h, ...rest } = created;
  return NextResponse.json({ webhook: rest, secret: secret.plaintext }, { status: 201 });
}
