import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionFetch, listMessages, recordEvent } from '@/lib/evolution';
import { evolutionMessageLogs, evolutionSessions } from '@/lib/schema';
import { normalizeMyPhone, samePhone } from '@/lib/phone';
import {
  EVOLUTION_DEPENDENCY_FAILURE_STATUS,
  extractProviderMessageId,
  fetchConnectionState,
  getFailureDetail,
  getRemoteIdCandidates,
} from '../../_shared';
import { requireAdmin } from '../../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

type EvolutionSendTextPayload = {
  key?: { id?: string };
  id?: string;
  messageId?: string;
  response?: { id?: string; key?: { id?: string } };
  message?: { key?: { id?: string } };
};

function isPortalTestLog(value: Record<string, unknown> | null | undefined) {
  return value?.source === 'portal_test';
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const [row] = await db.select().from(evolutionSessions).where(eq(evolutionSessions.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const results = (await listMessages({ sessionId: id, limit: 20 }))
    .filter((message) => message.direction === 'outbound' && isPortalTestLog(message.metadata))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((message) => ({
      id: message.id,
      status: message.status,
      recipient: message.toNumber,
      preview: message.preview,
      providerMessageId: message.providerMessageId,
      errorMessage: message.errorMessage,
      createdAt: message.createdAt,
    }));

  return NextResponse.json({ results });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: { recipientPhone?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const recipientPhone = normalizeMyPhone(String(body.recipientPhone ?? ''));
  const text = String(body.text ?? '').trim();

  if (!recipientPhone) {
    return NextResponse.json({ error: 'invalid_phone_number', detail: 'Enter a valid Malaysian phone number.' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: 'message_required', detail: 'Enter a message before sending.' }, { status: 400 });
  }

  const [row] = await db.select().from(evolutionSessions).where(eq(evolutionSessions.id, id));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (samePhone(recipientPhone, row.phoneNumber)) {
    return NextResponse.json({
      error: 'recipient_matches_session',
      detail: 'Choose a recipient different from the paired WhatsApp number.',
    }, { status: 400 });
  }

  let resolvedRemoteId = row.evolutionRemoteId ?? row.sessionName;
  let state: string | null = null;

  for (const candidate of getRemoteIdCandidates(row)) {
    const nextState = await fetchConnectionState(candidate);
    if (nextState) {
      resolvedRemoteId = candidate;
      state = nextState;
      break;
    }
  }

  if (state !== 'open') {
    return NextResponse.json({
      error: 'session_not_connected',
      detail: 'Connect this session before sending messages.',
    }, { status: 409 });
  }

  const sentAt = new Date();
  const response = await evolutionFetch<EvolutionSendTextPayload>(
    `/message/sendText/${encodeURIComponent(resolvedRemoteId)}`,
    {
      method: 'POST',
      timeoutMs: 10000,
      body: JSON.stringify({ number: recipientPhone, text }),
    },
  );

  if (response.ok) {
    const providerMessageId = extractProviderMessageId(response.data);
    const [created] = await db.insert(evolutionMessageLogs).values({
      tenantId: row.tenantId,
      instanceId: row.instanceId,
      sessionId: id,
      direction: 'outbound',
      toNumber: recipientPhone,
      fromNumber: row.phoneNumber,
      messageType: 'text',
      status: 'sent',
      providerMessageId,
      preview: text.slice(0, 280),
      metadata: {
        source: 'portal_test',
        remoteId: resolvedRemoteId,
      },
      createdAt: sentAt,
    }).returning();

    await db.update(evolutionSessions).set({
      lastMessageAt: sentAt,
      updatedAt: sentAt,
    }).where(eq(evolutionSessions.id, id));

    await recordEvent({
      eventType: 'session.test_message_sent',
      summary: `Test message sent from "${row.sessionName}"`,
      actorEmail: auth.session?.email ?? null,
      instanceId: row.instanceId,
      sessionId: id,
      tenantId: row.tenantId,
      payload: { recipientPhone, providerMessageId },
    });

    return NextResponse.json({
      ok: true,
      result: {
        id: created.id,
        status: created.status,
        recipient: created.toNumber,
        preview: created.preview,
        providerMessageId: created.providerMessageId,
        createdAt: created.createdAt,
      },
    });
  }

  const detail = getFailureDetail({
    status: response.status,
    error: response.error,
    data: response.data,
    remoteId: resolvedRemoteId,
  });
  const [created] = await db.insert(evolutionMessageLogs).values({
    tenantId: row.tenantId,
    instanceId: row.instanceId,
    sessionId: id,
    direction: 'outbound',
    toNumber: recipientPhone,
    fromNumber: row.phoneNumber,
    messageType: 'text',
    status: 'failed',
    providerMessageId: extractProviderMessageId(response.data),
    preview: text.slice(0, 280),
    errorCode: response.error ?? (response.status ? `http_${response.status}` : 'send_failed'),
    errorMessage: detail,
    metadata: {
      source: 'portal_test',
      remoteId: resolvedRemoteId,
      backendStatus: response.status,
    },
    createdAt: sentAt,
  }).returning();

  await recordEvent({
    eventType: 'session.test_message_failed',
    severity: 'warn',
    summary: `Test message failed for "${row.sessionName}"`,
    actorEmail: auth.session?.email ?? null,
    instanceId: row.instanceId,
    sessionId: id,
    tenantId: row.tenantId,
    payload: { recipientPhone, status: response.status },
  });

  return NextResponse.json({
    ok: false,
    status: response.status,
    error: response.error ?? 'backend_error',
    detail,
    result: {
      id: created.id,
      status: created.status,
      recipient: created.toNumber,
      preview: created.preview,
      providerMessageId: created.providerMessageId,
      errorMessage: created.errorMessage,
      createdAt: created.createdAt,
    },
  }, { status: response.status >= 400 && response.status < 500 ? response.status : EVOLUTION_DEPENDENCY_FAILURE_STATUS });
}