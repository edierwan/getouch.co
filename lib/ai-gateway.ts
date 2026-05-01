import { createHash, randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';

export type GatewayBackendType = 'disabled' | 'vllm' | 'ollama';

type GatewayKeyRecord = {
  label: string;
  prefix: string;
  hash: string;
};

export type GatewayModelType = 'chat' | 'embedding';
export type GatewayModelStatus = 'active' | 'planned' | 'blocked';

type GatewayModelRecord = {
  alias: string;
  backendModel: string;
  type: GatewayModelType;
  status: GatewayModelStatus;
  notes?: string;
};

type GatewayConfig = {
  enabled: boolean;
  publicBaseUrl: string;
  docsUrl: string;
  allowedHosts: string[];
  keys: GatewayKeyRecord[];
  backendType: GatewayBackendType;
  backendBaseUrl: string | null;
  backendApiKey: string | null;
  timeoutMs: number;
  maxBodyBytes: number;
  maxTokens: number;
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;
  modelAliases: GatewayModelRecord[];
  adminTestKeyConfigured: boolean;
};

export type GatewayStatus = {
  checkedAt: string;
  publicBaseUrl: string;
  publicHealthUrl: string;
  publicReadyUrl: string;
  docsUrl: string;
  status: 'Not configured' | 'Ready' | 'Backend unavailable' | 'Active';
  enabled: boolean;
  backend: {
    type: GatewayBackendType;
    baseUrl: string | null;
    ready: boolean;
    message: string;
  };
  auth: {
    required: true;
    keyCount: number;
    adminTestKeyConfigured: boolean;
  };
  exposure: {
    publicGateway: true;
    backendPrivate: boolean;
    backendDirectPublicExposure: false;
  };
  limits: {
    maxBodyBytes: number;
    timeoutMs: number;
    maxTokens: number;
    rateLimitRequests: number;
    rateLimitWindowSeconds: number;
  };
  models: Array<{
    alias: string;
    backendModel: string;
    type: GatewayModelType;
    status: GatewayModelStatus;
    notes?: string;
  }>;
  reservedDomains: {
    litellm: string;
  };
};

type GatewayAuthResult = {
  ok: true;
  label: string;
  prefix: string;
  hash: string;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

type RequestAudit = {
  requestId: string;
  keyPrefix: string;
  model: string | null;
  stream: boolean;
  route: string;
};

type ParsedGatewayBody = {
  rawText: string;
  payload: Record<string, unknown>;
};

const rateLimitStore = new Map<string, RateLimitState>();

function asBoolean(value: string | undefined, fallback = false) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function asNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  const raw = (value || fallback).trim();
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function makePrefix(rawKey: string) {
  const trimmed = rawKey.trim();
  if (!trimmed) return 'gtai_unknown';
  return trimmed.slice(0, Math.min(trimmed.length, 12));
}

function parseGatewayKeys(raw: string | undefined) {
  return String(raw || '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map<GatewayKeyRecord | null>((entry, index) => {
      const labelSeparator = entry.indexOf('=');
      const defaultLabel = `Gateway Key ${index + 1}`;

      if (labelSeparator === -1) {
        return {
          label: defaultLabel,
          prefix: makePrefix(entry),
          hash: sha256(entry),
        };
      }

      const label = entry.slice(0, labelSeparator).trim() || defaultLabel;
      const secretValue = entry.slice(labelSeparator + 1).trim();
      if (!secretValue) return null;

      if (secretValue.startsWith('sha256:')) {
        return {
          label,
          prefix: makePrefix(label.toLowerCase().replace(/\s+/g, '_')),
          hash: secretValue.slice('sha256:'.length),
        };
      }

      return {
        label,
        prefix: makePrefix(secretValue),
        hash: sha256(secretValue),
      };
    })
    .filter((entry): entry is GatewayKeyRecord => Boolean(entry));
}

function defaultModelAliases(backendType: GatewayBackendType): GatewayModelRecord[] {
  // Primary planned vLLM chat model. Marked 'planned' until backend is up;
  // becomes effectively 'active' when probeGatewayBackend reports ready.
  const primary: GatewayModelRecord = backendType === 'ollama'
    ? { alias: 'getouch-qwen3-14b', backendModel: 'qwen3:14b', type: 'chat', status: 'active', notes: 'Ollama fallback' }
    : { alias: 'getouch-qwen3-14b', backendModel: 'Qwen/Qwen3-14B-FP8', type: 'chat', status: 'planned', notes: 'Primary vLLM chat target' };

  // Future targets recorded for portal visibility but NOT served by default.
  // Exact HF model IDs are pending verification; do not hardcode until tested.
  const future: GatewayModelRecord[] = [
    { alias: 'getouch-qwen3-30b', backendModel: 'pending-verified-hf-id', type: 'chat', status: 'blocked', notes: 'Future / blocked on current 16GB GPU unless validated' },
    { alias: 'getouch-embed', backendModel: 'pending-verified-hf-id', type: 'embedding', status: 'planned', notes: 'Future Nomic embedding alias — separate /v1/embeddings endpoint' },
  ];

  return [primary, ...future];
}

function parseModelAliases(raw: string | undefined, backendType: GatewayBackendType): GatewayModelRecord[] {
  // Format: alias=backendModel[:type[:status]]
  // type: chat (default) | embedding
  // status: active (default) | planned | blocked
  const entries = String(raw || '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map<GatewayModelRecord | null>((entry) => {
      const separator = entry.indexOf('=');
      if (separator === -1) return null;
      const alias = entry.slice(0, separator).trim();
      const rhs = entry.slice(separator + 1).trim();
      if (!alias || !rhs) return null;
      const parts = rhs.split(':');
      const backendModel = parts[0].trim();
      const rawType = (parts[1] || 'chat').trim().toLowerCase();
      const rawStatus = (parts[2] || 'active').trim().toLowerCase();
      const type: GatewayModelType = rawType === 'embedding' ? 'embedding' : 'chat';
      const status: GatewayModelStatus = rawStatus === 'planned' || rawStatus === 'blocked' ? rawStatus : 'active';
      return { alias, backendModel, type, status };
    })
    .filter((entry): entry is GatewayModelRecord => Boolean(entry));

  return entries.length ? entries : defaultModelAliases(backendType);
}

