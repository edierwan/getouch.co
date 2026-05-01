import crypto from 'node:crypto';
import { and, desc, eq, sql as dsql } from 'drizzle-orm';
import { db } from './db';
import {
  apiKeys,
  apiKeyAuditLogs,
  apiKeyUsageLogs,
} from './schema';

export type GeneratedKey = {
  plaintext: string;
  prefix: string;
  hash: string;
  hashAlgorithm: 'hmac-sha256';
  hashVersion: 1;
  pepperVersion: 1;
};

export type ApiKeyEnvironment = 'live' | 'test';
export type ApiKeyStatus = 'active' | 'disabled' | 'revoked' | 'rotating' | 'expired';

const PREFIX_PUBLIC_LEN = 8; // chars after `gtc_<env>_` shown in UI
const RAW_BYTES = 24; // 24 random bytes -> 32-char base64url
export const CENTRAL_API_KEY_HASH_ALGORITHM = 'hmac-sha256' as const;
export const CENTRAL_API_KEY_HASH_VERSION = 1 as const;
export const CENTRAL_API_KEY_PEPPER_VERSION = 1 as const;

function randomBase64Url(bytes = RAW_BYTES): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Resolve the pepper used for central API key HMAC.
 *
 * Order of precedence:
 *   1. CENTRAL_API_KEY_PEPPER  (dedicated, preferred)
 *   2. AUTH_SECRET             (legacy fallback — DEPRECATED for key hashing)
 *
 * AUTH_SECRET is for app/session auth only. Rotating AUTH_SECRET MUST NOT
 * invalidate central API keys. The fallback exists only for backward
 * compatibility with keys minted before this change; new deployments must
 * set CENTRAL_API_KEY_PEPPER and remove the fallback by leaving AUTH_SECRET
 * unrelated to key hashing.
 */
function resolvePepper(): { pepper: string; source: 'central' | 'auth_secret_legacy' | 'dev_default' } {
  const central = process.env.CENTRAL_API_KEY_PEPPER?.trim();
  if (central) return { pepper: central, source: 'central' };
  const auth = process.env.AUTH_SECRET?.trim();
  if (auth) {
    if (process.env.NODE_ENV === 'production' && process.env.CENTRAL_API_KEY_PEPPER_WARN_ONCE !== '1') {
      // One-shot warn to avoid log spam.
      process.env.CENTRAL_API_KEY_PEPPER_WARN_ONCE = '1';
      // eslint-disable-next-line no-console
      console.warn(
        '[api-keys] CENTRAL_API_KEY_PEPPER not set; falling back to AUTH_SECRET for central key HMAC. ' +
        'This is DEPRECATED. Set CENTRAL_API_KEY_PEPPER and rotate keys.',
      );
    }
    return { pepper: auth, source: 'auth_secret_legacy' };
  }
  return { pepper: 'dev-only-secret-not-for-production', source: 'dev_default' };
}

/**
 * Stable, deterministic hash for stored API keys.
 * HMAC-SHA256 with CENTRAL_API_KEY_PEPPER (dedicated pepper, separate from
 * AUTH_SECRET). DB leak alone is insufficient to brute-force keys.
 */
export function hashApiKey(plaintext: string): string {
  const { pepper } = resolvePepper();
  return crypto.createHmac('sha256', pepper).update(plaintext).digest('hex');
}

/**
 * Reports which pepper source is in effect. Safe for diagnostics — never
 * returns the pepper value itself.
 */
export function getApiKeyPepperStatus(): {
  source: 'central' | 'auth_secret_legacy' | 'dev_default';
  algorithm: typeof CENTRAL_API_KEY_HASH_ALGORITHM;
  hashVersion: typeof CENTRAL_API_KEY_HASH_VERSION;
  pepperVersion: typeof CENTRAL_API_KEY_PEPPER_VERSION;
} {
  const { source } = resolvePepper();
  return {
    source,
    algorithm: CENTRAL_API_KEY_HASH_ALGORITHM,
    hashVersion: CENTRAL_API_KEY_HASH_VERSION,
    pepperVersion: CENTRAL_API_KEY_PEPPER_VERSION,
  };
}

