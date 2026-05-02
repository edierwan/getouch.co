import { evolutionFetch, type EvolutionResult } from '@/lib/evolution';
import { normalizeMyPhone } from '@/lib/phone';
import { evolutionSessions } from '@/lib/schema';

export const EVOLUTION_DEPENDENCY_FAILURE_STATUS = 424;

export type EvolutionQrPayload = {
  qrcode?: { code?: string; base64?: string; pairingCode?: string; count?: number };
  pairingCode?: string;
  base64?: string;
  code?: string;
  count?: number;
  instance?: { state?: string };
};

export type EvolutionConnectionStatePayload = {
  instance?: { state?: string };
};

export type EvolutionInstanceSummaryPayload = {
  name?: string;
  connectionStatus?: string;
  instance?: { instanceName?: string; state?: string };
};

export type EvolutionCreatePayload = EvolutionQrPayload & {
  instance?: { instanceName?: string; state?: string };
};

export type EvolutionBackendErrorPayload = {
  error?: string;
  response?: {
    message?: string[] | string;
    id?: string;
    key?: { id?: string };
  };
};

export function buildConnectPath(remoteId: string, phoneNumber?: string | null) {
  const basePath = `/instance/connect/${encodeURIComponent(remoteId)}`;
  return phoneNumber ? `${basePath}?number=${encodeURIComponent(phoneNumber)}` : basePath;
}

export function normalizeQrImage(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith('data:image')) return value;

  const compact = value.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return `data:image/png;base64,${compact}`;
  }

  return null;
}

export function normalizeQrPayload(data: EvolutionQrPayload | EvolutionCreatePayload | undefined) {
  const nested = data?.qrcode;
  return {
    qr: normalizeQrImage(nested?.base64 ?? data?.base64 ?? null),
    qrCode: nested?.code ?? data?.code ?? null,
    pairingCode: nested?.pairingCode ?? data?.pairingCode ?? null,
    qrCount: nested?.count ?? data?.count ?? null,
    state: data?.instance?.state ?? null,
  };
}

export function getBackendMessage(data: unknown) {
  const payload = data as EvolutionBackendErrorPayload | undefined;
  const message = payload?.response?.message;
  if (Array.isArray(message)) {
    return typeof message[0] === 'string' ? message[0] : null;
  }
  return typeof message === 'string' ? message : null;
}

export function isMissingRemoteInstance(data: unknown) {
  const message = getBackendMessage(data)?.toLowerCase() ?? '';
  return message.includes('does not exist') || (message.includes('instance') && message.includes('not found'));
}

export function isRemoteInstanceAlreadyPresent(data: unknown) {
  const message = getBackendMessage(data)?.toLowerCase() ?? '';
  return message.includes('already exists')
    || message.includes('already registered')
    || message.includes('already in use');
}

export function getRemoteIdCandidates(row: typeof evolutionSessions.$inferSelect) {
  const values = [
    row.evolutionRemoteId?.trim() || null,
    row.sessionName.trim() || null,
    row.sessionName.trim().toLowerCase() || null,
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(values));
}

export function getFailureDetail(input: {
  status: number;
  error: string | undefined;
  data: unknown;
  remoteId: string;
}) {
  const backendMessage = getBackendMessage(input.data);
  if (input.status === 0) return 'Evolution backend unreachable.';
  if (input.status === 401 || input.status === 403) return 'Evolution auth failed.';
  if (input.status === 404 || isMissingRemoteInstance(input.data)) {
    return `Evolution does not have a runtime session for "${input.remoteId}" yet.`;
  }
  if (backendMessage) return backendMessage;
  if (input.error === 'evolution_not_configured') return 'Evolution backend not configured.';
  return input.error ?? 'Unknown Evolution response.';
}

export function isRetryableTimeoutFailure(status: number, error: string | undefined) {
  return status === 0 && (error?.toLowerCase().includes('aborted') ?? false);
}

export function mapBackendStateToSessionStatus(state: string | null): typeof evolutionSessions.$inferInsert.status {
  switch (state) {
    case 'open':
      return 'connected';
    case 'connecting':
    case 'qr':
      return 'qr_pending';
    case 'close':
    case 'disconnected':
      return 'disconnected';
    case 'failed':
    case 'refused':
      return 'error';
    default:
      return 'qr_pending';
  }
}

export async function fetchConnectionState(remoteId: string): Promise<string | null> {
  const state = await evolutionFetch<EvolutionConnectionStatePayload>(
    `/instance/connectionState/${encodeURIComponent(remoteId)}`,
    { method: 'GET', timeoutMs: 5000 },
  );
  if (!state.ok) return null;
  return state.data?.instance?.state ?? null;
}

export async function probeInstanceState(remoteId: string): Promise<string | null> {
  const state = await fetchConnectionState(remoteId);
  if (state) return state;

  const instances = await evolutionFetch<EvolutionInstanceSummaryPayload[]>('/instance/fetchInstances', {
    method: 'GET',
    timeoutMs: 5000,
  });
  if (!instances.ok || !Array.isArray(instances.data)) return null;

  const match = instances.data.find((instance) => {
    const instanceName = instance.name ?? instance.instance?.instanceName;
    return instanceName === remoteId;
  });

  return match?.connectionStatus ?? match?.instance?.state ?? null;
}