// Pick the first non-empty value among multiple env names, in order.
// Allows GETOUCH_VLLM_* (new, per 2026-04-27 plan) to override / co-exist
// with GETOUCH_AI_* (legacy). vllm.getouch.co is the active vLLM API
// domain; litellm.getouch.co is the canonical LiteLLM gateway endpoint.
function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

export function getGatewayConfig(): GatewayConfig {
  const enabled = asBoolean(
    firstEnv('GETOUCH_VLLM_GATEWAY_ENABLED', 'GETOUCH_AI_GATEWAY_ENABLED'),
    false,
  );
  const publicBaseUrl = normalizeBaseUrl(
    firstEnv('GETOUCH_VLLM_PUBLIC_BASE_URL', 'GETOUCH_AI_GATEWAY_PUBLIC_BASE_URL'),
    'https://vllm.getouch.co/v1',
  );
  const docsUrl = normalizeBaseUrl(
    firstEnv('GETOUCH_VLLM_GATEWAY_DOCS_URL', 'GETOUCH_AI_GATEWAY_DOCS_URL'),
    'https://portal.getouch.co/ai-services#ai-api-gateway-docs',
  );
  const backendTypeRaw = (firstEnv('GETOUCH_VLLM_BACKEND_TYPE', 'GETOUCH_AI_BACKEND_TYPE') || 'disabled').trim().toLowerCase() as GatewayBackendType;
  const safeBackendType: GatewayBackendType = ['disabled', 'vllm', 'ollama'].includes(backendTypeRaw) ? backendTypeRaw : 'disabled';
  const backendBaseUrl = firstEnv('GETOUCH_VLLM_BACKEND_BASE_URL', 'GETOUCH_AI_BACKEND_BASE_URL')?.trim()
    || (safeBackendType === 'ollama' ? 'http://ollama:11434' : null);

  return {
    enabled,
    publicBaseUrl,
    docsUrl,
    allowedHosts: String(
      firstEnv('GETOUCH_VLLM_GATEWAY_ALLOWED_HOSTS', 'GETOUCH_AI_GATEWAY_ALLOWED_HOSTS')
        || 'vllm.getouch.co,localhost,127.0.0.1',
    )
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    keys: parseGatewayKeys(firstEnv('GETOUCH_VLLM_GATEWAY_KEYS', 'GETOUCH_AI_GATEWAY_KEYS')),
    backendType: safeBackendType,
    backendBaseUrl,
    backendApiKey: firstEnv('GETOUCH_VLLM_BACKEND_API_KEY', 'GETOUCH_AI_BACKEND_API_KEY')?.trim() || null,
    timeoutMs: asNumber(firstEnv('GETOUCH_VLLM_GATEWAY_TIMEOUT_MS', 'GETOUCH_AI_GATEWAY_TIMEOUT_MS'), 120_000),
    maxBodyBytes: asNumber(firstEnv('GETOUCH_VLLM_GATEWAY_MAX_BODY_BYTES', 'GETOUCH_AI_GATEWAY_MAX_BODY_BYTES'), 1_000_000),
    maxTokens: asNumber(firstEnv('GETOUCH_VLLM_GATEWAY_MAX_TOKENS', 'GETOUCH_AI_GATEWAY_MAX_TOKENS'), 2048),
    rateLimitRequests: asNumber(firstEnv('GETOUCH_VLLM_GATEWAY_RATE_LIMIT_REQUESTS', 'GETOUCH_AI_GATEWAY_RATE_LIMIT_REQUESTS'), 30),
    rateLimitWindowSeconds: asNumber(firstEnv('GETOUCH_VLLM_GATEWAY_RATE_LIMIT_WINDOW_SECONDS', 'GETOUCH_AI_GATEWAY_RATE_LIMIT_WINDOW_SECONDS'), 60),
    modelAliases: parseModelAliases(
      firstEnv('GETOUCH_VLLM_GATEWAY_MODEL_ALIASES', 'GETOUCH_AI_GATEWAY_MODEL_ALIASES'),
      safeBackendType,
    ),
    adminTestKeyConfigured: Boolean(firstEnv('GETOUCH_VLLM_GATEWAY_ADMIN_TEST_KEY', 'GETOUCH_AI_GATEWAY_ADMIN_TEST_KEY')?.trim()),
  };
}