export function generateApiKey(env: ApiKeyEnvironment = 'live'): GeneratedKey {
  const random = randomBase64Url();
  const plaintext = `gtc_${env}_${random}`;
  // Public prefix shown in UI: `gtc_live_xxxxxxxx`
  const publicPrefix = `gtc_${env}_${random.slice(0, PREFIX_PUBLIC_LEN)}`;
  const hash = hashApiKey(plaintext);
  return {
    plaintext,
    prefix: publicPrefix,
    hash,
    hashAlgorithm: CENTRAL_API_KEY_HASH_ALGORITHM,
    hashVersion: CENTRAL_API_KEY_HASH_VERSION,
    pepperVersion: CENTRAL_API_KEY_PEPPER_VERSION,
  };
}

export function ipHash(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const { pepper } = resolvePepper();
  return crypto.createHmac('sha256', pepper).update(ip).digest('hex').slice(0, 32);
}

/* ─── Validation ─────────────────────────────────────────── */

export type ValidationErrorCode =
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'revoked_api_key'
  | 'disabled_api_key'
  | 'expired_api_key'
  | 'insufficient_scope'
  | 'service_not_allowed'
  | 'rate_limited';

export type ValidationResult =
  | { ok: true; keyId: string; keyPrefix: string; tenantId: string | null; scopes: string[]; services: string[] }
  | { ok: false; code: ValidationErrorCode; status: number; message: string };

export interface ValidateOptions {
  authorizationHeader: string | null | undefined;
  requiredService?: string;
  requiredScope?: string;
  origin?: string | null;
  ip?: string | null;
}

const ERROR_STATUS: Record<ValidationErrorCode, number> = {
  missing_api_key: 401,
  invalid_api_key: 401,
  revoked_api_key: 401,
  disabled_api_key: 401,
  expired_api_key: 401,
  insufficient_scope: 403,
  service_not_allowed: 403,
  rate_limited: 429,
};

const ERROR_MESSAGE: Record<ValidationErrorCode, string> = {
  missing_api_key: 'API key required',
  invalid_api_key: 'Invalid API key',
  revoked_api_key: 'API key has been revoked',
  disabled_api_key: 'API key is disabled',
  expired_api_key: 'API key has expired',
  insufficient_scope: 'API key is missing the required scope',
  service_not_allowed: 'API key does not allow this service',
  rate_limited: 'Rate limit exceeded',
};

function fail(code: ValidationErrorCode): ValidationResult {
  return { ok: false, code, status: ERROR_STATUS[code], message: ERROR_MESSAGE[code] };
}

export async function validateApiKey(opts: ValidateOptions): Promise<ValidationResult> {
  const header = opts.authorizationHeader?.trim();
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return fail('missing_api_key');
  }
  const plaintext = header.slice(7).trim();
  if (!plaintext) return fail('missing_api_key');

  const hash = hashApiKey(plaintext);
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
  const row = rows[0];
  if (!row) return fail('invalid_api_key');

  if (row.status === 'revoked') return fail('revoked_api_key');
  if (row.status === 'disabled') return fail('disabled_api_key');
  if (row.status === 'expired') return fail('expired_api_key');
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return fail('expired_api_key');

  const services = (row.services as string[] | null) ?? [];
  const scopes = (row.scopes as string[] | null) ?? [];

  if (opts.requiredService && services.length > 0 && !services.includes(opts.requiredService)) {
    return fail('service_not_allowed');
  }
  if (opts.requiredScope && !scopes.includes(opts.requiredScope)) {
    // also allow wildcard like "ai:*"
    const prefix = opts.requiredScope.split(':')[0] + ':*';
    if (!scopes.includes(prefix) && !scopes.includes('*')) {
      return fail('insufficient_scope');
    }
  }

  // Update last_used_at fire-and-forget (best-effort, ignore errors)
  void db
    .update(apiKeys)
    .set({
      lastUsedAt: new Date(),
      lastUsedIp: opts.ip || null,
      lastUsedService: opts.requiredService || null,
    })
    .where(eq(apiKeys.id, row.id))
    .catch(() => undefined);

  return {
    ok: true,
    keyId: row.id,
    keyPrefix: row.keyPrefix,
    tenantId: row.tenantId,
    services,
    scopes,
  };
}

/* ─── Audit logging ─────────────────────────────────────── */

