import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { normalizeMyPhone } from '@/lib/phone';
import { evolutionInstances, evolutionSessions, evolutionTenantBindings } from '@/lib/schema';
import { ensureDefaultEvolutionTenant, listSessions, recordEvent, slugify } from '@/lib/evolution';
import {
  ensureRemoteSession,
  extractPairedNumber,
  getFailureDetail,
  mapBackendStateToSessionStatus,
  EVOLUTION_DEPENDENCY_FAILURE_STATUS,
} from './_shared';
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

  const rawSessionName = String(body.sessionName ?? '').trim();
  const sessionName = slugify(rawSessionName).slice(0, 120);
  const instanceId = typeof body.instanceId === 'string' ? body.instanceId : null;
  const requestedTenantId = typeof body.tenantId === 'string' && body.tenantId ? body.tenantId : null;
  const connectMethod = String(body.connectMethod ?? 'qr').toLowerCase();
  const rawPhoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
  const phoneNumber = rawPhoneNumber ? normalizeMyPhone(rawPhoneNumber) : null;

  if (!rawSessionName || !sessionName) return NextResponse.json({ error: 'session_name_required' }, { status: 400 });
  if (!instanceId) return NextResponse.json({ error: 'instance_required' }, { status: 400 });
  if (connectMethod !== 'qr' && connectMethod !== 'pairing') {
    return NextResponse.json({ error: 'connect_method_invalid' }, { status: 400 });
  }
  if (rawPhoneNumber && !phoneNumber) {
    return NextResponse.json({ error: 'invalid_phone_number', detail: 'Enter a valid Malaysian phone number.' }, { status: 400 });
  }
  if (connectMethod === 'pairing' && !phoneNumber) {
    return NextResponse.json({ error: 'phone_required_for_pairing', detail: 'Pairing code sessions need a phone number.' }, { status: 400 });
  }

  const [instance] = await db.select().from(evolutionInstances).where(eq(evolutionInstances.id, instanceId));
  if (!instance) return NextResponse.json({ error: 'instance_not_found' }, { status: 404 });

  const [existingLocalSession] = await db.select({ id: evolutionSessions.id })
    .from(evolutionSessions)
    .where(and(eq(evolutionSessions.instanceId, instanceId), eq(evolutionSessions.sessionName, sessionName)))
    .limit(1);
  if (existingLocalSession) {
    return NextResponse.json({ error: 'session_name_taken', detail: 'Choose a different session name for this gateway.' }, { status: 409 });
  }

  const tenant = requestedTenantId
    ? (await db.select().from(evolutionTenantBindings).where(eq(evolutionTenantBindings.tenantId, requestedTenantId)).limit(1))[0] ?? null
    : await ensureDefaultEvolutionTenant();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const remote = await ensureRemoteSession(sessionName);
  if (!remote.ok) {
    return NextResponse.json({
      error: 'backend_session_create_failed',
      detail: getFailureDetail({
        status: remote.status,
        error: remote.error,
        data: remote.data,
        remoteId: sessionName,
      }),
    }, { status: EVOLUTION_DEPENDENCY_FAILURE_STATUS });
  }

  const sessionStatus = remote.state ? mapBackendStateToSessionStatus(remote.state) : 'disconnected';
  const pairedNumber = extractPairedNumber(remote.data) ?? (sessionStatus === 'connected' ? phoneNumber : null);
  const createdAt = new Date();

  try {
    const [created] = await db.insert(evolutionSessions).values({
      instanceId,
      tenantId: tenant.tenantId,
      sessionName,
      phoneNumber,
      pairedNumber,
      status: sessionStatus,
      qrStatus: sessionStatus === 'connected' ? 'connected' : null,
      evolutionRemoteId: remote.remoteId,
      metadata: {
        backendOk: true,
        backendStatus: remote.status,
        connectMethod,
        remoteCreated: remote.created,
      },
      lastConnectedAt: sessionStatus === 'connected' ? createdAt : null,
      createdAt,
      updatedAt: createdAt,
    }).returning();

    if (!tenant.defaultSessionId) {
      await db.update(evolutionTenantBindings).set({
        defaultSessionId: created.id,
        updatedAt: createdAt,
      }).where(eq(evolutionTenantBindings.id, tenant.id));
    }

    await recordEvent({
      eventType: 'session.created',
      summary: `Session "${sessionName}" created`,
      actorEmail: auth.session?.email ?? null,
      instanceId,
      sessionId: created.id,
      tenantId: tenant.tenantId,
      payload: {
        backendStatus: remote.status,
        connectMethod,
        remoteCreated: remote.created,
      },
    });

    return NextResponse.json({
      session: created,
      backend: {
        ok: true,
        status: remote.status,
        remoteCreated: remote.created,
      },
      nextAction: connectMethod === 'pairing' ? 'pairing_code' : 'connect_qr',
    }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[evolution][sessions][POST] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
