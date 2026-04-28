import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionInstances, evolutionSessions } from '@/lib/schema';
import { evolutionFetch, listSessions, recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId') ?? undefined;
  const instanceId = url.searchParams.get('instanceId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  try {
    const rows = await listSessions({ tenantId, instanceId, status });
    return NextResponse.json({ sessions: rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[evolution][sessions][GET] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const sessionName = String(body.sessionName ?? '').trim();
  const instanceId = typeof body.instanceId === 'string' ? body.instanceId : null;
  const tenantId = typeof body.tenantId === 'string' && body.tenantId ? body.tenantId : null;
  if (!sessionName) return NextResponse.json({ error: 'session_name_required' }, { status: 400 });
  if (!instanceId) return NextResponse.json({ error: 'instance_required' }, { status: 400 });

  const [instance] = await db.select().from(evolutionInstances).where(eq(evolutionInstances.id, instanceId));
  if (!instance) return NextResponse.json({ error: 'instance_not_found' }, { status: 404 });

  // Try to register session on Evolution backend (best-effort).
  let evolutionRemoteId: string | null = null;
  let qrStatus: string | null = null;
  const remote = await evolutionFetch<{ instance?: { instanceName?: string }; qrcode?: { code?: string } }>(
    '/instance/create',
    {
      method: 'POST',
      body: JSON.stringify({
        instanceName: sessionName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
      timeoutMs: 8000,
    },
  );
  if (remote.ok) {
    evolutionRemoteId = remote.data?.instance?.instanceName ?? sessionName;
    qrStatus = remote.data?.qrcode?.code ? 'pending' : null;
  }

  try {
    const [created] = await db.insert(evolutionSessions).values({
      instanceId,
      tenantId,
      sessionName,
      phoneNumber: typeof body.phoneNumber === 'string' && body.phoneNumber ? body.phoneNumber : null,
      status: remote.ok ? 'qr_pending' : 'disconnected',
      qrStatus,
      evolutionRemoteId,
      metadata: { backendOk: remote.ok, backendStatus: remote.status },
    }).returning();

    await recordEvent({
      eventType: 'session.created',
      summary: `Session "${sessionName}" created`,
      actorEmail: auth.session?.email ?? null,
      instanceId, sessionId: created.id, tenantId,
      payload: { backendOk: remote.ok, backendStatus: remote.status },
    });

    return NextResponse.json({ session: created, backend: { ok: remote.ok, status: remote.status, error: remote.error } }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[evolution][sessions][POST] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
