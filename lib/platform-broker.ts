import { and, desc, eq, or } from 'drizzle-orm';
import { db } from './db';
import {
  evolutionFetch,
  getEvolutionConfig,
  getPrimarySystemSession,
  recordEvent,
  syncSessionsFromEvolution,
} from './evolution';
import { normalizeMyPhone } from './phone';
import { validatePlatformAppKey } from './platform-app-keys';
import { evolutionMessageLogs, evolutionSessions } from './schema';

type JsonRecord = Record<string, unknown>;

export const PLATFORM_BROKER_API_BASE_PATH = '/api/platform';
export const PLATFORM_BROKER_SYSTEM_SESSION_NAME = 'wapi-evo-system';
export const PLATFORM_BROKER_PROVIDER = 'evolution';
export const PLATFORM_BROKER_DEPENDENCY_FAILURE_STATUS = 424;

type PlatformBrokerScope = 'platform:auth' | 'platform:whatsapp' | 'platform:ai';

interface EvolutionSendTextPayload {
  key?: { id?: string };
  id?: string;
  messageId?: string;
  response?: { id?: string; key?: { id?: string } };
  message?: { key?: { id?: string } };
}

function getPlatformBrokerKeyFromHeaders(headers: Headers): string | null {
  const explicitKey = headers.get('x-platform-app-key')?.trim();
  if (explicitKey) return explicitKey;

  const authorization = headers.get('authorization')?.trim();
  if (!authorization?.toLowerCase().startsWith('bearer ')) return null;

  const bearerToken = authorization.slice(7).trim();
  return bearerToken || null;
}

function hasPlatformBrokerScope(scopes: string[], requiredScope: PlatformBrokerScope): boolean {
  if (scopes.includes('*')) return true;
  if (scopes.includes(requiredScope)) return true;

  const [scopePrefix] = requiredScope.split(':');
  return scopes.includes(`${scopePrefix}:*`) || scopes.includes('platform:*');
}

export async function authorizePlatformAppKey(plaintext: string, requiredScope: PlatformBrokerScope) {
  const key = plaintext.trim();
  if (!key) {
    return {
      ok: false as const,
      status: 401,
      error: 'missing_platform_app_key',
      message: 'Platform App Key required.',
    };
  }

  const match = await validatePlatformAppKey(key);
  if (!match) {
    return {
      ok: false as const,
      status: 401,
      error: 'invalid_platform_app_key',
      message: 'Invalid Platform App Key.',
    };
  }

  const scopes = Array.isArray(match.key.scopes) ? match.key.scopes : [];
  if (!hasPlatformBrokerScope(scopes, requiredScope)) {
    return {
      ok: false as const,
      status: 403,
      error: 'insufficient_scope',
      message: 'Platform App Key does not allow this broker action.',
    };
  }

  return {
    ok: true as const,
    app: match.app,
    key: match.key,
    scopes,
  };
}

export async function authorizePlatformAppRequest(headers: Headers, requiredScope: PlatformBrokerScope) {
  const plaintext = getPlatformBrokerKeyFromHeaders(headers);
  if (!plaintext) {
    return {
      ok: false as const,
      status: 401,
      error: 'missing_platform_app_key',
      message: 'Platform App Key required.',
    };
  }

  return authorizePlatformAppKey(plaintext, requiredScope);
}

