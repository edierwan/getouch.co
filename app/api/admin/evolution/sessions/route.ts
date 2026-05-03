import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { normalizeMyPhone } from '@/lib/phone';
import { evolutionInstances, evolutionSessions, evolutionTenantBindings } from '@/lib/schema';
import {
  ensureDefaultEvolutionTenant,
  listSessions,
  normalizeEvolutionSessionPurpose,
  recordEvent,
} from '@/lib/evolution';
import {
  ensureControlPlaneSession,
  getFailureDetail,
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

  const rawSessionName = typeof body.sessionName === 'string' ? body.sessionName.trim() : '';
  const displayLabel = typeof body.displayLabel === 'string' ? body.displayLabel.trim() : '';
  const requestedInstanceId = typeof body.instanceId === 'string' && body.instanceId ? body.instanceId : null;
  const requestedTenantId = typeof body.tenantId === 'string' && body.tenantId ? body.tenantId : null;
  const purpose = normalizeEvolutionSessionPurpose(body.purpose ?? 'system');
  const connectMethod = String(body.connectMethod ?? 'qr').toLowerCase();
  const rawPhoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
  const phoneNumber = rawPhoneNumber ? normalizeMyPhone(rawPhoneNumber) : null;
  const reuseExisting = Boolean(body.reuseExisting ?? purpose === 'system');
  const isDefault = typeof body.isDefault === 'boolean' ? body.isDefault : purpose === 'system';
  const botEnabled = typeof body.botEnabled === 'boolean' ? body.botEnabled : true;
  const humanHandoffEnabled = typeof body.humanHandoffEnabled === 'boolean' ? body.humanHandoffEnabled : true;
  const sourceApp = typeof body.sourceApp === 'string' && body.sourceApp ? body.sourceApp.slice(0, 40) : null;

  if (connectMethod !== 'qr' && connectMethod !== 'pairing') {
    return NextResponse.json({ error: 'connect_method_invalid' }, { status: 400 });
  }
  if (rawPhoneNumber && !phoneNumber) {
    return NextResponse.json({ error: 'invalid_phone_number', detail: 'Enter a valid Malaysian phone number.' }, { status: 400 });
  }
  if (connectMethod === 'pairing' && !phoneNumber) {
    return NextResponse.json({ error: 'phone_required_for_pairing', detail: 'Pairing code sessions need a phone number.' }, { status: 400 });
  }

  const instance = requestedInstanceId
    ? (await db.select().from(evolutionInstances).where(eq(evolutionInstances.id, requestedInstanceId)).limit(1))[0] ?? null
    : null;
  const resolvedInstance = instance ?? (() => null)();

  let selectedInstance = resolvedInstance;
  if (!selectedInstance) {
    const gateways = await db.select().from(evolutionInstances).limit(20);
    selectedInstance = gateways.find((gateway) => gateway.status === 'active') ?? gateways[0] ?? null;
  }

  if (!selectedInstance && requestedInstanceId) return NextResponse.json({ error: 'instance_not_found' }, { status: 404 });
  if (!selectedInstance) return NextResponse.json({ error: 'instance_required' }, { status: 400 });

  const instanceId = selectedInstance.id;

  const [requestedTenant] = requestedTenantId
    ? await db.select().from(evolutionTenantBindings).where(eq(evolutionTenantBindings.tenantId, requestedTenantId)).limit(1)
    : [];

  const tenant = requestedTenantId
    ? requestedTenant ?? null
    : await ensureDefaultEvolutionTenant();
  if (!tenant) return NextResponse.json({ error: requestedTenantId ? 'tenant_not_found' : 'default_tenant_missing' }, { status: requestedTenantId ? 404 : 500 });

  const ensured = await ensureControlPlaneSession({
    instance: selectedInstance,
    tenant,
    sessionName: rawSessionName || null,
    displayLabel: displayLabel || null,
    purpose,
    phoneNumber,
    reuseExisting,
    isDefault,
    botEnabled,
    humanHandoffEnabled,
    sourceApp,
  });

  if (!ensured.ok) {
    if (ensured.conflict) {
      return NextResponse.json({
        error: 'session_name_taken',
        detail: 'Choose a different session name for this gateway.',
        session: ensured.existingSession ?? null,
      }, { status: 409 });
    }

    return NextResponse.json({
      error: 'backend_session_create_failed',
      detail: getFailureDetail({
        status: ensured.status,
        error: ensured.error,
        data: ensured.data,
        remoteId: ensured.remoteId,
      }),
    }, { status: EVOLUTION_DEPENDENCY_FAILURE_STATUS });
  }

  await recordEvent({
    eventType: ensured.reused ? 'session.reused' : 'session.created',
    summary: `${ensured.reused ? 'Session reused' : 'Session created'} for "${ensured.session.displayLabel ?? ensured.session.sessionName}"`,
    actorEmail: auth.session?.email ?? null,
    instanceId: ensured.session.instanceId,
    sessionId: ensured.session.id,
    tenantId: ensured.session.tenantId,
    payload: {
      purpose: ensured.session.purpose,
      connectMethod,
      reused: ensured.reused,
      remoteCreated: ensured.remoteCreated,
      backendStatus: ensured.remoteStatus,
    },
  });

  return NextResponse.json({
    session: ensured.session,
    backend: {
      ok: true,
      status: ensured.remoteStatus,
      remoteCreated: ensured.remoteCreated,
    },
    created: ensured.created,
    reused: ensured.reused,
    nextAction: connectMethod === 'pairing' ? 'pairing_code' : 'connect_qr',
  }, { status: ensured.created ? 201 : 200 });
}
