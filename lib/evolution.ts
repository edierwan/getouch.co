/**
 * Evolution WhatsApp Gateway helpers.
 *
 * - Centralized server-side accessor for the Evolution API admin backend.
 * - Sanitizes errors and never logs/returns admin API keys.
 * - All DB writes here go through the portal control-plane (db.ts);
 *   Evolution's own runtime DB is owned by the Evolution container itself.
 */

import crypto from 'node:crypto';
import { and, count, desc, eq, gte, sql as dsql } from 'drizzle-orm';
import { db } from './db';
import {
  evolutionEvents,
  evolutionInstances,
  evolutionMessageLogs,
  evolutionSessions,
  evolutionSettings,
  evolutionTemplates,
  evolutionTenantBindings,
  evolutionWebhooks,
} from './schema';

export const EVOLUTION_DEFAULT_WEBHOOK_EVENTS = [
  'message.received',
  'message.sent',
  'message.failed',
  'session.connected',
  'session.disconnected',
  'qr.updated',
] as const;

export type EvolutionEvent = (typeof EVOLUTION_DEFAULT_WEBHOOK_EVENTS)[number];

export interface EvolutionConfig {
  configured: boolean;
  baseUrl: string | null;
  hasAdminKey: boolean;
  hasGlobalKey: boolean;
  webhookBase: string | null;
  /** Mask shown in UI / Settings tab. */
  adminKeyMask: string | null;
}

/**
 * Resolve Evolution backend connection from env. Never returns the raw key.
 * Only public-safe diagnostics.
 */
export function getEvolutionConfig(): EvolutionConfig {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim() || null;
  const adminKey = process.env.EVOLUTION_API_KEY?.trim() || '';
  const globalKey = process.env.EVOLUTION_GLOBAL_API_KEY?.trim() || '';
  const webhookBase = process.env.EVOLUTION_WEBHOOK_BASE_URL?.trim() || null;

  return {
    configured: Boolean(baseUrl && adminKey),
    baseUrl,
    hasAdminKey: adminKey.length > 0,
    hasGlobalKey: globalKey.length > 0,
    webhookBase,
    adminKeyMask: adminKey ? maskSecret(adminKey) : null,
  };
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/**
 * Sanitize Evolution backend error messages before returning to the client.
 * Never echo full URLs, keys, or stack traces.
 */
export function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    const safe = err.message.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
      .replace(/(api[_-]?key|apikey)["'=:\s]+["']?[^"'\s,}]+/gi, '$1=***');
    return safe.slice(0, 240);
  }
  return 'Evolution backend error';
}

/**
 * Wrapped fetch to Evolution backend with timeout + auth header injection.
 * Returns null + error string on any failure (never throws to caller).
 */
export interface EvolutionResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function evolutionFetch<T = unknown>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<EvolutionResult<T>> {
  const cfg = getEvolutionConfig();
  if (!cfg.configured || !cfg.baseUrl) {
    return { ok: false, status: 0, error: 'evolution_not_configured' };
  }
  const adminKey = process.env.EVOLUTION_API_KEY?.trim() || '';
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        apikey: adminKey,
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    let data: unknown;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = { raw: text.slice(0, 240) };
    }
    return { ok: res.ok, status: res.status, data: data as T };
  } catch (err) {
    return { ok: false, status: 0, error: sanitizeError(err) };
  } finally {
    clearTimeout(timeout);
  }
}

/* ─── Slug + secret helpers ───────────────────────────── */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || `instance-${Date.now()}`;
}

export function generateWebhookSecret(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = `evw_${crypto.randomBytes(24).toString('base64url')}`;
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, prefix: plaintext.slice(0, 12), hash };
}

/* ─── Audit/event log helper ──────────────────────────── */

export interface AuditEventInput {
  eventType: string;
  severity?: 'info' | 'warn' | 'error';
  summary?: string;
  actorEmail?: string | null;
  tenantId?: string | null;
  instanceId?: string | null;
  sessionId?: string | null;
  payload?: Record<string, unknown>;
}

export async function recordEvent(input: AuditEventInput): Promise<void> {
  try {
    await db.insert(evolutionEvents).values({
      tenantId: input.tenantId ?? null,
      instanceId: input.instanceId ?? null,
      sessionId: input.sessionId ?? null,
      eventType: input.eventType,
      severity: input.severity ?? 'info',
      summary: (input.summary ?? '').slice(0, 250) || null,
      actorEmail: input.actorEmail ?? null,
      payloadSummary: redactPayload(input.payload ?? {}),
    });
  } catch (err) {
    // Never let audit logging failures break the main action.
    // eslint-disable-next-line no-console
    console.error('[evolution] recordEvent failed:', sanitizeError(err));
  }
}

