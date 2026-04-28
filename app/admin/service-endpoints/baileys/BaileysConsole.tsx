'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { EvolutionStyles } from '../../whatsapp-services/evolution/EvolutionConsole';

/* ─────────────────────────────────────────────────────────────────────
 * Baileys WhatsApp Gateway — Portal control console
 *
 * Mounted at: /admin/service-endpoints/baileys
 * Backend:    /api/admin/service-endpoints/baileys (proxies to wa runtime)
 *
 * The runtime currently lives in the `getouch-wa` container (wa.getouch.co).
 * This UI is built so that swapping the runtime later (fresh Baileys install
 * pointing at Postgres `Baileys`) requires no UI changes — it just re-points
 * WA_URL / WA_API_KEY in the web container env.
 * ───────────────────────────────────────────────────────────────────── */

type Tab =
  | 'overview'
  | 'sessions'
  | 'tenants'
  | 'webhooks'
  | 'templates'
  | 'messages'
  | 'analytics'
  | 'settings';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '◫' },
  { id: 'sessions', label: 'Sessions', icon: '⌬' },
  { id: 'tenants', label: 'Tenants', icon: '◉' },
  { id: 'webhooks', label: 'Webhooks', icon: '↻' },
  { id: 'templates', label: 'Templates', icon: '◈' },
  { id: 'messages', label: 'Messages', icon: '✉' },
  { id: 'analytics', label: 'Analytics', icon: '◐' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

interface ApiKey {
  id: string;
  name: string;
  tenantId: string | null;
  keyPrefix: string;
  environment: string;
  status: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
}

interface SessionRow {
  id: string;
  status: string;
  qrAvailable: boolean;
  phone: string | null;
  tenantId: string | null;
  lastActivityAt: string | null;
  messages24h: number;
}

interface TenantRow {
  tenantId: string;
  displayName?: string | null;
  sessions: number;
  messagesToday: number;
  keyPrefix: string | null;
  status: string;
}

interface EventRow {
  id?: string | number;
  type?: string;
  level?: string;
  message?: string;
  detail?: string;
  sessionId?: string | null;
  tenantId?: string | null;
  createdAt?: string;
  source?: 'baileys_db' | 'legacy_runtime';
}

interface HealthItem {
  label: string;
  status: 'healthy' | 'degraded' | 'unknown' | 'not_configured';
  detail?: string;
}

interface WebhookRow {
  id: string;
  tenantId: string | null;
  sessionId: string | null;
  label: string | null;
  url: string;
  events: string[];
  secretPrefix: string | null;
  status: string;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  deliveryCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TemplateRow {
  id: string;
  tenantId: string | null;
  name: string;
  language: string;
  status: string;
  body: string;
  variables: string[];
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbMessageRow {
  id: string;
  tenantId: string | null;
  sessionId: string | null;
  direction: string;
  toNumber: string | null;
  fromNumber: string | null;
  messageType: string;
  status: string;
  preview: string | null;
  errorCode: string | null;
  createdAt: string;
}

interface SendLogRow {
  id: string;
  tenantId: string | null;
  sessionId: string | null;
  apiKeyPrefix: string | null;
  toNumber: string | null;
  status: string;
  detail: string | null;
  createdAt: string;
}

interface DatabaseState {
  status: {
    configured: boolean;
    connected: boolean;
    database: string;
    urlSource: string;
    schemaApplied: boolean;
    tableCount: number;
    tables: string[];
    missingTables: string[];
    indexes: string[];
    missingIndexes: string[];
    constraints: Array<{ tableName: string; constraintName: string; constraintType: string }>;
    defaultTenantPresent: boolean;
    error: string | null;
  };
  counts: {
    tenants: number;
    sessions: number;
    webhooks: number;
    templates: number;
    messages: number;
    events: number;
    sendLogs: number;
    messages24h: number;
  };
  tenants: Array<{
    tenantId: string;
    displayName: string | null;
    status: string;
    maxSessions: number;
    messageRate: number;
    webhookEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  sessions: Array<{
    id: string;
    tenantId: string | null;
    phone: string | null;
    purpose: string;
    status: string;
    notes: string | null;
    lastConnectedAt: string | null;
    lastActivityAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  webhooks: WebhookRow[];
  templates: TemplateRow[];
  messages: DbMessageRow[];
  events: Array<{
    id: string;
    tenantId: string | null;
    sessionId: string | null;
    eventType: string;
    level: string;
    detail: string | null;
    createdAt: string;
  }>;
  sendLogs: SendLogRow[];
}

interface OverviewData {
  config: {
    configured: boolean;
    publicUrl: string;
    internalUrl: string;
    database: string;
    pairingEnabled: boolean;
    qrEnabled: boolean;
    runtimeLabel: string;
    runtimeMode: string;
    runtimeDatabase: string;
    newDatabaseInitialized: boolean;
    newDatabaseStatus: string;
    cutoverReady: boolean;
    cutoverBlocker: string;
    dbUrlSource: string;
  };
  runtime: {
    container: string;
    defaultSessionId: string | null;
    webhookStats: Record<string, number>;
    mode: string;
  };
  runtimeOk: boolean;
  runtimeError: string | null;
  onlineState: 'online' | 'degraded' | 'offline';
  overviewEventSource: 'baileys_db' | 'legacy_runtime' | 'empty';
  stats: {
    total: number;
    connected: number;
    pending: number;
    disconnected: number;
    messages24h: number;
    tenants: number;
    uptime: string;
    uptimeSeconds: number | null;
    dbMessages24h: number;
    dbEvents: number;
    dbSendLogs: number;
  };
  sessions: Array<SessionRow & { source: 'legacy_runtime' }>;
  tenants: TenantRow[];
  apiKeys: ApiKey[];
  apiKeyStats: { total: number; active: number; revoked: number; expired: number };
  events: EventRow[];
  health: HealthItem[];
  database: DatabaseState;
}

/* ─── Helpers ─────────────────────────────────────────── */
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return '—';
  const sec = Math.round((Date.now() - d) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (['active', 'connected', 'healthy', 'online', 'delivered', 'sent', 'initialized'].includes(s)) return 'evo-pill evo-pill-good';
  if (['connecting', 'pending', 'pending_qr', 'queued', 'rotating', 'partial', 'legacy'].includes(s)) return 'evo-pill evo-pill-info';
  if (['disconnected', 'paused', 'archived', 'received', 'draft', 'unknown', 'not_configured'].includes(s)) return 'evo-pill evo-pill-muted';
  if (['error', 'failed', 'failing', 'rejected', 'expired', 'degraded', 'offline', 'unavailable'].includes(s)) return 'evo-pill evo-pill-bad';
  return 'evo-pill evo-pill-muted';
}

/* Normalise a Malaysian phone number to international 60xxxxxxxx (client-side). */
function normalizeMyPhone(raw: string): string {
  let digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = '60' + digits.slice(1);
  else if (!digits.startsWith('60') && digits.length >= 9 && digits.length <= 10) digits = '60' + digits;
  return digits;
}

/* Sanitise a session ID input to a safe slug. */
function slugifySessionId(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/* ─── Top-level component ─────────────────────────────── */
export function BaileysConsole() {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/service-endpoints/baileys', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    const handleTabChange = (event: Event) => {
      const next = (event as CustomEvent<Tab>).detail;
      if (typeof next === 'string') {
        setTab(next as Tab);
      }
    };
    document.addEventListener('bly:set-tab', handleTabChange);
    return () => document.removeEventListener('bly:set-tab', handleTabChange);
  }, []);

  const onCreateSession = () => setTab('sessions');

  return (
    <div className="evo-shell">
      <BaileysHeader data={data} onCreate={onCreateSession} />

      <div className="evo-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`evo-tab${tab === t.id ? ' evo-tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span style={{ marginRight: 6, opacity: 0.7 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {error && tab === 'overview' ? <div className="evo-error">⚠ {error}</div> : null}
      {data && !data.config.configured && tab === 'overview' ? (
        <div className="evo-banner evo-banner-warn">
          ⚠ Baileys runtime not configured. Set <code>WA_API_KEY</code> (and optionally
          <code>WA_URL</code>) in the portal env. The console proxies to the runtime at <code>{data.config.internalUrl}</code>.
        </div>
      ) : null}
      {data && data.config.configured && !data.runtimeOk && tab === 'overview' ? (
        <div className="evo-banner evo-banner-warn">
          ⚠ Runtime unreachable: <code>{data.runtimeError ?? 'unknown'}</code>. Check the <code>getouch-wa</code> container.
        </div>
      ) : null}
      {data ? (
        <div className="evo-banner evo-banner-good">
          Live session control is still proxied to <code>{data.config.runtimeLabel}</code>.
          {' '}New database status: <code>{data.config.newDatabaseStatus}</code> on <code>{data.config.database}</code>.
          {' '}Cutover blocker: {data.config.cutoverBlocker}
        </div>
      ) : null}

      <div className="evo-tabpanel">
        {tab === 'overview' && <OverviewTab data={data} loading={loading} onRefresh={reload} startTransition={startTransition} />}
        {tab === 'sessions' && <SessionsTab data={data} onRefresh={reload} />}
        {tab === 'tenants' && <TenantsTab data={data} />}
        {tab === 'webhooks' && <WebhooksTab data={data} />}
        {tab === 'templates' && <TemplatesTab data={data} />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'analytics' && <AnalyticsTab data={data} />}
        {tab === 'settings' && <SettingsTab data={data} />}
      </div>

      <EvolutionStyles />
    </div>
  );
}

/* ─── Header ──────────────────────────────────────────── */
function BaileysHeader({ data, onCreate }: { data: OverviewData | null; onCreate: () => void }) {
  const state = data?.onlineState ?? 'offline';
  const stateLabel = state === 'online' ? 'Online' : state === 'degraded' ? 'Degraded' : 'Offline';
  const stateClass = state === 'online' ? 'evo-pill-good' : state === 'degraded' ? 'evo-pill-info' : 'evo-pill-bad';
  return (
    <header className="evo-page-head">
      <div className="evo-breadcrumb">
        <span className="evo-crumb-muted">Service Endpoints</span>
        <span className="evo-crumb-sep">/</span>
        <span className="evo-crumb-active">Baileys Gateway</span>
      </div>
      <div className="evo-page-head-row">
        <div>
          <h1 className="evo-title">
            <span style={{ marginRight: 8 }}>📱</span>
            Baileys WhatsApp Gateway
            <span className={`evo-pill ${stateClass}`} style={{ marginLeft: 12, verticalAlign: 'middle', fontSize: '0.72rem' }}>● {stateLabel}</span>
            <span className="evo-pill evo-pill-violet" style={{ marginLeft: 6, verticalAlign: 'middle', fontSize: '0.72rem' }}>⌬ Multi-tenant ready</span>
          </h1>
          <p className="evo-subtitle">
            Fresh multi-tenant WhatsApp gateway powered by Baileys. Supports QR and pairing-code onboarding.
          </p>
        </div>
        <div className="evo-head-actions">
          <a
            href="https://wa.getouch.co/"
            target="_blank"
            rel="noopener noreferrer"
            className="evo-btn evo-btn-ghost"
          >
            <span className="evo-btn-ico">⌨</span> API Docs
          </a>
          <a
            href="/admin/api-keys?service=whatsapp"
            className="evo-btn evo-btn-ghost"
          >
            <span className="evo-btn-ico">▤</span> View Logs
          </a>
          <button type="button" className="evo-btn evo-btn-primary" onClick={onCreate}>
            <span className="evo-btn-ico">＋</span> Create Session
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─── OVERVIEW TAB ────────────────────────────────────── */
function OverviewTab({
  data,
  loading,
  onRefresh,
  startTransition,
}: {
  data: OverviewData | null;
  loading: boolean;
  onRefresh: () => void;
  startTransition: (cb: () => void) => void;
}) {
  if (loading && !data) return <div className="evo-empty">Loading…</div>;
  if (!data) return <div className="evo-empty">No data.</div>;

  const { stats, sessions, tenants, apiKeys, apiKeyStats, events, health, config } = data;
  const onlineLabel = data.onlineState === 'online' ? 'Online' : data.onlineState === 'degraded' ? 'Degraded' : 'Offline';
  const onlineTone = data.onlineState === 'online' ? 'good' : data.onlineState === 'degraded' ? 'amber' : 'bad';

  return (
    <div className="evo-overview">
      {/* Top metric cards (matches reference: Status / Tenants / Active Sessions / Messages 24h / Onboarding Modes / Uptime) */}
      <div className="evo-stat-grid">
        <StatCard label="STATUS" value={onlineLabel} sub={config.configured ? 'Runtime reachable' : 'Not configured'} icon="◐" tone={onlineTone} />
        <StatCard label="TENANTS" value={fmtNumber(stats.tenants)} sub={stats.tenants === 0 ? 'No tenants yet' : `${stats.tenants} active`} icon="◉" />
        <StatCard label="ACTIVE SESSIONS" value={fmtNumber(stats.connected)} sub={stats.total > 0 ? `${stats.total} total` : 'No sessions yet'} icon="⌬" tone={stats.connected > 0 ? 'good' : undefined} />
        <StatCard label="MESSAGES (24H)" value={fmtNumber(stats.messages24h)} sub={stats.messages24h === 0 ? 'No traffic' : 'Last 24 hours'} icon="✉" tone="amber" />
        <StatCard label="ONBOARDING MODES" value="QR + Pairing" sub="Both available" icon="⌬" />
        <StatCard label="UPTIME" value={stats.uptime} sub={stats.uptimeSeconds ? 'Since last start' : 'No uptime data'} icon="◔" tone={stats.uptimeSeconds ? 'good' : undefined} />
      </div>

      <div className="evo-grid-2">
        {/* LEFT: tenants, api access, system health */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <section className="evo-panel">
            <div className="evo-panel-head">
              <h3 className="evo-panel-title">Tenant Overview</h3>
              <a href="#tenants" className="evo-btn evo-btn-ghost evo-btn-xs" onClick={(e) => { e.preventDefault(); document.dispatchEvent(new CustomEvent('bly:set-tab', { detail: 'tenants' })); }}>View All Tenants</a>
            </div>
            {tenants.length === 0 ? (
              <div className="evo-empty-row">No tenants yet. Sessions and API keys will appear here once tenants are linked.</div>
            ) : (
              <table className="evo-table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Sessions</th>
                    <th>API Key</th>
                    <th>Messages Today</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.tenantId}>
                      <td className="evo-cell-strong">
                        {t.tenantId === 'system' ? 'System / Default' : (t.displayName || t.tenantId)}
                      </td>
                      <td>{t.sessions}</td>
                      <td className="evo-cell-mono">{t.keyPrefix ?? '—'}</td>
                      <td>{fmtNumber(t.messagesToday)}</td>
                      <td><span className={statusPill(t.status)}>{t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="evo-panel">
            <div className="evo-panel-head">
              <h3 className="evo-panel-title">API Access</h3>
              <a href="/admin/api-keys" className="evo-btn evo-btn-ghost evo-btn-xs">⚿ Manage API Keys</a>
            </div>
            <div className="evo-stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <MiniStat label="Total Keys" value={apiKeyStats.total} />
              <MiniStat label="Active" value={apiKeyStats.active} tone="good" />
              <MiniStat label="Revoked" value={apiKeyStats.revoked} tone="bad" />
              <MiniStat label="Expired" value={apiKeyStats.expired} tone="amber" />
            </div>
            {apiKeys.length === 0 ? (
              <div className="evo-empty-row">No API keys scoped to WhatsApp/Baileys yet. Create one in Developer Platform → API Keys.</div>
            ) : (
              <table className="evo-table evo-table-compact">
                <thead>
                  <tr>
                    <th>App Name</th>
                    <th>Tenant</th>
                    <th>Key Prefix</th>
                    <th>Scopes</th>
                    <th>Status</th>
                    <th>Last Used</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.slice(0, 6).map((k) => (
                    <tr key={k.id}>
                      <td className="evo-cell-strong">{k.name}</td>
                      <td className="evo-cell-muted">{k.tenantId ?? 'system'}</td>
                      <td className="evo-cell-mono">{k.keyPrefix}_****</td>
                      <td className="evo-cell-muted">{k.scopes.slice(0, 3).join(', ') || '—'}</td>
                      <td><span className={statusPill(k.status)}>{k.status}</span></td>
                      <td className="evo-cell-muted">{timeAgo(k.lastUsedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="evo-panel">
            <div className="evo-panel-head">
              <h3 className="evo-panel-title">System Health</h3>
            </div>
            <ul className="evo-health-list">
              {health.map((h) => (
                <li key={h.label} className="evo-health-row">
                  <span className="evo-health-label">{h.label}</span>
                  <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {h.detail ? <span className="evo-cell-muted">{h.detail}</span> : null}
                    <span className={statusPill(h.status)}>{h.status.replace('_', ' ')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* RIGHT: sessions, pairing & test, event log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <section className="evo-panel">
            <div className="evo-panel-head">
              <h3 className="evo-panel-title">Active Sessions</h3>
              <button type="button" className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => startTransition(onRefresh)}>↻ Refresh</button>
            </div>
            {sessions.length === 0 ? (
              <div className="evo-empty-row">No sessions yet. Use “Create Session” to onboard a number.</div>
            ) : (
              <table className="evo-table evo-table-compact">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Tenant</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 6).map((s) => (
                    <tr key={s.id}>
                      <td className="evo-cell-mono">{s.id}</td>
                      <td className="evo-cell-muted">{s.tenantId ?? 'system'}</td>
                      <td className="evo-cell-mono">{s.phone ?? '—'}</td>
                      <td><span className={statusPill(s.status)}>{s.status}</span></td>
                      <td className="evo-cell-muted">{timeAgo(s.lastActivityAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <PairingPanel sessions={sessions} onChanged={onRefresh} />

          <section className="evo-panel">
            <div className="evo-panel-head">
              <h3 className="evo-panel-title">Event Log</h3>
              <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className={`evo-pill evo-pill-xs ${data.overviewEventSource === 'baileys_db' ? 'evo-pill-good' : data.overviewEventSource === 'legacy_runtime' ? 'evo-pill-info' : 'evo-pill-muted'}`}>
                  {data.overviewEventSource === 'baileys_db' ? 'Baileys DB' : data.overviewEventSource === 'legacy_runtime' ? 'Legacy Runtime' : 'No Events'}
                </span>
                <a href="/admin/api-keys?service=whatsapp" className="evo-btn evo-btn-ghost evo-btn-xs">View Full Log</a>
              </div>
            </div>
            {events.length === 0 ? (
              <div className="evo-empty-row">No events yet.</div>
            ) : (
              <ul className="evo-activity">
                {events.slice(0, 10).map((e, idx) => (
                  <li key={String(e.id ?? idx)} className={`evo-activity-row${e.level === 'error' ? ' evo-activity-error' : e.level === 'warn' ? ' evo-activity-warn' : ''}`}>
                    <span className="evo-activity-dot" />
                    <div className="evo-activity-body">
                      <div className="evo-activity-title">{e.type ?? e.message ?? 'event'}</div>
                      <div className="evo-activity-meta">
                        {e.tenantId ? <span className="evo-pill evo-pill-xs evo-pill-violet">{e.tenantId}</span> : null}
                        {e.sessionId ? <span className="evo-cell-mono"> {e.sessionId}</span> : null}
                        {e.detail ? <span> · {e.detail}</span> : null}
                      </div>
                    </div>
                    <span className="evo-activity-time">{timeAgo(e.createdAt ?? null)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: string; tone?: 'good' | 'amber' | 'bad' }) {
  const valueClass = tone ? `evo-stat-value evo-stat-value-${tone}` : 'evo-stat-value';
  return (
    <div className="evo-stat">
      <div className="evo-stat-head">
        <span className="evo-stat-label">{label}</span>
        <span className="evo-stat-icon">{icon}</span>
      </div>
      <div className={valueClass}>{value}</div>
      {sub ? <div className="evo-stat-sub">{sub}</div> : null}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'amber' | 'bad' }) {
  const valueClass = tone ? `evo-stat-value evo-stat-value-${tone}` : 'evo-stat-value';
  return (
    <div className="evo-stat" style={{ padding: '0.7rem' }}>
      <div className="evo-stat-label">{label}</div>
      <div className={valueClass} style={{ fontSize: '1.4rem' }}>{value}</div>
    </div>
  );
}

/* ─── PAIRING PANEL ───────────────────────────────────── */
function PairingPanel({ sessions, onChanged }: { sessions: SessionRow[]; onChanged: () => void }) {
  const [mode, setMode] = useState<'qr' | 'pairing'>('qr');
  const [selectedSession, setSelectedSession] = useState<string>(sessions[0]?.id ?? '');
  const [phone, setPhone] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Test message state
  const [testTo, setTestTo] = useState('');
  const [testBody, setTestBody] = useState('Hello from GetTouch Baileys Gateway! 👋');
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    if (!selectedSession && sessions.length > 0) setSelectedSession(sessions[0].id);
  }, [sessions, selectedSession]);

  const refreshQr = useCallback(async () => {
    if (!selectedSession) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/service-endpoints/baileys/sessions/${encodeURIComponent(selectedSession)}/qr`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `Failed (${res.status})`);
        setQr(null);
      } else {
        const j = await res.json();
        setQr(j.qr ?? null);
        setStatus(j.status ?? null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'network_error');
    } finally {
      setBusy(false);
    }
  }, [selectedSession]);

  useEffect(() => { if (mode === 'qr') void refreshQr(); }, [mode, refreshQr]);

  const requestPairing = async () => {
    if (!selectedSession) { setErr('Select a session'); return; }
    const normalised = normalizeMyPhone(phone);
    if (!normalised || normalised.length < 10) { setErr('Enter a valid phone number'); return; }
    setBusy(true);
    setErr(null);
    setPairingCode(null);
    try {
      const res = await fetch('/api/admin/service-endpoints/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pairing_code', sessionId: selectedSession, phone: normalised }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setErr(j.error ?? 'failed');
      } else {
        setPairingCode((j.data as { code?: string; pairingCode?: string })?.code ?? (j.data as { pairingCode?: string })?.pairingCode ?? null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'network_error');
    } finally { setBusy(false); }
  };

  const sendTest = async () => {
    if (!selectedSession) { setTestResult({ ok: false, detail: 'Select a session' }); return; }
    const to = normalizeMyPhone(testTo);
    if (!to) { setTestResult({ ok: false, detail: 'Enter a valid phone' }); return; }
    if (!testBody.trim()) { setTestResult({ ok: false, detail: 'Enter a message' }); return; }
    setBusy(true); setTestResult(null);
    try {
      const res = await fetch('/api/admin/service-endpoints/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_test', sessionId: selectedSession, to, text: testBody }),
      });
      const j = await res.json();
      setTestResult({ ok: Boolean(j.ok), detail: j.ok ? `Sent to ${to}` : (j.error ?? 'failed') });
      if (j.ok) onChanged();
    } catch (e) {
      setTestResult({ ok: false, detail: e instanceof Error ? e.message : 'network_error' });
    } finally { setBusy(false); }
  };

  const selected = sessions.find((s) => s.id === selectedSession);
  const sessionConnected = selected?.status === 'connected';

  return (
    <section className="evo-panel">
      <div className="evo-panel-head">
        <h3 className="evo-panel-title">Session Pairing &amp; Test Message</h3>
      </div>

      <div className="evo-tabs" style={{ marginBottom: '0.6rem' }}>
        <button type="button" className={`evo-tab${mode === 'qr' ? ' evo-tab-active' : ''}`} onClick={() => setMode('qr')}>QR Code</button>
        <button type="button" className={`evo-tab${mode === 'pairing' ? ' evo-tab-active' : ''}`} onClick={() => setMode('pairing')}>Pairing Code</button>
      </div>

      <label className="evo-label">
        Session
        <select className="evo-input" value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
          {sessions.length === 0 ? <option value="">— no sessions —</option> : null}
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.id} ({s.status}{s.tenantId ? ` · ${s.tenantId}` : ''})</option>
          ))}
        </select>
      </label>

      {mode === 'qr' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
          {qr ? (
            <img src={qr} alt="QR code" className="evo-qr" />
          ) : (
            <div className="evo-empty-row" style={{ width: '100%' }}>
              {selectedSession ? (status === 'connected' ? '✓ Session connected' : (busy ? 'Loading QR…' : 'No QR available. Click Refresh.')) : 'Select or create a session.'}
            </div>
          )}
          <button type="button" className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => void refreshQr()} disabled={busy || !selectedSession}>↻ Refresh QR</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label className="evo-label">
            Phone number
            <input className="evo-input" placeholder="0192277233 (auto-normalises to 60…)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <button type="button" className="evo-btn evo-btn-primary" onClick={() => void requestPairing()} disabled={busy || !selectedSession}>
            {busy ? '…' : 'Request Pairing Code'}
          </button>
          {pairingCode ? (
            <div className="evo-pairing">{pairingCode}</div>
          ) : null}
          <p className="evo-cell-muted" style={{ fontSize: '0.75rem' }}>
            On the phone: <em>WhatsApp → Linked Devices → Link with phone number instead</em>.
          </p>
          <p className="evo-cell-muted" style={{ fontSize: '0.74rem' }}>
            Legacy runtime note: pairing currently works only on the default session. Per-session pairing is deferred until the new Baileys runtime replaces <code>getouch-wa</code>.
          </p>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0.4rem 0' }} />

      <h4 style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0 }}>Send Test Message</h4>
      <label className="evo-label">
        Recipient
        <input className="evo-input" placeholder="0192277233" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
      </label>
      <label className="evo-label">
        Message
        <textarea className="evo-input evo-textarea" rows={3} value={testBody} onChange={(e) => setTestBody(e.target.value)} maxLength={1000} />
      </label>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="evo-cell-muted" style={{ fontSize: '0.74rem' }}>{testBody.length} / 1000</span>
        <button
          type="button"
          className="evo-btn evo-btn-primary"
          onClick={() => void sendTest()}
          disabled={busy || !sessionConnected}
          title={sessionConnected ? '' : 'Session must be connected'}
        >
          ✉ Send Test Message
        </button>
      </div>
      {testResult ? (
        <div className={testResult.ok ? 'evo-form-msg' : 'evo-form-err'}>{testResult.ok ? '✓ ' : '✗ '}{testResult.detail}</div>
      ) : null}

      {err ? <div className="evo-form-err">{err}</div> : null}
      {msg ? <div className="evo-form-msg">{msg}</div> : null}
    </section>
  );
}

/* ─── SESSIONS TAB ────────────────────────────────────── */
function SessionsTab({ data, onRefresh }: { data: OverviewData | null; onRefresh: () => void }) {
  const [newId, setNewId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sessions = data?.sessions ?? [];

  const act = async (action: string, sessionId: string, extra: Record<string, unknown> = {}) => {
    setBusy(`${action}:${sessionId}`); setErr(null);
    try {
      const res = await fetch('/api/admin/service-endpoints/baileys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId, ...extra }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) setErr(j.error ?? `Failed (${res.status})`);
      else onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'network_error');
    } finally { setBusy(null); }
  };

  const create = async () => {
    const id = slugifySessionId(newId);
    if (!id) { setErr('Enter a session id (lowercase, a–z, 0–9, -, _)'); return; }
    await act('create_session', id);
    setNewId('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <section className="evo-panel">
        <div className="evo-panel-head">
          <h3 className="evo-panel-title">Create Session</h3>
        </div>
        <div className="evo-form-inline">
          <input
            className="evo-input"
            placeholder="session-id (e.g. tenant-acme-primary)"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
          />
          <button type="button" className="evo-btn evo-btn-primary" onClick={() => void create()} disabled={busy !== null}>
            ＋ Create
          </button>
        </div>
        <p className="evo-cell-muted" style={{ fontSize: '0.74rem' }}>
          Session IDs are lowercase slugs. After creation, scan the QR or request a pairing code from the Overview tab.
        </p>
      </section>

      <section className="evo-panel">
        <div className="evo-panel-head">
          <h3 className="evo-panel-title">All Sessions</h3>
          <button type="button" className="evo-btn evo-btn-ghost evo-btn-xs" onClick={onRefresh}>↻ Refresh</button>
        </div>
        {sessions.length === 0 ? (
          <div className="evo-empty-row">No sessions yet.</div>
        ) : (
          <table className="evo-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Tenant</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Last Activity</th>
                <th>24h</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="evo-cell-mono">{s.id}</td>
                  <td className="evo-cell-muted">{s.tenantId ?? 'system'}</td>
                  <td className="evo-cell-mono">{s.phone ?? '—'}</td>
                  <td><span className={statusPill(s.status)}>{s.status}</span></td>
                  <td className="evo-cell-muted">{timeAgo(s.lastActivityAt)}</td>
                  <td>{s.messages24h}</td>
                  <td className="evo-row-actions evo-row-actions-end">
                    <button type="button" className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => void act('reset_session', s.id)} disabled={busy !== null}>↻ Reconnect</button>
                    <button
                      type="button"
                      className="evo-btn evo-btn-ghost evo-btn-bad evo-btn-xs"
                      onClick={() => { if (confirm(`Delete session ${s.id}? This logs it out and removes credentials.`)) void act('delete_session', s.id); }}
                      disabled={busy !== null}
                    >
                      ✕ Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {err ? <div className="evo-form-err">{err}</div> : null}
      </section>
    </div>
  );
}

/* ─── TENANTS TAB ─────────────────────────────────────── */
function TenantsTab({ data }: { data: OverviewData | null }) {
  const tenants = data?.tenants ?? [];
  return (
    <section className="evo-panel">
      <div className="evo-panel-head">
        <h3 className="evo-panel-title">Tenants</h3>
        <span className="evo-cell-muted">Baileys DB tenant refs: {data?.database.counts.tenants ?? 0} rows. Central API keys still come from the portal DB.</span>
      </div>
      {tenants.length === 0 ? (
        <div className="evo-empty-row">
          No tenants linked yet. The default <code>system</code> tenant is used until tenants are bound.
        </div>
      ) : (
        <table className="evo-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Sessions</th>
              <th>API Key</th>
              <th>Messages Today</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.tenantId}>
                <td className="evo-cell-strong">{t.tenantId === 'system' ? 'System / Default' : (t.displayName || t.tenantId)}</td>
                <td>{t.sessions}</td>
                <td className="evo-cell-mono">{t.keyPrefix ?? '—'}</td>
                <td>{fmtNumber(t.messagesToday)}</td>
                <td><span className={statusPill(t.status)}>{t.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ─── WEBHOOKS TAB ────────────────────────────────────── */
function WebhooksTab({ data }: { data: OverviewData | null }) {
  const rows = data?.database.webhooks ?? [];
  return (
    <section className="evo-panel">
      <div className="evo-panel-head">
        <h3 className="evo-panel-title">Webhooks</h3>
        <span className="evo-cell-muted">Baileys DB rows: {data?.database.counts.webhooks ?? 0}</span>
      </div>
      {rows.length === 0 ? (
        <div className="evo-empty-row">
          No webhook rows in the new Baileys DB yet.
          <br />
          Supported events: <code>messages.upsert</code>, <code>messages.update</code>, <code>connection.update</code>,
          <code>chats.update</code>, <code>qr.generated</code>, <code>session.connected</code>, <code>session.disconnected</code>.
        </div>
      ) : (
        <table className="evo-table evo-table-compact">
          <thead>
            <tr>
              <th>Label</th>
              <th>Tenant</th>
              <th>Session</th>
              <th>Events</th>
              <th>Status</th>
              <th>Last Delivery</th>
              <th>Deliveries</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="evo-cell-strong">{row.label || 'Webhook'}</div>
                  <div className="evo-cell-muted" style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.url}</div>
                </td>
                <td className="evo-cell-muted">{row.tenantId ?? 'system'}</td>
                <td className="evo-cell-mono">{row.sessionId ?? '—'}</td>
                <td className="evo-cell-muted">{row.events.join(', ') || '—'}</td>
                <td><span className={statusPill(row.status)}>{row.status}</span></td>
                <td className="evo-cell-muted">{timeAgo(row.lastDeliveryAt)}</td>
                <td>{row.deliveryCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ─── TEMPLATES TAB ───────────────────────────────────── */
function TemplatesTab({ data }: { data: OverviewData | null }) {
  const rows = data?.database.templates ?? [];
  return (
    <section className="evo-panel">
      <div className="evo-panel-head">
        <h3 className="evo-panel-title">Templates</h3>
        <span className="evo-cell-muted">Internal reusable templates (not Meta official templates). Rows: {data?.database.counts.templates ?? 0}</span>
      </div>
      {rows.length === 0 ? (
        <div className="evo-empty-row">No templates yet.</div>
      ) : (
        <table className="evo-table evo-table-compact">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tenant</th>
              <th>Status</th>
              <th>Language</th>
              <th>Variables</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="evo-cell-strong">{row.name}</td>
                <td className="evo-cell-muted">{row.tenantId ?? 'system'}</td>
                <td><span className={statusPill(row.status)}>{row.status}</span></td>
                <td>{row.language}</td>
                <td className="evo-cell-muted">{row.variables.join(', ') || '—'}</td>
                <td className="evo-cell-muted" style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.body}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ─── MESSAGES TAB ────────────────────────────────────── */
interface MessagesResponse {
  ok?: boolean;
  source?: 'baileys_db' | 'legacy_runtime';
  messages?: Array<{ id?: string; direction?: string; phone?: string; text?: string; status?: string; createdAt?: string; sessionId?: string | null }>;
}

function MessagesTab() {
  const [rows, setRows] = useState<MessagesResponse['messages']>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/service-endpoints/baileys/messages?limit=50', { cache: 'no-store' });
      const j: MessagesResponse = await res.json();
      if (!j.ok) {
        setErr(((j as unknown) as { error?: string }).error ?? 'failed');
      } else {
        setErr(null);
      }
      setRows(j.messages ?? []);
      setSource(j.source ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'network_error');
    } finally { setLoading(false); }
  }, []);

  const [source, setSource] = useState<'baileys_db' | 'legacy_runtime' | null>(null);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <section className="evo-panel">
      <div className="evo-panel-head">
        <h3 className="evo-panel-title">Messages</h3>
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {source ? <span className={`evo-pill evo-pill-xs ${source === 'baileys_db' ? 'evo-pill-good' : 'evo-pill-info'}`}>{source === 'baileys_db' ? 'Baileys DB' : 'Legacy Runtime'}</span> : null}
          <button type="button" className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => void reload()}>↻ Refresh</button>
        </div>
      </div>
      {loading && (rows ?? []).length === 0 ? <div className="evo-empty-row">Loading…</div> : null}
      {err ? <div className="evo-form-err">{err}</div> : null}
      {!loading && (rows ?? []).length === 0 ? (
        <div className="evo-empty-row">No messages yet.</div>
      ) : (
        <table className="evo-table evo-table-compact">
          <thead>
            <tr>
              <th>Time</th>
              <th>Session</th>
              <th>Direction</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r, idx) => (
              <tr key={String(r.id ?? idx)}>
                <td className="evo-cell-muted">{timeAgo(r.createdAt)}</td>
                <td className="evo-cell-mono">{r.sessionId ?? '—'}</td>
                <td><span className={`evo-pill evo-pill-xs ${r.direction === 'inbound' ? 'evo-pill-info' : 'evo-pill-good'}`}>{r.direction ?? '—'}</span></td>
                <td className="evo-cell-mono">{r.phone ?? '—'}</td>
                <td><span className={statusPill(r.status ?? 'unknown')}>{r.status ?? '—'}</span></td>
                <td className="evo-cell-muted" style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.text ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ─── ANALYTICS TAB ───────────────────────────────────── */
function AnalyticsTab({ data }: { data: OverviewData | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <section className="evo-panel">
        <div className="evo-panel-head">
          <h3 className="evo-panel-title">Analytics</h3>
          <span className="evo-cell-muted">Fresh-install analytics with no fake numbers.</span>
        </div>
        <div className="evo-stat-grid">
          <MiniStat label="Runtime Msg 24h" value={data?.stats.messages24h ?? 0} tone="amber" />
          <MiniStat label="Baileys DB Msg 24h" value={data?.stats.dbMessages24h ?? 0} />
          <MiniStat label="DB Events" value={data?.stats.dbEvents ?? 0} />
          <MiniStat label="Send Logs" value={data?.stats.dbSendLogs ?? 0} />
        </div>
      </section>

      <section className="evo-panel">
        <div className="evo-panel-head">
          <h3 className="evo-panel-title">Recent Send Logs</h3>
        </div>
        {(data?.database.sendLogs ?? []).length === 0 ? (
          <div className="evo-empty-row">No send logs yet in the Baileys DB.</div>
        ) : (
          <table className="evo-table evo-table-compact">
            <thead>
              <tr>
                <th>Time</th>
                <th>Tenant</th>
                <th>Session</th>
                <th>API Key</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {(data?.database.sendLogs ?? []).slice(0, 20).map((row) => (
                <tr key={row.id}>
                  <td className="evo-cell-muted">{timeAgo(row.createdAt)}</td>
                  <td className="evo-cell-muted">{row.tenantId ?? 'system'}</td>
                  <td className="evo-cell-mono">{row.sessionId ?? '—'}</td>
                  <td className="evo-cell-mono">{row.apiKeyPrefix ?? '—'}</td>
                  <td className="evo-cell-mono">{row.toNumber ?? '—'}</td>
                  <td><span className={statusPill(row.status)}>{row.status}</span></td>
                  <td className="evo-cell-muted">{row.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/* ─── SETTINGS TAB ────────────────────────────────────── */
function SettingsTab({ data }: { data: OverviewData | null }) {
  const cfg = data?.config;
  return (
    <section className="evo-panel">
      <div className="evo-panel-head">
        <h3 className="evo-panel-title">Settings</h3>
      </div>
      <table className="evo-table evo-table-compact">
        <tbody>
          <tr><td className="evo-cell-muted">Public endpoint</td><td className="evo-cell-mono">{cfg?.publicUrl ?? '—'}</td></tr>
          <tr><td className="evo-cell-muted">Internal backend</td><td className="evo-cell-mono">{cfg?.internalUrl ?? '—'}</td></tr>
          <tr><td className="evo-cell-muted">Runtime</td><td>{cfg?.runtimeLabel ? <span className="evo-pill evo-pill-info">{cfg.runtimeLabel}</span> : '—'}</td></tr>
          <tr><td className="evo-cell-muted">Runtime DB</td><td className="evo-cell-mono">{cfg?.runtimeDatabase ?? '—'}</td></tr>
          <tr><td className="evo-cell-muted">New Baileys DB</td><td className="evo-cell-mono">{cfg?.database ?? '—'}</td></tr>
          <tr><td className="evo-cell-muted">New DB status</td><td><span className={statusPill(cfg?.newDatabaseStatus ?? 'unknown')}>{cfg?.newDatabaseStatus ?? 'unknown'}</span></td></tr>
          <tr><td className="evo-cell-muted">DB URL source</td><td>{cfg?.dbUrlSource ?? '—'}</td></tr>
          <tr><td className="evo-cell-muted">QR mode</td><td>{cfg?.qrEnabled ? <span className={statusPill('active')}>enabled</span> : '—'}</td></tr>
          <tr><td className="evo-cell-muted">Pairing mode</td><td>{cfg?.pairingEnabled ? <span className={statusPill('active')}>enabled</span> : '—'}</td></tr>
          <tr><td className="evo-cell-muted">Runtime configured</td><td>{cfg?.configured ? <span className={statusPill('healthy')}>yes</span> : <span className={statusPill('not_configured')}>no</span>}</td></tr>
          <tr><td className="evo-cell-muted">Central API key integration</td><td>via Developer Platform → API Keys (service: <code>whatsapp</code>)</td></tr>
          <tr><td className="evo-cell-muted">Schema applied</td><td>{data?.database.status.schemaApplied ? <span className={statusPill('healthy')}>yes</span> : <span className={statusPill('degraded')}>no</span>}</td></tr>
          <tr><td className="evo-cell-muted">Missing tables</td><td>{(data?.database.status.missingTables ?? []).join(', ') || 'none'}</td></tr>
        </tbody>
      </table>
      <div className="evo-preview" style={{ marginTop: '0.7rem' }}>
        {cfg?.cutoverBlocker ?? '—'}
      </div>
      <p className="evo-cell-muted" style={{ marginTop: '0.6rem', fontSize: '0.78rem' }}>
        Secrets are managed via portal env (<code>WA_API_KEY</code>, <code>WA_URL</code>, <code>BAILEYS_DATABASE_URL</code>) and never displayed here.
      </p>
    </section>
  );
}

// Suppress unused-var lint when build strict
void useMemo;