function getBackendMessage(data: unknown): string | null {
  const queue: unknown[] = [data];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;

    const response = record.response;
    if (response && typeof response === 'object') {
      const responseRecord = response as Record<string, unknown>;
      const message = responseRecord.message;
      if (typeof message === 'string' && message.trim()) return message.trim();
      if (Array.isArray(message) && typeof message[0] === 'string' && message[0].trim()) {
        return message[0].trim();
      }
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return null;
}

function getBrokerFailureDetail(input: {
  status: number;
  error?: string;
  data?: unknown;
  remoteId: string;
}) {
  const backendMessage = getBackendMessage(input.data);
  if (backendMessage) return backendMessage;
  if (input.status === 0) return 'Evolution backend unreachable.';
  if (input.status === 401 || input.status === 403) return 'Evolution auth failed.';
  if (input.status === 404) {
    return `Evolution does not have a runtime session for "${input.remoteId}" yet.`;
  }
  if (input.error === 'evolution_not_configured') return 'Evolution backend not configured.';
  return input.error ?? 'Unknown Evolution response.';
}

function extractProviderMessageId(data: unknown): string | null {
  const queue: unknown[] = [data];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;

    for (const key of ['id', 'messageId', 'message_id', 'keyId', 'key_id']) {
      if (typeof record[key] === 'string') return record[key] as string;
    }

    if (record.key && typeof record.key === 'object') {
      const keyRecord = record.key as Record<string, unknown>;
      if (typeof keyRecord.id === 'string') return keyRecord.id;
      queue.push(record.key);
    }

    for (const key of ['data', 'message', 'response', 'result']) {
      if (record[key] && typeof record[key] === 'object') queue.push(record[key]);
    }
  }

  return null;
}

export async function getPlatformBrokerSenderStatus() {
  const config = getEvolutionConfig();
  if (!config.configured) {
    return {
      provider: PLATFORM_BROKER_PROVIDER,
      instance: PLATFORM_BROKER_SYSTEM_SESSION_NAME,
      status: 'not_configured' as const,
      displayLabel: null,
      pairedNumber: null,
      sessionId: null,
      connected: false,
    };
  }

  const [preferredRow] = await db
    .select()
    .from(evolutionSessions)
    .where(and(
      eq(evolutionSessions.purpose, 'system'),
      or(
        eq(evolutionSessions.sessionName, PLATFORM_BROKER_SYSTEM_SESSION_NAME),
        eq(evolutionSessions.evolutionRemoteId, PLATFORM_BROKER_SYSTEM_SESSION_NAME),
      ),
    ))
    .orderBy(desc(evolutionSessions.updatedAt))
    .limit(1);

  if (preferredRow) {
    const syncedRows = await syncSessionsFromEvolution([preferredRow]);
    const synced = syncedRows[0] ?? preferredRow;
    return {
      provider: PLATFORM_BROKER_PROVIDER,
      instance: PLATFORM_BROKER_SYSTEM_SESSION_NAME,
      status: synced.status,
      displayLabel: synced.displayLabel,
      pairedNumber: synced.pairedNumber ?? synced.phoneNumber ?? null,
      sessionId: synced.id,
      connected: synced.status === 'connected',
    };
  }

  const primary = await getPrimarySystemSession();
  if (!primary) {
    return {
      provider: PLATFORM_BROKER_PROVIDER,
      instance: PLATFORM_BROKER_SYSTEM_SESSION_NAME,
      status: 'missing' as const,
      displayLabel: null,
      pairedNumber: null,
      sessionId: null,
      connected: false,
    };
  }

  return {
    provider: PLATFORM_BROKER_PROVIDER,
    instance: PLATFORM_BROKER_SYSTEM_SESSION_NAME,
    status: primary.status,
    displayLabel: primary.displayLabel,
    pairedNumber: primary.pairedNumber ?? primary.phoneNumber ?? null,
    sessionId: primary.id,
    connected: primary.status === 'connected',
  };
}