export interface EnsureRemoteSessionResult {
  ok: boolean;
  status: number;
  remoteId: string;
  state: string | null;
  created: boolean;
  error?: string;
  data?: EvolutionCreatePayload | EvolutionInstanceSummaryPayload[];
}

export async function ensureRemoteSession(sessionName: string): Promise<EnsureRemoteSessionResult> {
  const expectedName = sessionName.trim();
  const instances = await evolutionFetch<EvolutionInstanceSummaryPayload[]>('/instance/fetchInstances', {
    method: 'GET',
    timeoutMs: 5000,
  });

  if (instances.ok && Array.isArray(instances.data)) {
    const existing = instances.data.find((instance) => {
      const instanceName = instance.name ?? instance.instance?.instanceName;
      return instanceName?.toLowerCase() === expectedName.toLowerCase();
    });

    if (existing) {
      return {
        ok: true,
        status: 200,
        remoteId: existing.name ?? existing.instance?.instanceName ?? expectedName,
        state: existing.connectionStatus ?? existing.instance?.state ?? null,
        created: false,
        data: instances.data,
      };
    }
  }

  const created = await evolutionFetch<EvolutionCreatePayload>('/instance/create', {
    method: 'POST',
    timeoutMs: 8000,
    body: JSON.stringify({
      instanceName: expectedName,
      qrcode: false,
      integration: 'WHATSAPP-BAILEYS',
    }),
  });

  if (created.ok) {
    return {
      ok: true,
      status: created.status,
      remoteId: created.data?.instance?.instanceName ?? expectedName,
      state: created.data?.instance?.state ?? null,
      created: true,
      data: created.data,
    };
  }

  if (created.status === 409 || isRemoteInstanceAlreadyPresent(created.data)) {
    return {
      ok: true,
      status: created.status,
      remoteId: expectedName,
      state: await probeInstanceState(expectedName),
      created: false,
      data: created.data,
    };
  }

  if (isRetryableTimeoutFailure(created.status, created.error)) {
    const state = await probeInstanceState(expectedName);
    if (state) {
      return {
        ok: true,
        status: 200,
        remoteId: expectedName,
        state,
        created: true,
      };
    }
  }

  return {
    ok: false,
    status: created.status,
    remoteId: expectedName,
    state: null,
    created: false,
    error: created.error,
    data: created.data,
  };
}

export async function resolveRemoteState(row: typeof evolutionSessions.$inferSelect) {
  for (const candidate of getRemoteIdCandidates(row)) {
    const state = await fetchConnectionState(candidate);
    if (state) {
      return { remoteId: candidate, state };
    }
  }

  return {
    remoteId: row.evolutionRemoteId ?? row.sessionName,
    state: null,
  };
}

export async function recoverTimedOutConnect(remoteId: string, phoneNumber?: string | null) {
  const state = await probeInstanceState(remoteId);
  if (!state) return null;

  const retry = await evolutionFetch<EvolutionQrPayload>(
    buildConnectPath(remoteId, phoneNumber),
    { method: 'GET', timeoutMs: 8000 },
  );
  if (retry.ok) return retry;

  return {
    ok: true,
    status: 200,
    data: {
      count: 0,
      instance: { state },
    },
  } satisfies EvolutionResult<EvolutionQrPayload>;
}

export function getDetailForState(input: {
  state: string | null;
  qr: string | null;
  qrCode: string | null;
  pairingCode: string | null;
  qrCount: number | null;
}) {
  if (input.qr || input.qrCode || input.pairingCode) return null;
  if (input.state === 'open') return 'Session is already connected.';
  if (input.state === 'connecting' || input.state === 'qr') {
    return input.qrCount === 0
      ? 'Session is connecting. Waiting for Evolution to emit QR...'
      : 'Waiting for Evolution to emit QR...';
  }
  if (input.state === 'close' || input.state === 'disconnected') {
    return 'Session is disconnected. Retry QR to request a new connection.';
  }
  if (input.state === 'failed' || input.state === 'refused') {
    return 'Evolution reported a failed connection state.';
  }
  return 'Backend did not return QR data.';
}

export function extractProviderMessageId(data: unknown): string | null {
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

function normalizePhoneCandidate(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = normalizeMyPhone(value.split('@')[0]?.replace(/[^0-9+]/g, '') ?? '');
  return normalized || null;
}

export function extractPairedNumber(data: unknown): string | null {
  const queue: unknown[] = [data];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;

    for (const key of ['phone', 'phoneNumber', 'number', 'owner', 'ownerJid', 'remoteJid', 'wid']) {
      const normalized = normalizePhoneCandidate(record[key]);
      if (normalized) return normalized;
    }

    for (const value of Object.values(record)) {
      if (Array.isArray(value) || (value && typeof value === 'object')) {
        queue.push(value);
      }
    }
  }

  return null;
}