export async function recordAudit(opts: {
  apiKeyId: string | null;
  keyPrefix?: string | null;
  action: string;
  actorEmail: string | null;
  summary?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(apiKeyAuditLogs).values({
      apiKeyId: opts.apiKeyId,
      keyPrefix: opts.keyPrefix ?? null,
      action: opts.action,
      actorEmail: opts.actorEmail,
      summary: opts.summary ?? null,
      details: opts.details ?? {},
    });
  } catch (err) {
    // Never throw from audit logging
    console.error('[api-keys] audit log failed:', err);
  }
}

export async function recordUsage(opts: {
  apiKeyId: string | null;
  keyPrefix?: string | null;
  service?: string | null;
  route?: string | null;
  statusCode?: number | null;
  errorCode?: string | null;
  ip?: string | null;
  latencyMs?: number | null;
}) {
  try {
    await db.insert(apiKeyUsageLogs).values({
      apiKeyId: opts.apiKeyId,
      keyPrefix: opts.keyPrefix ?? null,
      service: opts.service ?? null,
      route: opts.route ?? null,
      statusCode: opts.statusCode ?? null,
      errorCode: opts.errorCode ?? null,
      ipHash: ipHash(opts.ip),
      latencyMs: opts.latencyMs ?? null,
    });
  } catch (err) {
    console.error('[api-keys] usage log failed:', err);
  }
}

/* ─── Stats ─────────────────────────────────────────────── */

export async function getApiKeyStats() {
  const totalRow = await db.select({ c: dsql<number>`count(*)::int` }).from(apiKeys);
  const activeRow = await db
    .select({ c: dsql<number>`count(*)::int` })
    .from(apiKeys)
    .where(eq(apiKeys.status, 'active'));
  const todayRow = await db
    .select({ c: dsql<number>`count(*)::int` })
    .from(apiKeyUsageLogs)
    .where(dsql`${apiKeyUsageLogs.createdAt} > now() - interval '1 day'`);
  return {
    totalKeys: totalRow[0]?.c ?? 0,
    activeKeys: activeRow[0]?.c ?? 0,
    requestsToday: todayRow[0]?.c ?? 0,
  };
}

export async function listApiKeys() {
  return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)).limit(200);
}

export async function listRecentAudit(limit = 10) {
  return db.select().from(apiKeyAuditLogs).orderBy(desc(apiKeyAuditLogs.createdAt)).limit(limit);
}

/* ─── Service catalog ──────────────────────────────────── */

export interface GatewayService {
  id: string;
  name: string;
  domain: string;
  region: string;
  status: 'active' | 'ready' | 'planned' | 'not_configured';
  validation: 'central' | 'legacy' | 'manual' | 'planned';
  description: string;
}

export function getGatewayServices(): GatewayService[] {
  return [
    {
      id: 'mcp',
      name: 'MCP Endpoint',
      domain: 'mcp.getouch.co',
      region: 'ap-southeast-1',
      status: 'active',
      validation: 'central',
      description: 'Bearer-authenticated Streamable HTTP MCP endpoint.',
    },
    {
      id: 'vllm',
      name: 'vLLM API',
      domain: 'vllm.getouch.co',
      region: 'us-east-1',
      status: process.env.GETOUCH_VLLM_GATEWAY_ENABLED === 'true' ? 'active' : 'ready',
      validation: 'manual',
      description: 'OpenAI-compatible vLLM inference gateway.',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Gateway',
      domain: 'wa.getouch.co',
      region: 'ap-southeast-1',
      status: 'ready',
      validation: 'legacy',
      description: 'Existing WhatsApp gateway with its own keys (legacy compatibility).',
    },
    {
      id: 'voice',
      name: 'Voice API',
      domain: 'voice.getouch.co',
      region: 'ap-southeast-1',
      status: 'planned',
      validation: 'planned',
      description: 'Outbound voice / broadcast gateway (planned).',
    },
    {
      id: 'litellm',
      name: 'LiteLLM',
      domain: 'litellm.getouch.co',
      region: 'reserved',
      status: 'planned',
      validation: 'planned',
      description: 'Reserved for future LiteLLM gateway.',
    },
  ];
}

/* ─── Coolify env inventory (manual catalog) ────────────────
 * This is a curated catalog of env vars we expect to find across
 * Coolify services. We only report whether the var is set in the
 * portal process env — never the value.
 * ─────────────────────────────────────────────────────────── */

