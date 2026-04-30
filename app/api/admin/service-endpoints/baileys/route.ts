import { NextRequest, NextResponse } from 'next/server';
import { listApiKeys } from '@/lib/api-keys';
import { getBaileysDbPortalData } from '@/lib/baileys-db';
import {
  BAILEYS_DB_NAME,
  WA_BASE_URL,
  WA_PUBLIC_URL,
  isWaConfigured,
  requireAdmin,
  waProxy,
} from './_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface WaSession {
  id: string;
  status: string;
  qrAvailable?: boolean;
  phone?: string | null;
  user?: { id?: string; name?: string } | null;
  lastActivityAt?: string | null;
  createdAt?: string | null;
  messages24h?: { inbound?: number; outbound?: number };
  tenantId?: string | null;
}

interface WaSessionsList {
  sessions: WaSession[];
  defaultSessionId?: string;
  webhook?: { stats?: Record<string, number> };
}

interface WaOverview {
  sessionTotals?: { total: number; connected: number; pending: number; disconnected: number; messages24h: number };
  totals?: { messages?: number };
  webhook?: { stats?: Record<string, number> };
  uptimeSeconds?: number | null;
  runtimeMode?: string | null;
  serviceName?: string | null;
  databaseName?: string | null;
}

interface WaEvent {
  id?: string | number;
  type?: string;
  level?: string;
  message?: string;
  detail?: string;
  sessionId?: string | null;
  tenantId?: string | null;
  createdAt?: string;
}