function redactPayload(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (/secret|key|token|password|apikey/i.test(k)) {
      out[k] = '***';
    } else if (typeof v === 'string' && v.length > 200) {
      out[k] = `${v.slice(0, 197)}...`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/* ─── Aggregate stats ─────────────────────────────────── */

export interface OverviewStats {
  totalInstances: number;
  activeInstances: number;
  stoppedInstances: number;
  activeSessions: number;
  connectingSessions: number;
  disconnectedSessions: number;
  expiredSessions: number;
  totalSessions: number;
  totalTenants: number;
  newTenantsThisWeek: number;
  messages24h: number;
  messages24hDelta: number | null;
  /** uptime ratio expressed 0..1, computed across instances last_health_status. */
  uptimePercent: number | null;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [instances, sessions, tenants, msgs24, msgs48, healthRows] = await Promise.all([
    db.select({
      total: count(),
      active: dsql<number>`count(*) filter (where status = 'active')`,
      stopped: dsql<number>`count(*) filter (where status = 'stopped')`,
    }).from(evolutionInstances),
    db.select({
      total: count(),
      connected: dsql<number>`count(*) filter (where status = 'connected')`,
      connecting: dsql<number>`count(*) filter (where status = 'connecting')`,
      disconnected: dsql<number>`count(*) filter (where status = 'disconnected')`,
      expired: dsql<number>`count(*) filter (where status = 'expired')`,
    }).from(evolutionSessions),
    db.select({
      total: count(),
      newWeek: dsql<number>`count(*) filter (where created_at >= ${since7d})`,
    }).from(evolutionTenantBindings),
    db.select({ c: count() }).from(evolutionMessageLogs).where(gte(evolutionMessageLogs.createdAt, since24h)),
    db.select({ c: count() }).from(evolutionMessageLogs).where(
      and(gte(evolutionMessageLogs.createdAt, since48h), dsql`created_at < ${since24h}`),
    ),
    db.select({
      ok: dsql<number>`count(*) filter (where last_health_status = 'ok')`,
      total: count(),
    }).from(evolutionInstances),
  ]);

  const i = instances[0] ?? { total: 0, active: 0, stopped: 0 };
  const s = sessions[0] ?? { total: 0, connected: 0, connecting: 0, disconnected: 0, expired: 0 };
  const t = tenants[0] ?? { total: 0, newWeek: 0 };
  const h = healthRows[0] ?? { ok: 0, total: 0 };
  const prev24 = Number(msgs48[0]?.c ?? 0);
  const cur24 = Number(msgs24[0]?.c ?? 0);
  const delta = prev24 > 0 ? Math.round(((cur24 - prev24) / prev24) * 1000) / 10 : null;

  return {
    totalInstances: Number(i.total),
    activeInstances: Number(i.active),
    stoppedInstances: Number(i.stopped),
    activeSessions: Number(s.connected),
    connectingSessions: Number(s.connecting),
    disconnectedSessions: Number(s.disconnected),
    expiredSessions: Number(s.expired),
    totalSessions: Number(s.total),
    totalTenants: Number(t.total),
    newTenantsThisWeek: Number(t.newWeek),
    messages24h: cur24,
    messages24hDelta: delta,
    uptimePercent: Number(h.total) > 0 ? Number(h.ok) / Number(h.total) : null,
  };
}

/* ─── Listings ────────────────────────────────────────── */

export async function listInstances() {
  return db.select().from(evolutionInstances).orderBy(desc(evolutionInstances.createdAt));
}

export async function listSessions(opts: { tenantId?: string; instanceId?: string; status?: string } = {}) {
  const conds = [];
  if (opts.tenantId) conds.push(eq(evolutionSessions.tenantId, opts.tenantId));
  if (opts.instanceId) conds.push(eq(evolutionSessions.instanceId, opts.instanceId));
  if (opts.status) conds.push(eq(evolutionSessions.status, opts.status as 'connected'));
  const where = conds.length ? and(...conds) : undefined;
  return where
    ? db.select().from(evolutionSessions).where(where).orderBy(desc(evolutionSessions.updatedAt)).limit(500)
    : db.select().from(evolutionSessions).orderBy(desc(evolutionSessions.updatedAt)).limit(500);
}

export async function listTenantBindings() {
  return db.select().from(evolutionTenantBindings).orderBy(desc(evolutionTenantBindings.updatedAt));
}

export async function listWebhooks() {
  return db.select().from(evolutionWebhooks).orderBy(desc(evolutionWebhooks.updatedAt));
}

export async function listTemplates() {
  return db.select().from(evolutionTemplates).orderBy(desc(evolutionTemplates.updatedAt));
}

export async function listMessages(opts: {
  tenantId?: string;
  sessionId?: string;
  status?: string;
  limit?: number;
} = {}) {
  const conds = [];
  if (opts.tenantId) conds.push(eq(evolutionMessageLogs.tenantId, opts.tenantId));
  if (opts.sessionId) conds.push(eq(evolutionMessageLogs.sessionId, opts.sessionId));
  if (opts.status) conds.push(eq(evolutionMessageLogs.status, opts.status as 'sent'));
  const where = conds.length ? and(...conds) : undefined;
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  return where
    ? db.select().from(evolutionMessageLogs).where(where).orderBy(desc(evolutionMessageLogs.createdAt)).limit(limit)
    : db.select().from(evolutionMessageLogs).orderBy(desc(evolutionMessageLogs.createdAt)).limit(limit);
}

export async function listRecentEvents(limit = 20) {
  return db.select().from(evolutionEvents).orderBy(desc(evolutionEvents.createdAt)).limit(limit);
}

export async function getSettings() {
  const [row] = await db.select().from(evolutionSettings).where(eq(evolutionSettings.id, 1));
  if (row) return row;
  await db.insert(evolutionSettings).values({ id: 1 }).onConflictDoNothing();
  const [created] = await db.select().from(evolutionSettings).where(eq(evolutionSettings.id, 1));
  return created;
}

/* ─── Health probe ────────────────────────────────────── */

export async function probeHealth(): Promise<{ ok: boolean; status: number; latencyMs: number; error?: string }> {
  const start = Date.now();
  const r = await evolutionFetch<{ status?: string; version?: string }>('/manager/findManager', {
    method: 'GET',
    timeoutMs: 4000,
  });
  // Some Evolution versions expose `/` or `/health`. Try fallback:
  if (!r.ok && r.status !== 0) {
    const r2 = await evolutionFetch<unknown>('/', { method: 'GET', timeoutMs: 4000 });
    return { ok: r2.ok, status: r2.status, latencyMs: Date.now() - start, error: r2.error };
  }
  return { ok: r.ok, status: r.status, latencyMs: Date.now() - start, error: r.error };
}

/* ─── System health for the right-side panel ──────────── */

export interface SystemHealthItem {
  label: string;
  status: 'healthy' | 'degraded' | 'unknown' | 'not_configured';
  detail?: string;
}

export async function getSystemHealth(): Promise<SystemHealthItem[]> {
  const cfg = getEvolutionConfig();
  const out: SystemHealthItem[] = [];

  if (!cfg.configured) {
    out.push({ label: 'Evolution API', status: 'not_configured', detail: 'EVOLUTION_API_URL not set' });
  } else {
    try {
      const probe = await probeHealth();
      out.push({
        label: 'Evolution API',
        status: probe.ok ? 'healthy' : 'degraded',
        detail: probe.ok ? `${probe.latencyMs}ms` : `HTTP ${probe.status || '—'}`,
      });
    } catch {
      out.push({ label: 'Evolution API', status: 'degraded' });
    }
  }

  // DB
  try {
    await db.execute(dsql`select 1`);
    out.push({ label: 'Database (PostgreSQL)', status: 'healthy' });
  } catch {
    out.push({ label: 'Database (PostgreSQL)', status: 'degraded' });
  }

  // Webhook queue (lightweight check: any failing webhooks?)
  try {
    const [{ failing = 0 }] = (await db.select({
      failing: dsql<number>`count(*) filter (where status = 'failing')`,
    }).from(evolutionWebhooks)) as Array<{ failing: number }>;
    out.push({
      label: 'Webhook Queue',
      status: Number(failing) > 0 ? 'degraded' : 'healthy',
      detail: Number(failing) > 0 ? `${failing} failing` : undefined,
    });
  } catch {
    out.push({ label: 'Webhook Queue', status: 'unknown' });
  }

  return out;
}

/* ─── Type guards ─────────────────────────────────────── */

const ALLOWED_INSTANCE_STATUSES = ['active', 'stopped', 'error', 'maintenance', 'unknown'] as const;
export function asInstanceStatus(v: unknown): (typeof ALLOWED_INSTANCE_STATUSES)[number] {
  return (ALLOWED_INSTANCE_STATUSES as readonly string[]).includes(v as string)
    ? (v as (typeof ALLOWED_INSTANCE_STATUSES)[number])
    : 'unknown';
}
