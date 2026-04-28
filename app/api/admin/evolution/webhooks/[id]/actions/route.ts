import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionWebhooks } from '@/lib/schema';
import { generateWebhookSecret, recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }
const ACTIONS = new Set(['test', 'rotate-secret']);

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: { action?: string };
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body.action ?? '').toLowerCase();
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: 'invalid_action', allowed: Array.from(ACTIONS) }, { status: 400 });
  }

  const [row] = await db.select().from(evolutionWebhooks).where(eq(evolutionWebhooks.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (action === 'test') {
    const start = Date.now();
    let ok = false; let status = 0; let err: string | undefined;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(row.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Evolution-Test': 'true' },
        body: JSON.stringify({ event: 'webhook.test', sentAt: new Date().toISOString() }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      status = res.status;
      ok = res.ok;
    } catch (e) {
      err = (e as Error).message?.slice(0, 200);
    }

    await db.update(evolutionWebhooks).set({
      lastDeliveryAt: new Date(),
      lastDeliveryStatus: status,
      lastError: ok ? null : (err ?? `HTTP ${status}`),
      deliveryCount: (row.deliveryCount ?? 0) + 1,
      failureCount: (row.failureCount ?? 0) + (ok ? 0 : 1),
      updatedAt: new Date(),
    }).where(eq(evolutionWebhooks.id, id));

    await recordEvent({
      eventType: 'webhook.tested',
      summary: ok ? 'Webhook test ok' : 'Webhook test failed',
      severity: ok ? 'info' : 'warn',
      actorEmail: auth.session?.email ?? null,
      tenantId: row.tenantId, instanceId: row.instanceId, sessionId: row.sessionId,
      payload: { status, latencyMs: Date.now() - start },
    });

    return NextResponse.json({ ok, status, latencyMs: Date.now() - start, error: err });
  }

  // rotate-secret
  const secret = generateWebhookSecret();
  await db.update(evolutionWebhooks).set({
    secretHash: secret.hash, secretPrefix: secret.prefix, updatedAt: new Date(),
  }).where(eq(evolutionWebhooks.id, id));

  await recordEvent({
    eventType: 'webhook.secret_rotated', severity: 'warn',
    summary: 'Webhook secret rotated',
    actorEmail: auth.session?.email ?? null,
    tenantId: row.tenantId, instanceId: row.instanceId, sessionId: row.sessionId,
  });

  return NextResponse.json({ ok: true, secret: secret.plaintext, prefix: secret.prefix });
}