export async function sendPlatformBrokerTextMessage(input: {
  appCode: string;
  to: string;
  text: string;
  preview: string;
  eventType: string;
  eventSummary: string;
  metadata?: JsonRecord;
  messagePurpose: 'platform_message' | 'otp';
}) {
  const normalizedPhone = normalizeMyPhone(input.to);
  if (!normalizedPhone) {
    return {
      ok: false as const,
      status: 400,
      error: 'invalid_phone_number',
      detail: 'Enter a valid Malaysian phone number.',
    };
  }

  const sender = await getPlatformBrokerSenderStatus();
  if (!sender.sessionId) {
    return {
      ok: false as const,
      status: PLATFORM_BROKER_DEPENDENCY_FAILURE_STATUS,
      error: 'platform_sender_missing',
      detail: 'Evolution system sender is not configured.',
      sender,
    };
  }
  if (!sender.connected) {
    return {
      ok: false as const,
      status: 409,
      error: 'platform_sender_not_connected',
      detail: 'Evolution system sender is not connected.',
      sender,
    };
  }

  const [session] = await db
    .select()
    .from(evolutionSessions)
    .where(eq(evolutionSessions.id, sender.sessionId))
    .limit(1);

  if (!session) {
    return {
      ok: false as const,
      status: PLATFORM_BROKER_DEPENDENCY_FAILURE_STATUS,
      error: 'platform_sender_missing',
      detail: 'Evolution system sender is unavailable.',
      sender,
    };
  }

  const remoteId = session.evolutionRemoteId ?? session.sessionName;
  const sentAt = new Date();
  const response = await evolutionFetch<EvolutionSendTextPayload>(
    `/message/sendText/${encodeURIComponent(remoteId)}`,
    {
      method: 'POST',
      timeoutMs: 10000,
      body: JSON.stringify({ number: normalizedPhone, text: input.text }),
    },
  );

  if (response.ok) {
    const providerMessageId = extractProviderMessageId(response.data);
    await db.insert(evolutionMessageLogs).values({
      tenantId: session.tenantId,
      instanceId: session.instanceId,
      sessionId: session.id,
      direction: 'outbound',
      toNumber: normalizedPhone,
      fromNumber: session.pairedNumber ?? session.phoneNumber,
      messageType: 'text',
      status: 'sent',
      providerMessageId,
      preview: input.preview.slice(0, 280),
      metadata: {
        source: 'platform_broker',
        appCode: input.appCode,
        brokerInstance: PLATFORM_BROKER_SYSTEM_SESSION_NAME,
        remoteId,
        messagePurpose: input.messagePurpose,
        ...(input.metadata ?? {}),
      },
      createdAt: sentAt,
    });

    await db.update(evolutionSessions).set({
      lastMessageAt: sentAt,
      updatedAt: sentAt,
    }).where(eq(evolutionSessions.id, session.id));

    await recordEvent({
      eventType: input.eventType,
      summary: input.eventSummary,
      tenantId: session.tenantId,
      instanceId: session.instanceId,
      sessionId: session.id,
      payload: {
        appCode: input.appCode,
        to: normalizedPhone,
        providerMessageId,
        brokerInstance: PLATFORM_BROKER_SYSTEM_SESSION_NAME,
      },
    });

    return {
      ok: true as const,
      status: 200,
      provider: PLATFORM_BROKER_PROVIDER,
      instance: PLATFORM_BROKER_SYSTEM_SESSION_NAME,
      to: normalizedPhone,
      messageId: providerMessageId,
    };
  }

  const detail = getBrokerFailureDetail({
    status: response.status,
    error: response.error,
    data: response.data,
    remoteId,
  });

  await db.insert(evolutionMessageLogs).values({
    tenantId: session.tenantId,
    instanceId: session.instanceId,
    sessionId: session.id,
    direction: 'outbound',
    toNumber: normalizedPhone,
    fromNumber: session.pairedNumber ?? session.phoneNumber,
    messageType: 'text',
    status: 'failed',
    providerMessageId: extractProviderMessageId(response.data),
    preview: input.preview.slice(0, 280),
    errorCode: response.error ?? (response.status ? `http_${response.status}` : 'send_failed'),
    errorMessage: detail,
    metadata: {
      source: 'platform_broker',
      appCode: input.appCode,
      brokerInstance: PLATFORM_BROKER_SYSTEM_SESSION_NAME,
      remoteId,
      messagePurpose: input.messagePurpose,
      ...(input.metadata ?? {}),
    },
    createdAt: sentAt,
  });

  await recordEvent({
    eventType: `${input.eventType}.failed`,
    severity: 'warn',
    summary: `${input.eventSummary} failed`,
    tenantId: session.tenantId,
    instanceId: session.instanceId,
    sessionId: session.id,
    payload: {
      appCode: input.appCode,
      to: normalizedPhone,
      brokerInstance: PLATFORM_BROKER_SYSTEM_SESSION_NAME,
      status: response.status,
    },
  });

  return {
    ok: false as const,
    status: response.status >= 400 && response.status < 500
      ? response.status
      : PLATFORM_BROKER_DEPENDENCY_FAILURE_STATUS,
    error: response.error ?? 'platform_send_failed',
    detail,
    sender,
  };
}