import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionInstances } from '@/lib/schema';
import { evolutionFetch, recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

const ACTIONS = new Set(['start', 'stop', 'restart', 'health']);

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

  const [row] = await db.select().from(evolutionInstances).where(eq(evolutionInstances.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Evolution backend doesn't have public start/stop endpoints — these are
  // container-level operations we don't expose via portal. We update DB
  // status and record an event, but the actual container action must be
  // done by ops (Coolify or compose). Health is a real probe.
  if (action === 'health') {
    const start = Date.now();
    const r = await evolutionFetch<unknown>('/', { method: 'GET', timeoutMs: 4000 });
    const ok = r.ok;
    const newStatus = ok ? 'active' : (row.status === 'maintenance' ? 'maintenance' : 'error');
    await db.update(evolutionInstances).set({
      lastHealthCheckAt: new Date(),
      lastHealthStatus: ok ? 'ok' : `http_${r.status}`,
      lastHealthMessage: r.error ?? null,
      status: newStatus,
      updatedAt: new Date(),
    }).where(eq(evolutionInstances.id, id));

    await recordEvent({
      eventType: 'instance.health_checked',
      summary: ok ? 'Health probe ok' : 'Health probe failed',
      severity: ok ? 'info' : 'warn',
      actorEmail: auth.session?.email ?? null,
      instanceId: id,
      payload: { status: r.status, latencyMs: Date.now() - start },
    });
    return NextResponse.json({ ok, status: r.status, latencyMs: Date.now() - start });
  }

  // start/stop/restart: record intent only. We do NOT exec docker/compose
  // from the portal — that's a hard security boundary.
  const newStatus = action === 'stop' ? 'stopped' : action === 'start' ? 'active' : row.status;
  await db.update(evolutionInstances).set({
    status: newStatus, updatedAt: new Date(),
  }).where(eq(evolutionInstances.id, id));

  await recordEvent({
    eventType: `instance.${action}_requested`,
    severity: 'warn',
    summary: `${action} requested for "${row.name}"`,
    actorEmail: auth.session?.email ?? null,
    instanceId: id,
  });

  return NextResponse.json({
    ok: true,
    status: newStatus,
    note: 'Recorded. Container-level start/stop must be performed by ops via Coolify/compose.',
  });
}