function getHostFromRequest(request: NextRequest | Request) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || '';
  return host.split(':')[0].trim().toLowerCase();
}

export function isGatewayHostAllowed(request: NextRequest | Request) {
  const config = getGatewayConfig();
  const host = getHostFromRequest(request);
  return config.allowedHosts.includes(host);
}

export function toSanitizedBackendUrl(value: string | null) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return value;
  }
}

async function probeGatewayBackend(config: GatewayConfig) {
  if (!config.enabled) {
    return { ready: false, message: 'Gateway is disabled by configuration.' };
  }

  if (config.keys.length === 0) {
    return { ready: false, message: 'No gateway API keys are configured.' };
  }

  if (config.backendType === 'disabled') {
    return { ready: false, message: 'AI backend is disabled.' };
  }

  if (!config.backendBaseUrl) {
    return { ready: false, message: 'AI backend base URL is not configured.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 5000));

    if (config.backendType === 'ollama') {
      const response = await fetch(`${config.backendBaseUrl.replace(/\/$/, '')}/api/tags`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      return {
        ready: response.ok,
        message: response.ok ? 'Ollama backend reachable.' : `Ollama backend responded with ${response.status}.`,
      };
    }

    const headers = new Headers();
    if (config.backendApiKey) {
      headers.set('Authorization', `Bearer ${config.backendApiKey}`);
    }

    const response = await fetch(`${config.backendBaseUrl.replace(/\/$/, '')}/models`, {
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    return {
      ready: response.ok,
      message: response.ok ? 'vLLM backend reachable.' : `vLLM backend responded with ${response.status}.`,
    };
  } catch (error) {
    return {
      ready: false,
      message: error instanceof Error ? error.message : 'Backend probe failed.',
    };
  }
}

export async function getGatewayStatus(): Promise<GatewayStatus> {
  const config = getGatewayConfig();
  const backend = await probeGatewayBackend(config);
  const status: GatewayStatus['status'] = !config.enabled || config.keys.length === 0
    ? 'Not configured'
    : backend.ready
      ? config.backendType === 'disabled'
        ? 'Ready'
        : 'Active'
      : 'Backend unavailable';

  return {
    checkedAt: new Date().toISOString(),
    publicBaseUrl: config.publicBaseUrl,
    publicHealthUrl: `${config.publicBaseUrl.replace(/\/v1$/, '')}/health`,
    publicReadyUrl: `${config.publicBaseUrl.replace(/\/v1$/, '')}/ready`,
    docsUrl: config.docsUrl,
    status,
    enabled: config.enabled,
    backend: {
      type: config.backendType,
      baseUrl: toSanitizedBackendUrl(config.backendBaseUrl),
      ready: backend.ready,
      message: backend.message,
    },
    auth: {
      required: true,
      keyCount: config.keys.length,
      adminTestKeyConfigured: config.adminTestKeyConfigured,
    },
    exposure: {
      publicGateway: true,
      backendPrivate: true,
      backendDirectPublicExposure: false,
    },
    limits: {
      maxBodyBytes: config.maxBodyBytes,
      timeoutMs: config.timeoutMs,
      maxTokens: config.maxTokens,
      rateLimitRequests: config.rateLimitRequests,
      rateLimitWindowSeconds: config.rateLimitWindowSeconds,
    },
    models: config.modelAliases.map((m) => ({ ...m })),
    reservedDomains: {
      litellm: 'https://litellm.getouch.co/v1',
    },
  };
}

export function createGatewayError(status: number, message: string, code: string, type = 'invalid_request_error') {
  return Response.json(
    {
      error: {
        message,
        type,
        param: null,
        code,
      },
    },
    { status }
  );
}

export function createGatewayJsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

export function assertGatewayHost(request: NextRequest | Request) {
  if (!isGatewayHostAllowed(request)) {
    return createGatewayError(404, 'Gateway route not found for this host.', 'gateway_host_not_allowed', 'not_found_error');
  }

  return null;
}

export function getRequestBearerToken(request: NextRequest | Request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function validateGatewayApiKey(rawKey: string): GatewayAuthResult | null {
  const config = getGatewayConfig();
  if (!rawKey) return null;
  const hash = sha256(rawKey);
  const match = config.keys.find((entry) => entry.hash === hash);
  if (!match) return null;
  return { ok: true, label: match.label, prefix: match.prefix, hash };
}

function applyRateLimit(hash: string) {
  const config = getGatewayConfig();
  const now = Date.now();
  const existing = rateLimitStore.get(hash);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(hash, {
      count: 1,
      resetAt: now + config.rateLimitWindowSeconds * 1000,
    });
    return null;
  }

  if (existing.count >= config.rateLimitRequests) {
    return {
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  rateLimitStore.set(hash, existing);
  return null;
}

export function authenticateGatewayRequest(request: NextRequest | Request) {
  const config = getGatewayConfig();
  const token = getRequestBearerToken(request);

  // Auth must be checked BEFORE backend availability so that an unauthenticated
  // probe cannot distinguish "backend not deployed" from "your key is invalid".
  // Spec: missing key → 401, invalid key → 401, backend unavailable → 503.
  if (!token) {
    return { error: createGatewayError(401, 'Missing API key.', 'missing_api_key', 'authentication_error') };
  }

  const validated = validateGatewayApiKey(token);
  if (!validated) {
    return { error: createGatewayError(401, 'Invalid API key.', 'invalid_api_key', 'authentication_error') };
  }

  if (!config.enabled) {
    return { error: createGatewayError(503, 'AI gateway is not enabled.', 'gateway_disabled', 'service_unavailable_error') };
  }

  const rateLimited = applyRateLimit(validated.hash);
  if (rateLimited) {
    return {
      error: createGatewayError(429, 'Rate limit exceeded for this API key.', 'rate_limit_exceeded', 'rate_limit_error'),
      retryAfterSeconds: rateLimited.retryAfterSeconds,
    };
  }

  return { auth: validated };
}

export async function parseGatewayJsonBody(request: NextRequest | Request): Promise<ParsedGatewayBody | Response> {
  const config = getGatewayConfig();
  const rawText = await request.text();
  const size = Buffer.byteLength(rawText, 'utf8');
  if (size > config.maxBodyBytes) {
    return createGatewayError(413, `Request body exceeds ${config.maxBodyBytes} bytes.`, 'request_too_large', 'invalid_request_error');
  }

  try {
    const payload = JSON.parse(rawText) as Record<string, unknown>;
    if (!payload || Array.isArray(payload)) {
      return createGatewayError(400, 'Request body must be a JSON object.', 'invalid_json_body');
    }

    return { rawText, payload };
  } catch {
    return createGatewayError(400, 'Invalid JSON body.', 'invalid_json_body');
  }
}

export function resolveGatewayModel(alias: string) {
  const config = getGatewayConfig();
  return config.modelAliases.find((entry) => entry.alias === alias) || null;
}

export function buildGatewayModelsResponse() {
  const config = getGatewayConfig();

  // Only expose aliases that are not 'blocked'. Blocked models exist in
  // the plan but must not be returned to clients until validated.
  return {
    object: 'list',
    data: config.modelAliases
      .filter((entry) => entry.status !== 'blocked')
      .map((entry) => ({
        id: entry.alias,
        object: 'model',
        created: 0,
        owned_by: 'getouch',
        type: entry.type,
      })),
  };
}

function normalizeContent(content: unknown) {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const typedPart = part as Record<string, unknown>;
        if (typedPart.type === 'text' || typedPart.type === 'input_text') {
          return String(typedPart.text || typedPart.content || '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function normalizeGatewayMessages(messages: unknown) {
  if (!Array.isArray(messages)) return null;

  const normalized = messages
    .map((message) => {
      if (!message || typeof message !== 'object') return null;
      const typedMessage = message as Record<string, unknown>;
      const role = String(typedMessage.role || '').trim();
      if (!role) return null;
      return {
        role,
        content: normalizeContent(typedMessage.content),
      };
    })
    .filter((message): message is { role: string; content: string } => Boolean(message));

  return normalized.length ? normalized : null;
}

function createOllamaUsage(payload: Record<string, unknown>) {
  const promptTokens = Number(payload.prompt_eval_count || 0);
  const completionTokens = Number(payload.eval_count || 0);
  return {
    prompt_tokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completion_tokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    total_tokens: (Number.isFinite(promptTokens) ? promptTokens : 0) + (Number.isFinite(completionTokens) ? completionTokens : 0),
  };
}

type OllamaPayloadResult =
  | { error: Response }
  | {
      payload: {
        model: string;
        stream: boolean;
        messages: Array<Record<string, unknown>>;
        options: {
          temperature: number | undefined;
          num_predict: number | undefined;
        };
      };
    };

function toOllamaPayload(body: Record<string, unknown>, backendModel: string): OllamaPayloadResult {
  const normalizedMessages = normalizeGatewayMessages(body.messages);
  if (!normalizedMessages) {
    return { error: createGatewayError(400, 'messages must be a non-empty array.', 'invalid_messages') };
  }

  const config = getGatewayConfig();
  const requestedMaxTokens = Number(body.max_tokens || 0);
  if (requestedMaxTokens > config.maxTokens) {
    return {
      error: createGatewayError(400, `max_tokens exceeds gateway cap of ${config.maxTokens}.`, 'max_tokens_exceeded'),
    };
  }

  return {
    payload: {
      model: backendModel,
      stream: Boolean(body.stream),
      messages: normalizedMessages,
      options: {
        temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
        num_predict: requestedMaxTokens || undefined,
      },
    },
  };
}

function createGatewayAudit(route: string, keyPrefix: string, body: Record<string, unknown>) {
  return {
    requestId: randomUUID(),
    keyPrefix,
    model: typeof body.model === 'string' ? body.model : null,
    stream: Boolean(body.stream),
    route,
  } satisfies RequestAudit;
}

function logGatewayEvent(event: 'request' | 'response' | 'error', audit: RequestAudit, details: Record<string, unknown>) {
  console.info(JSON.stringify({
    scope: 'ai-gateway',
    event,
    requestId: audit.requestId,
    keyPrefix: audit.keyPrefix,
    model: audit.model,
    stream: audit.stream,
    route: audit.route,
    ...details,
  }));
}

async function proxyToVllm(path: string, body: Record<string, unknown>): Promise<Response> {
  const config = getGatewayConfig();
  if (!config.backendBaseUrl) {
    return createGatewayError(503, 'AI backend is not ready.', 'backend_not_ready', 'service_unavailable_error');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (config.backendApiKey) {
    headers.set('Authorization', `Bearer ${config.backendApiKey}`);
  }

  try {
    const response = await fetch(`${config.backendBaseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return createGatewayError(response.status >= 500 ? 503 : response.status, text || 'AI backend request failed.', 'backend_error', 'service_unavailable_error');
    }

    const streamRequested = Boolean(body.stream);
    if (streamRequested && response.body) {
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Connection: 'keep-alive',
        },
      });
    }

    const json = await response.json();
    return createGatewayJsonResponse(json);
  } catch {
    return createGatewayError(503, 'AI backend is not ready.', 'backend_not_ready', 'service_unavailable_error');
  }
}

async function proxyToOllama(body: Record<string, unknown>, backendModel: string): Promise<Response> {
  const config = getGatewayConfig();
  if (!config.backendBaseUrl) {
    return createGatewayError(503, 'AI backend is not ready.', 'backend_not_ready', 'service_unavailable_error');
  }

  const ollamaBody = toOllamaPayload(body, backendModel);
  if ('error' in ollamaBody) {
    return ollamaBody.error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.backendBaseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaBody.payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      clearTimeout(timeout);
      const text = await response.text().catch(() => '');
      return createGatewayError(response.status >= 500 ? 503 : response.status, text || 'Ollama backend request failed.', 'backend_error', 'service_unavailable_error');
    }

    if (ollamaBody.payload.stream && response.body) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const created = Math.floor(Date.now() / 1000);
      const chunkId = `chatcmpl_${randomUUID().replace(/-/g, '')}`;

      const stream = new ReadableStream<Uint8Array>({
        async start(controllerStream) {
          const reader = response.body!.getReader();
          let buffer = '';

          const emit = (value: unknown) => {
            controllerStream.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
          };

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let boundaryIndex = buffer.indexOf('\n');
            while (boundaryIndex >= 0) {
              const rawLine = buffer.slice(0, boundaryIndex).trim();
              buffer = buffer.slice(boundaryIndex + 1);
              if (rawLine) {
                try {
                  const chunk = JSON.parse(rawLine) as Record<string, unknown>;
                  const content = String((chunk.message as Record<string, unknown> | undefined)?.content || '');
                  const isDone = Boolean(chunk.done);

                  emit({
                    id: chunkId,
                    object: 'chat.completion.chunk',
                    created,
                    model: String(body.model || ''),
                    choices: [{
                      index: 0,
                      delta: content ? { content } : {},
                      finish_reason: isDone ? String(chunk.done_reason || 'stop') : null,
                    }],
                  });

                  if (isDone) {
                    controllerStream.enqueue(encoder.encode('data: [DONE]\n\n'));
                  }
                } catch {
                  /* ignore malformed backend line */
                }
              }
              boundaryIndex = buffer.indexOf('\n');
            }
          }

          controllerStream.close();
        },
      });

      clearTimeout(timeout);
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Connection: 'keep-alive',
        },
      });
    }

    const json = await response.json() as Record<string, unknown>;
    clearTimeout(timeout);
    return createGatewayJsonResponse({
      id: `chatcmpl_${randomUUID().replace(/-/g, '')}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: String(body.model || ''),
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: String((json.message as Record<string, unknown> | undefined)?.content || ''),
        },
        finish_reason: String(json.done_reason || 'stop'),
      }],
      usage: createOllamaUsage(json),
    });
  } catch {
    return createGatewayError(503, 'AI backend is not ready.', 'backend_not_ready', 'service_unavailable_error');
  }
}

export async function handleGatewayChatCompletion(request: NextRequest | Request) {
  const hostError = assertGatewayHost(request);
  if (hostError) return hostError;

  const authResult = authenticateGatewayRequest(request);
  if ('error' in authResult) {
    return authResult.error;
  }

  const parsedBody = await parseGatewayJsonBody(request);
  if (parsedBody instanceof Response) {
    return parsedBody;
  }

  const modelAlias = typeof parsedBody.payload.model === 'string' ? parsedBody.payload.model : '';
  const resolvedModel = resolveGatewayModel(modelAlias);
  if (!resolvedModel) {
    return createGatewayError(400, 'Unknown model alias.', 'unknown_model');
  }
  if (resolvedModel.status === 'blocked') {
    return createGatewayError(400, `Model alias "${modelAlias}" is not currently available.`, 'model_blocked');
  }
  if (resolvedModel.type !== 'chat') {
    return createGatewayError(400, `Model alias "${modelAlias}" is not a chat model. Use /v1/embeddings for embedding aliases.`, 'wrong_model_type');
  }

  const audit = createGatewayAudit('/v1/chat/completions', authResult.auth.prefix, parsedBody.payload);
  logGatewayEvent('request', audit, { bodyBytes: Buffer.byteLength(parsedBody.rawText, 'utf8') });

  const config = getGatewayConfig();
  const backendProbe = await probeGatewayBackend(config);
  if (!backendProbe.ready) {
    logGatewayEvent('error', audit, { status: 503, message: backendProbe.message });
    return createGatewayError(503, 'AI backend is not ready.', 'backend_not_ready', 'service_unavailable_error');
  }

  const startedAt = Date.now();
  const response = config.backendType === 'vllm'
    ? await proxyToVllm('/chat/completions', { ...parsedBody.payload, model: resolvedModel.backendModel })
    : config.backendType === 'ollama'
      ? await proxyToOllama(parsedBody.payload, resolvedModel.backendModel)
      : createGatewayError(503, 'AI backend is not ready.', 'backend_not_ready', 'service_unavailable_error');

  logGatewayEvent(response.ok ? 'response' : 'error', audit, {
    status: response.status,
    durationMs: Date.now() - startedAt,
  });

  return response;
}

export async function handleGatewayModels(request: NextRequest | Request) {
  const hostError = assertGatewayHost(request);
  if (hostError) return hostError;

  const authResult = authenticateGatewayRequest(request);
  if ('error' in authResult) {
    return authResult.error;
  }

  logGatewayEvent('request', {
    requestId: randomUUID(),
    keyPrefix: authResult.auth.prefix,
    model: null,
    stream: false,
    route: '/v1/models',
  }, { bodyBytes: 0 });

  return createGatewayJsonResponse(buildGatewayModelsResponse());
}

/**
 * POST /v1/embeddings
 *
 * Foundation handler for embedding aliases (e.g. getouch-embed). Enforces
 * the same auth/host/body-size protections as chat completions and rejects
 * non-embedding aliases. Backend forwarding is intentionally not wired yet:
 * Nomic embedding HF model id is pending verification, so the handler
 * returns 503 once auth+routing checks pass. This is the correct posture
 * per Phase 4: do not pretend the backend is ready.
 */
export async function handleGatewayEmbeddings(request: NextRequest | Request) {
  const hostError = assertGatewayHost(request);
  if (hostError) return hostError;

  const authResult = authenticateGatewayRequest(request);
  if ('error' in authResult) {
    return authResult.error;
  }

  const parsedBody = await parseGatewayJsonBody(request);
  if (parsedBody instanceof Response) {
    return parsedBody;
  }

  const modelAlias = typeof parsedBody.payload.model === 'string' ? parsedBody.payload.model : '';
  const resolvedModel = resolveGatewayModel(modelAlias);
  if (!resolvedModel) {
    return createGatewayError(400, 'Unknown model alias.', 'unknown_model');
  }
  if (resolvedModel.status === 'blocked') {
    return createGatewayError(400, `Model alias "${modelAlias}" is not currently available.`, 'model_blocked');
  }
  if (resolvedModel.type !== 'embedding') {
    return createGatewayError(
      400,
      `Model alias "${modelAlias}" is not an embedding model. Use /v1/chat/completions for chat aliases.`,
      'wrong_model_type',
    );
  }

  const audit = createGatewayAudit('/v1/embeddings', authResult.auth.prefix, parsedBody.payload);
  logGatewayEvent('request', audit, { bodyBytes: Buffer.byteLength(parsedBody.rawText, 'utf8') });

  // Embedding backend wiring is pending verified HF model id.
  logGatewayEvent('error', audit, { status: 503, message: 'Embeddings backend pending verified model id.' });
  return createGatewayError(
    503,
    'Embedding backend is not configured.',
    'embeddings_backend_not_ready',
    'service_unavailable_error',
  );
}

export async function handleGatewayHealth(request: NextRequest | Request) {
  const hostError = assertGatewayHost(request);
  if (hostError) return hostError;

  const status = await getGatewayStatus();
  return createGatewayJsonResponse({
    ok: true,
    service: 'getouch-ai-gateway',
    checkedAt: status.checkedAt,
    enabled: status.enabled,
    status: status.status,
  });
}

export async function handleGatewayReady(request: NextRequest | Request) {
  const hostError = assertGatewayHost(request);
  if (hostError) return hostError;

  const status = await getGatewayStatus();
  const ok = status.enabled && status.auth.keyCount > 0 && status.backend.ready;
  return createGatewayJsonResponse({
    ok,
    checkedAt: status.checkedAt,
    backend: status.backend,
    models: status.models.map((entry) => entry.alias),
  }, { status: ok ? 200 : 503 });
}

export async function runGatewayHealthCheck() {
  return getGatewayStatus();
}

export function getGatewayKeyInventory() {
  const config = getGatewayConfig();
  return config.keys.map((entry) => ({
    label: entry.label,
    prefix: entry.prefix,
  }));
}

export function getGatewayAdminTestKey() {
  return process.env.GETOUCH_VLLM_GATEWAY_ADMIN_TEST_KEY?.trim()
    || process.env.GETOUCH_AI_GATEWAY_ADMIN_TEST_KEY?.trim()
    || null;
}

export async function runGatewayModelsTest() {
  const config = getGatewayConfig();
  const adminTestKey = getGatewayAdminTestKey();
  if (!config.adminTestKeyConfigured || !adminTestKey) {
    return {
      ok: false,
      message: 'Admin test key is not configured.',
      status: await getGatewayStatus(),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 8000));

  try {
    const response = await fetch(`${config.publicBaseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${adminTestKey}`,
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);

    return {
      ok: response.ok,
      statusCode: response.status,
      message: response.ok ? 'Authenticated models endpoint reachable.' : 'Authenticated models endpoint did not return success.',
      status: await getGatewayStatus(),
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Authenticated models test failed.',
      status: await getGatewayStatus(),
    };
  }
}