export interface SecretInventoryItem {
  service: string;
  envName: string;
  secretType: string;
  status: 'configured' | 'missing' | 'unknown';
  managedBy: 'coolify' | 'env' | 'portal' | 'manual';
  notes?: string;
}

const SECRET_CATALOG: Array<Omit<SecretInventoryItem, 'status'>> = [
  { service: 'vllm-gateway', envName: 'GETOUCH_VLLM_GATEWAY_KEYS', secretType: 'Public API key', managedBy: 'coolify' },
  { service: 'vllm-gateway', envName: 'GETOUCH_VLLM_BACKEND_API_KEY', secretType: 'Backend key', managedBy: 'coolify' },
  { service: 'vllm-gateway', envName: 'GETOUCH_VLLM_GATEWAY_ADMIN_TEST_KEY', secretType: 'Admin test key', managedBy: 'coolify' },
  { service: 'vllm-gateway', envName: 'GETOUCH_AI_API_KEY', secretType: 'Legacy alias', managedBy: 'env', notes: 'Legacy fallback for GETOUCH_VLLM_*' },
  { service: 'whatsapp-gateway', envName: 'WA_API_KEY', secretType: 'Gateway key', managedBy: 'coolify' },
  { service: 'whatsapp-gateway', envName: 'WA_ADMIN_KEY', secretType: 'Gateway admin key', managedBy: 'coolify' },
  { service: 'open-webui', envName: 'OPENAI_API_KEYS', secretType: 'Provider keys', managedBy: 'manual', notes: 'Paired with OPENAI_API_BASE_URLS' },
  { service: 'open-webui', envName: 'WEBUI_SECRET_KEY', secretType: 'Session signing', managedBy: 'coolify' },
  { service: 'dify', envName: 'DIFY_APP_API_KEY', secretType: 'App key', managedBy: 'coolify' },
  { service: 'portal', envName: 'AUTH_SECRET', secretType: 'Session signing', managedBy: 'coolify' },
  { service: 'portal', envName: 'SESSION_SECRET', secretType: 'Session signing', managedBy: 'env' },
  { service: 'searxng', envName: 'SEARXNG_SECRET', secretType: 'Signing key', managedBy: 'coolify' },
];

export function getSecretInventory(): SecretInventoryItem[] {
  return SECRET_CATALOG.map((item) => {
    const value = process.env[item.envName];
    const status: 'configured' | 'missing' = value && value.length > 0 ? 'configured' : 'missing';
    return { ...item, status };
  });
}

/* ─── Mutations ──────────────────────────────────────────── */

export interface CreateApiKeyInput {
  name: string;
  environment: ApiKeyEnvironment;
  tenantId?: string | null;
  services: string[];
  scopes: string[];
  allowedOrigins?: string[];
  rateLimitCount?: number | null;
  rateLimitWindowSeconds?: number | null;
  expiresAt?: Date | null;
  notes?: string | null;
  createdByEmail?: string | null;
  createdByUserId?: string | null;
}

export async function createApiKey(input: CreateApiKeyInput) {
  const generated = generateApiKey(input.environment);
  const { plaintext, prefix, hash } = generated;

  const [row] = await db
    .insert(apiKeys)
    .values({
      name: input.name,
      environment: input.environment,
      tenantId: input.tenantId ?? null,
      keyPrefix: prefix,
      keyHash: hash,
      hashAlgorithm: generated.hashAlgorithm,
      hashVersion: generated.hashVersion,
      pepperVersion: generated.pepperVersion,
      services: input.services,
      scopes: input.scopes,
      allowedOrigins: input.allowedOrigins ?? [],
      rateLimitCount: input.rateLimitCount ?? null,
      rateLimitWindowSeconds: input.rateLimitWindowSeconds ?? null,
      expiresAt: input.expiresAt ?? null,
      notes: input.notes ?? null,
      createdByEmail: input.createdByEmail ?? null,
      createdByUserId: input.createdByUserId ?? null,
      validationSource: 'central',
      status: 'active',
    })
    .returning();

  await recordAudit({
    apiKeyId: row.id,
    keyPrefix: row.keyPrefix,
    action: 'create',
    actorEmail: input.createdByEmail ?? null,
    summary: `Created API key "${row.name}"`,
    details: { environment: row.environment, services: row.services, scopes: row.scopes },
  });

  return { row, plaintext };
}

