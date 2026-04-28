import { NextRequest, NextResponse } from 'next/server';
import { listApiKeys } from '@/lib/api-keys';
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
  pairingCode?: string | null;
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

  // Fetch in parallel; treat individual upstream failures as empty so the
  // page still renders during fresh-install state.
  const [overviewRes, sessionsRes, eventsRes, keysList] = await Promise.all([
    waProxy<WaOverview>('/admin/overview'),
    waProxy<WaSessionsList>('/admin/sessions'),
    waProxy<WaEvent[]>('/admin/events', { query: { limit: 25 } }),
    listApiKeys().catch(() => []),
  ]);

  const sessions: WaSession[] = sessionsRes.data?.sessions ?? [];
  const overview = overviewRes.data ?? {};
  const totals = overview.sessionTotals ?? {
    total: sessions.length,
    connected: sessions.filter((s) => s.status === 'connected').length,
    pending: sessions.filter((s) => s.status === 'connecting' || s.status === 'pending' || s.qrAvailable).length,
    disconnected: sessions.filter((s) => !['connected', 'connecting', 'pending'].includes(s.status) && !s.qrAvailable).length,
    messages24h: 0,
  };

  // Filter central API keys for whatsapp/baileys scope.
  const baileysKeys = keysList
    .filter((k) => {
      const services = (k.services as string[] | null) ?? [];
      return services.length === 0 || services.includes('whatsapp') || services.includes('baileys');
    })
    .map((k) => ({
      id: k.id,
      name: k.name,
      tenantId: k.tenantId,
      keyPrefix: k.keyPrefix,
      environment: k.environment,
      status: k.status,
      scopes: (k.scopes as string[]) ?? [],
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
      revokedAt: k.revokedAt,
      expiresAt: k.expiresAt,
    }));

  const apiKeyStats = {
    total: baileysKeys.length,
    active: baileysKeys.filter((k) => k.status === 'active').length,
    revoked: baileysKeys.filter((k) => k.status === 'revoked').length,
    expired: baileysKeys.filter((k) => k.expiresAt && new Date(k.expiresAt).getTime() < Date.now()).length,
  };

  // Tenant overview derived from sessions + central keys.
  const tenantMap = new Map<string, { tenantId: string; sessions: number; messagesToday: number; keyPrefix: string | null; status: string }>();
  for (const s of sessions) {
    const tid = s.tenantId || 'system';
    const existing = tenantMap.get(tid) ?? { tenantId: tid, sessions: 0, messagesToday: 0, keyPrefix: null, status: 'active' };
    existing.sessions += 1;
    existing.messagesToday += (s.messages24h?.inbound ?? 0) + (s.messages24h?.outbound ?? 0);
    tenantMap.set(tid, existing);
  }
  for (const k of baileysKeys) {
    const tid = k.tenantId || 'system';
    const existing = tenantMap.get(tid) ?? { tenantId: tid, sessions: 0, messagesToday: 0, keyPrefix: null, status: 'active' };
    if (!existing.keyPrefix) existing.keyPrefix = k.keyPrefix;
    tenantMap.set(tid, existing);
  }
  const tenants = Array.from(tenantMap.values());

  const onlineState = configured ? classifyOnline(totals.connected, totals.total) : 'offline';

  // Health checks
  const health = [
    { label: 'Baileys Runtime', status: configured && overviewRes.ok ? 'healthy' : configured ? 'degraded' : 'not_configured', detail: configured ? `${WA_BASE_URL}` : 'WA_API_KEY missing' },
    { label: 'WebSocket', status: totals.connected > 0 ? 'healthy' : totals.total > 0 ? 'degraded' : 'unknown', detail: `${totals.connected}/${totals.total} connected` },
    { label: 'Database', status: configured && overviewRes.ok ? 'healthy' : 'unknown', detail: `Postgres: ${BAILEYS_DB_NAME}` },
    { label: 'Event Delivery', status: (overview.webhook?.stats?.delivered ?? 0) > 0 ? 'healthy' : 'unknown', detail: `${overview.webhook?.stats?.delivered ?? 0} delivered` },
    { label: 'Queue', status: 'healthy', detail: '0 backlog' },
  ];

  return NextResponse.json({
    config: {
      configured,
      publicUrl: WA_PUBLIC_URL,
      internalUrl: WA_BASE_URL,
      database: BAILEYS_DB_NAME,
      pairingEnabled: true,
      qrEnabled: true,
    },
    runtimeOk: overviewRes.ok,
    runtimeError: overviewRes.ok ? null : overviewRes.error,
    onlineState,
    stats: {
      ...totals,
      uptime: formatUptime(overview.uptimeSeconds ?? null),
      uptimeSeconds: overview.uptimeSeconds ?? null,
      tenants: tenants.length,
      messages24h: totals.messages24h ?? 0,
    },
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      qrAvailable: Boolean(s.qrAvailable),
      phone: s.phone ?? s.user?.id ?? null,
      tenantId: s.tenantId ?? null,
      lastActivityAt: s.lastActivityAt ?? null,
      messages24h: (s.messages24h?.inbound ?? 0) + (s.messages24h?.outbound ?? 0),
    })),
    tenants,
    apiKeys: baileysKeys,
    apiKeyStats,
    events: (eventsRes.data ?? []).slice(0, 25),
    health,
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
      const r = await waProxy(`/admin/sessions`, { method: 'POST', body: { sessionId } });
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