function classifyOnline(connected: number, total: number): 'online' | 'degraded' | 'offline' {
  if (total === 0) return 'offline';
  if (connected === 0) return 'offline';
  if (connected < total) return 'degraded';
  return 'online';
}

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m`;
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const configured = isWaConfigured();

  const [dbData, overviewRes, sessionsRes, runtimeEventsRes, keysList] = await Promise.all([
    getBaileysDbPortalData(),
    waProxy<WaOverview>('/admin/overview'),
    waProxy<WaSessionsList>('/admin/sessions'),
    waProxy<WaEvent[]>('/admin/events', { query: { limit: 25 } }),
    listApiKeys().catch(() => []),
  ]);

  const runtimeSessions: WaSession[] = sessionsRes.data?.sessions ?? [];
  const overview = overviewRes.data ?? {};
  const runtimeMode = 'baileys' as const;
  const runtimeLabel = overview.serviceName ?? 'baileys-gateway';
  const runtimeDatabase = overview.databaseName ?? BAILEYS_DB_NAME;
  const runtimeTotals = overview.sessionTotals ?? {
    total: runtimeSessions.length,
    connected: runtimeSessions.filter((s) => s.status === 'connected').length,
    pending: runtimeSessions.filter((s) => s.status === 'connecting' || s.status === 'pending' || s.qrAvailable).length,
    disconnected: runtimeSessions.filter((s) => !['connected', 'connecting', 'pending'].includes(s.status) && !s.qrAvailable).length,
    messages24h: 0,
  };

  const dbSessionMap = new Map(dbData.sessions.map((session) => [session.id, session]));
  const sessions = runtimeSessions.map((session) => {
    const mirrored = dbSessionMap.get(session.id);
    return {
      id: session.id,
      status: session.status,
      qrAvailable: Boolean(session.qrAvailable),
      phone: session.phone ?? session.user?.id ?? mirrored?.phone ?? null,
      tenantId: session.tenantId ?? mirrored?.tenantId ?? null,
      lastActivityAt: session.lastActivityAt ?? mirrored?.lastActivityAt ?? null,
      messages24h: (session.messages24h?.inbound ?? 0) + (session.messages24h?.outbound ?? 0),
      source: 'baileys_runtime' as const,
    };
  });

  const baileysKeys = keysList
    .filter((key) => {
      const services = (key.services as string[] | null) ?? [];
      return services.length === 0 || services.includes('whatsapp') || services.includes('baileys');
    })
    .map((key) => ({
      id: key.id,
      name: key.name,
      tenantId: key.tenantId,
      keyPrefix: key.keyPrefix,
      environment: key.environment,
      status: key.status,
      scopes: (key.scopes as string[]) ?? [],
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      revokedAt: key.revokedAt,
      expiresAt: key.expiresAt,
    }));

  const apiKeyStats = {
    total: baileysKeys.length,
    active: baileysKeys.filter((key) => key.status === 'active').length,
    revoked: baileysKeys.filter((key) => key.status === 'revoked').length,
    expired: baileysKeys.filter((key) => key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()).length,
  };

  const tenantMap = new Map<string, { tenantId: string; displayName: string | null; sessions: number; messagesToday: number; keyPrefix: string | null; status: string }>();
  for (const tenant of dbData.tenants) {
    tenantMap.set(tenant.tenantId, {
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      sessions: 0,
      messagesToday: 0,
      keyPrefix: null,
      status: tenant.status,
    });
  }
  for (const session of sessions) {
    const tenantId = session.tenantId || 'system';
    const existing = tenantMap.get(tenantId) ?? {
      tenantId,
      displayName: null,
      sessions: 0,
      messagesToday: 0,
      keyPrefix: null,
      status: 'active',
    };
    existing.sessions += 1;
    existing.messagesToday += session.messages24h;
    tenantMap.set(tenantId, existing);
  }
  for (const key of baileysKeys) {
    const tenantId = key.tenantId || 'system';
    const existing = tenantMap.get(tenantId) ?? {
      tenantId,
      displayName: null,
      sessions: 0,
      messagesToday: 0,
      keyPrefix: null,
      status: 'active',
    };
    if (!existing.keyPrefix) existing.keyPrefix = key.keyPrefix;
    tenantMap.set(tenantId, existing);
  }
  const tenants = Array.from(tenantMap.values());

  const onlineState = configured ? classifyOnline(runtimeTotals.connected, runtimeTotals.total) : 'offline';

  const overviewEventSource = dbData.events.length > 0
    ? 'baileys_db'
    : (runtimeEventsRes.ok && (runtimeEventsRes.data?.length ?? 0) > 0 ? 'baileys_runtime' : 'empty');

  const events = dbData.events.length > 0
    ? dbData.events.slice(0, 25).map((event) => ({
        id: event.id,
        type: event.eventType,
        level: event.level,
        detail: event.detail,
        sessionId: event.sessionId,
        tenantId: event.tenantId,
        createdAt: event.createdAt,
        source: 'baileys_db' as const,
      }))
    : (runtimeEventsRes.data ?? []).slice(0, 25).map((event) => ({
        id: event.id,
        type: event.type ?? event.message,
        level: event.level ?? 'info',
        detail: event.detail ?? null,
        sessionId: event.sessionId ?? null,
        tenantId: event.tenantId ?? null,
        createdAt: event.createdAt,
        source: 'baileys_runtime' as const,
      }));

  const health = [
    {
      label: 'Baileys Runtime',
      status: configured && overviewRes.ok ? 'healthy' : configured ? 'degraded' : 'not_configured',
      detail: configured ? `${runtimeLabel} on wa.getouch.co` : 'WA_API_KEY missing',
    },
    {
      label: 'WebSocket',
      status: runtimeTotals.connected > 0 ? 'healthy' : runtimeTotals.total > 0 ? 'degraded' : 'unknown',
      detail: `${runtimeTotals.connected}/${runtimeTotals.total} connected`,
    },
    {
      label: 'Baileys DB',
      status: dbData.status.schemaApplied ? 'healthy' : dbData.status.connected ? 'degraded' : dbData.status.configured ? 'degraded' : 'not_configured',
      detail: dbData.status.schemaApplied ? `Schema initialized in ${BAILEYS_DB_NAME}` : (dbData.status.error ?? 'Schema missing or partial'),
    },
    {
      label: 'Event Delivery',
      status: dbData.counts.events > 0 ? 'healthy' : overviewEventSource === 'baileys_runtime' ? 'degraded' : 'unknown',
      detail: dbData.counts.events > 0 ? `${dbData.counts.events} events in Baileys DB` : (overviewEventSource === 'baileys_runtime' ? 'Events streaming from runtime; DB persistence pending' : 'No events yet'),
    },
    {
      label: 'Queue',
      status: dbData.counts.sendLogs > 0 ? 'healthy' : 'unknown',
      detail: `${dbData.counts.sendLogs} send logs`,
    },
  ] as const;

  return NextResponse.json({
    config: {
      configured,
      publicUrl: WA_PUBLIC_URL,
      internalUrl: WA_BASE_URL,
      database: BAILEYS_DB_NAME,
      pairingEnabled: true,
      qrEnabled: true,
      runtimeLabel,
      runtimeMode,
      runtimeDatabase,
      newDatabaseInitialized: dbData.status.schemaApplied,
      newDatabaseStatus: dbData.status.schemaApplied ? 'initialized' : (dbData.status.connected ? 'partial' : 'unavailable'),
      cutoverReady: dbData.status.schemaApplied,
      cutoverBlocker: null,
      dbUrlSource: dbData.status.urlSource,
    },
    runtimeOk: overviewRes.ok,
    runtimeError: overviewRes.ok ? null : overviewRes.error,
    onlineState,
    overviewEventSource,
    stats: {
      ...runtimeTotals,
      uptime: formatUptime(overview.uptimeSeconds ?? null),
      uptimeSeconds: overview.uptimeSeconds ?? null,
      tenants: tenants.length,
      messages24h: runtimeTotals.messages24h ?? 0,
      dbMessages24h: dbData.counts.messages24h,
      dbEvents: dbData.counts.events,
      dbSendLogs: dbData.counts.sendLogs,
    },
    runtime: {
      container: runtimeLabel,
      defaultSessionId: sessionsRes.data?.defaultSessionId ?? null,
      webhookStats: sessionsRes.data?.webhook?.stats ?? overview.webhook?.stats ?? {},
      mode: runtimeMode,
    },
    sessions,
    tenants,
    apiKeys: baileysKeys,
    apiKeyStats,
    events,
    health,
    database: dbData,
  });
}

/**
 * Action endpoint for the console:
 * POST { action: 'create_session', sessionId, ... }
 *      { action: 'reset_session', sessionId }
 *      { action: 'delete_session', sessionId }
 *      { action: 'send_test', sessionId, to, text }
 *      { action: 'pairing_code', sessionId, phone }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const action = String(body.action ?? '');
  const sessionId = body.sessionId != null ? String(body.sessionId) : '';

  // Slugify session ID server-side as a defence in depth.
  const isValidSessionId = (id: string) => /^[a-z0-9_-]{1,40}$/.test(id);

  switch (action) {
    case 'create_session': {
      if (!isValidSessionId(sessionId)) return NextResponse.json({ error: 'invalid_session_id' }, { status: 400 });
      const tenantId = body.tenantId != null ? String(body.tenantId) : undefined;
      const purpose = body.purpose != null ? String(body.purpose) : undefined;
      const notes = body.notes != null ? String(body.notes) : undefined;
      const r = await waProxy(`/admin/sessions`, { method: 'POST', body: { sessionId, tenantId, purpose, notes } });
      return NextResponse.json({ ok: r.ok, status: r.status, data: r.data, error: r.error }, { status: r.ok ? 200 : 502 });
    }
    case 'reset_session': {
      if (!isValidSessionId(sessionId)) return NextResponse.json({ error: 'invalid_session_id' }, { status: 400 });
      const r = await waProxy(`/admin/sessions/${encodeURIComponent(sessionId)}/reset`, { method: 'POST' });
      return NextResponse.json({ ok: r.ok, status: r.status, data: r.data, error: r.error }, { status: r.ok ? 200 : 502 });
    }
    case 'delete_session': {
      if (!isValidSessionId(sessionId)) return NextResponse.json({ error: 'invalid_session_id' }, { status: 400 });
      const r = await waProxy(`/admin/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      return NextResponse.json({ ok: r.ok, status: r.status, data: r.data, error: r.error }, { status: r.ok ? 200 : 502 });
    }
    case 'send_test': {
      if (!isValidSessionId(sessionId)) return NextResponse.json({ error: 'invalid_session_id' }, { status: 400 });
      const to = String(body.to ?? '').trim();
      const text = String(body.text ?? '').trim();
      if (!to || !text) return NextResponse.json({ error: 'missing_to_or_text' }, { status: 400 });
      // Use the per-session messages endpoint exposed by the wa runtime.
      const r = await waProxy(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: 'POST',
        body: { to, text },
      });
      return NextResponse.json({ ok: r.ok, status: r.status, data: r.data, error: r.error }, { status: r.ok ? 200 : 502 });
    }
    case 'pairing_code': {
      if (!isValidSessionId(sessionId)) return NextResponse.json({ error: 'invalid_session_id' }, { status: 400 });
      const phone = String(body.phone ?? '').trim();
      if (!phone) return NextResponse.json({ error: 'missing_phone' }, { status: 400 });
      const r = await waProxy(`/api/pairing-code`, { query: { phone, session: sessionId } });
      return NextResponse.json({ ok: r.ok, status: r.status, data: r.data, error: r.error }, { status: r.ok ? 200 : 502 });
    }
    default:
      return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  }
}