export async function setApiKeyStatus(opts: {
  id: string;
  status: ApiKeyStatus;
  actorEmail: string | null;
  reason?: string;
}) {
  const [row] = await db
    .update(apiKeys)
    .set({
      status: opts.status,
      ...(opts.status === 'revoked' ? { revokedAt: new Date(), revokedByEmail: opts.actorEmail } : {}),
    })
    .where(eq(apiKeys.id, opts.id))
    .returning();
  if (!row) return null;

  await recordAudit({
    apiKeyId: row.id,
    keyPrefix: row.keyPrefix,
    action: opts.status,
    actorEmail: opts.actorEmail,
    summary: `Status changed to ${opts.status}`,
    details: opts.reason ? { reason: opts.reason } : {},
  });

  return row;
}

export async function rotateApiKey(opts: { id: string; actorEmail: string | null }) {
  const [existing] = await db.select().from(apiKeys).where(eq(apiKeys.id, opts.id)).limit(1);
  if (!existing) return null;

  // Mark existing as rotating, mint a new key linked via rotated_from_id
  await db.update(apiKeys).set({ status: 'rotating' }).where(eq(apiKeys.id, existing.id));

  const generated = generateApiKey(existing.environment as ApiKeyEnvironment);
  const { plaintext, prefix, hash } = generated;
  const [fresh] = await db
    .insert(apiKeys)
    .values({
      name: existing.name,
      environment: existing.environment,
      tenantId: existing.tenantId,
      keyPrefix: prefix,
      keyHash: hash,
      hashAlgorithm: generated.hashAlgorithm,
      hashVersion: generated.hashVersion,
      pepperVersion: generated.pepperVersion,
      services: existing.services as string[],
      scopes: existing.scopes as string[],
      allowedOrigins: existing.allowedOrigins as string[],
      rateLimitCount: existing.rateLimitCount,
      rateLimitWindowSeconds: existing.rateLimitWindowSeconds,
      expiresAt: existing.expiresAt,
      notes: existing.notes,
      createdByEmail: opts.actorEmail,
      validationSource: 'central',
      status: 'active',
      rotatedFromId: existing.id,
    })
    .returning();

  await recordAudit({
    apiKeyId: fresh.id,
    keyPrefix: fresh.keyPrefix,
    action: 'rotate',
    actorEmail: opts.actorEmail,
    summary: `Rotated from ${existing.keyPrefix}`,
    details: { rotatedFromId: existing.id },
  });

  return { row: fresh, plaintext };
}

export async function getApiKeyById(id: string) {
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  return row ?? null;
}

export async function listUsageForKey(id: string, limit = 50) {
  return db
    .select()
    .from(apiKeyUsageLogs)
    .where(eq(apiKeyUsageLogs.apiKeyId, id))
    .orderBy(desc(apiKeyUsageLogs.createdAt))
    .limit(limit);
}

export async function listAuditForKey(id: string, limit = 50) {
  return db
    .select()
    .from(apiKeyAuditLogs)
    .where(eq(apiKeyAuditLogs.apiKeyId, id))
    .orderBy(desc(apiKeyAuditLogs.createdAt))
    .limit(limit);
}

/* ─── Scope catalog (UI uses this) ──────────────────────── */
export const SCOPE_CATALOG: Record<string, string[]> = {
  ai: ['ai:chat', 'ai:embed', 'ai:models', 'ai:admin'],
  mcp: ['mcp:connect', 'mcp:tools:list', 'mcp:tools:call', 'mcp:resources:read', 'mcp:admin'],
  model: [
    'model:getouch-qwen3-14b',
    'model:getouch-qwen3-30b',
    'model:getouch-embed',
    'model:ollama',
    'model:vllm',
  ],
  whatsapp: ['whatsapp:send', 'whatsapp:read', 'whatsapp:session', 'whatsapp:webhook', 'whatsapp:admin'],
  voice: ['voice:call', 'voice:broadcast', 'voice:logs', 'voice:admin'],
  webhook: ['webhook:receive', 'webhook:send', 'webhook:manage'],
  internal: ['internal:read', 'internal:write', 'internal:admin'],
};

export const SERVICE_CATALOG = ['ai', 'mcp', 'whatsapp', 'voice', 'webhooks', 'internal'] as const;

// silence "unused" until we use `and` for filter combos
void and;
