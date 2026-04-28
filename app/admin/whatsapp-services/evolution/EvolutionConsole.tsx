'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

/* ─── Types ───────────────────────────────────────────── */
type Tab = 'overview' | 'instances' | 'tenants' | 'sessions' | 'webhooks' | 'templates' | 'messages' | 'analytics' | 'settings';

interface EvolutionConfig {
  configured: boolean; baseUrl: string | null;
  hasAdminKey: boolean; hasGlobalKey: boolean;
  webhookBase: string | null; adminKeyMask: string | null;
}
interface OverviewStats {
  totalInstances: number; activeInstances: number; stoppedInstances: number;
  activeSessions: number; connectingSessions: number; disconnectedSessions: number;
  expiredSessions: number; totalSessions: number;
  totalTenants: number; newTenantsThisWeek: number;
  messages24h: number; messages24hDelta: number | null;
  uptimePercent: number | null;
}
interface Instance {
  id: string; name: string; slug: string; internalUrl: string; publicUrl: string | null;
  status: 'active' | 'stopped' | 'error' | 'maintenance' | 'unknown';
  version: string | null; region: string | null; notes: string | null;
  lastHealthCheckAt: string | null; lastHealthStatus: string | null;
  createdAt: string; updatedAt: string;
}
interface Session {
  id: string; instanceId: string | null; tenantId: string | null;
  sessionName: string; phoneNumber: string | null;
  status: 'connected' | 'connecting' | 'disconnected' | 'expired' | 'error' | 'qr_pending';
  qrStatus: string | null; lastConnectedAt: string | null; lastMessageAt: string | null;
  createdAt: string; updatedAt: string;
}
interface SessionQrResponse {
  ok: boolean;
  qr?: string | null;
  qrCode?: string | null;
  pairingCode?: string | null;
  qrCount?: number | null;
  state?: string | null;
  detail?: string | null;
  connected?: boolean;
  waitRecommended?: boolean;
  error?: string | null;
}
interface TenantBinding {
  id: string; tenantId: string; tenantName: string | null; tenantDomain: string | null;
  instanceId: string | null;
  plan: 'trial' | 'starter' | 'pro' | 'business' | 'enterprise';
  status: 'active' | 'suspended' | 'pending';
  createdAt: string; updatedAt: string;
}
interface Webhook {
  id: string; tenantId: string | null; instanceId: string | null; sessionId: string | null;
  label: string | null; url: string; events: string[];
  secretPrefix: string | null;
  status: 'active' | 'paused' | 'failing';
  lastDeliveryAt: string | null; lastDeliveryStatus: number | null; lastError: string | null;
  deliveryCount: number; failureCount: number;
}
interface Template {
  id: string; tenantId: string | null; name: string;
  category: string | null; language: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'archived';
  body: string; variables: string[];
  createdByEmail: string | null; createdAt: string; updatedAt: string;
}
interface MessageLog {
  id: string; tenantId: string | null; sessionId: string | null;
  direction: 'inbound' | 'outbound'; toNumber: string | null; fromNumber: string | null;
  messageType: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  preview: string | null; errorCode: string | null; createdAt: string;
}
interface EventLog {
  id: string; eventType: string; severity: string; summary: string | null;
  actorEmail: string | null; tenantId: string | null; instanceId: string | null;
  sessionId: string | null; createdAt: string;
}
interface SystemHealthItem { label: string; status: 'healthy' | 'degraded' | 'unknown' | 'not_configured'; detail?: string }
interface OverviewResponse {
  config: EvolutionConfig; stats: OverviewStats;
  instances: Instance[]; tenants: TenantBinding[]; events: EventLog[];
  systemHealth: SystemHealthItem[];
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'instances', label: 'Instances' },
  { id: 'tenants', label: 'Tenants' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'templates', label: 'Templates' },
  { id: 'messages', label: 'Messages' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings' },
];

/* ─── Helpers ─────────────────────────────────────────── */
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime(); if (!Number.isFinite(d)) return '—';
  const sec = Math.round((Date.now() - d) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.round(sec / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function fmtNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}
function statusBadge(status: string): string {
  const s = status.toLowerCase();
  if (['active', 'connected', 'healthy', 'approved', 'sent', 'delivered', 'read'].includes(s)) return 'evo-pill evo-pill-good';
  if (['connecting', 'qr_pending', 'pending', 'queued', 'rotating'].includes(s)) return 'evo-pill evo-pill-info';
  if (['stopped', 'disconnected', 'paused', 'archived', 'received', 'draft'].includes(s)) return 'evo-pill evo-pill-muted';
  if (['error', 'failed', 'failing', 'rejected', 'expired', 'degraded'].includes(s)) return 'evo-pill evo-pill-bad';
  return 'evo-pill evo-pill-muted';
}
function planBadge(plan: string): string {
  const p = plan.toLowerCase();
  if (p === 'business' || p === 'enterprise') return 'evo-pill evo-pill-violet';
  if (p === 'pro') return 'evo-pill evo-pill-cyan';
  if (p === 'starter') return 'evo-pill evo-pill-good';
  return 'evo-pill evo-pill-amber';
}

function formatQrState(state: string | null | undefined): string {
  if (!state) return 'Unknown';
  if (state === 'open') return 'Connected';
  if (state === 'close') return 'Closed';
  if (state === 'qr') return 'QR Ready';
  return state.charAt(0).toUpperCase() + state.slice(1);
}

const QR_POLL_INTERVAL_MS = 2500;
const QR_POLL_MAX_ATTEMPTS = 20;

function getQrPollStatus(
  result: SessionQrResponse,
  current?: { qr: string | null; pairing: string | null; qrCodeText: string | null },
) {
  if (result.connected || result.state === 'open') return 'connected' as const;
  if (result.qr || result.pairingCode || result.qrCode || current?.qr || current?.pairing || current?.qrCodeText) {
    return 'ready' as const;
  }
  if (result.waitRecommended) return 'waiting_qr' as const;
  return 'failed' as const;
}

/* ─── Top-level component ─────────────────────────────── */
export function EvolutionConsole() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/evolution', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setOverview(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void reloadOverview(); }, [reloadOverview]);

  return (
    <div className="evo-shell">
      <EvolutionHeader config={overview?.config ?? null} onCreateInstance={() => setTab('instances')} />

      <div className="evo-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`evo-tab${tab === t.id ? ' evo-tab-active' : ''}`}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && tab === 'overview' ? <div className="evo-error">⚠ {error}</div> : null}

      <div className="evo-tabpanel">
        {tab === 'overview' && <OverviewTab data={overview} loading={loading} onRefresh={reloadOverview} />}
        {tab === 'instances' && <InstancesTab onChange={reloadOverview} />}
        {tab === 'tenants' && <TenantsTab onChange={reloadOverview} />}
        {tab === 'sessions' && <SessionsTab onChange={reloadOverview} />}
        {tab === 'webhooks' && <WebhooksTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>

      <EvolutionStyles />
    </div>
  );
}

/* ─── Header ──────────────────────────────────────────── */
function EvolutionHeader({ config, onCreateInstance }: { config: EvolutionConfig | null; onCreateInstance: () => void }) {
  return (
    <header className="evo-page-head">
      <div className="evo-breadcrumb">
        <span className="evo-crumb-muted">Service Endpoints</span>
        <span className="evo-crumb-sep">/</span>
        <span className="evo-crumb-active">Evolution Gateway</span>
      </div>
      <div className="evo-page-head-row">
        <div>
          <h1 className="evo-title">Evolution WhatsApp Gateway</h1>
          <p className="evo-subtitle">Multi-tenant WhatsApp gateway powered by Evolution API</p>
          {config && !config.configured ? (
            <div className="evo-banner evo-banner-warn">
              ⚠ Evolution backend not configured.
              {' '}Set <code>EVOLUTION_API_URL</code> and <code>EVOLUTION_API_KEY</code> on the portal env.
            </div>
          ) : null}
        </div>
        <div className="evo-head-actions">
          <a href="/admin/whatsapp-services/evolution/docs" className="evo-btn evo-btn-ghost">
            <span className="evo-btn-ico">⌨</span> API Docs
          </a>
          <button type="button" className="evo-btn evo-btn-ghost" onClick={() => window.open('/api/admin/evolution/logs', '_blank', 'noopener')}>
            <span className="evo-btn-ico">▤</span> View Logs
          </button>
          <button type="button" className="evo-btn evo-btn-primary" onClick={onCreateInstance}>
            <span className="evo-btn-ico">＋</span> Create Instance
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─── OVERVIEW TAB ────────────────────────────────────── */
function OverviewTab({ data, loading, onRefresh }: { data: OverviewResponse | null; loading: boolean; onRefresh: () => void }) {
  if (loading && !data) return <div className="evo-empty">Loading…</div>;
  if (!data) return <div className="evo-empty">No data.</div>;

  const { stats, instances, tenants, events, systemHealth } = data;

  const sessionTotal = stats.totalSessions;
  const segs = [
    { key: 'connected', label: 'Connected', value: stats.activeSessions, tone: 'good' },
    { key: 'connecting', label: 'Connecting', value: stats.connectingSessions, tone: 'info' },
    { key: 'disconnected', label: 'Disconnected', value: stats.disconnectedSessions, tone: 'bad' },
    { key: 'expired', label: 'Expired', value: stats.expiredSessions, tone: 'muted' },
  ];

  return (
    <div className="evo-overview">
      <div className="evo-stat-grid">
        <StatCard label="TOTAL INSTANCES" value={fmtNumber(stats.totalInstances)} sub={`${stats.activeInstances} Active · ${stats.stoppedInstances} Stopped`} icon="◫" />
        <StatCard label="ACTIVE SESSIONS" value={fmtNumber(stats.activeSessions)} sub={stats.totalSessions > 0 ? `${stats.totalSessions} total` : 'No sessions yet'} icon="▤" tone="good" />
        <StatCard label="TOTAL TENANTS" value={fmtNumber(stats.totalTenants)} sub={stats.newTenantsThisWeek > 0 ? `+${stats.newTenantsThisWeek} this week` : 'No new this week'} icon="⌬" />
        <StatCard label="MESSAGES (24h)" value={fmtNumber(stats.messages24h)} sub={stats.messages24hDelta != null ? `${stats.messages24hDelta >= 0 ? '+' : ''}${stats.messages24hDelta}% vs prev` : 'No prior data'} icon="✉" tone="amber" />
        <StatCard label="UPTIME (ALL)" value={stats.uptimePercent != null ? `${(stats.uptimePercent * 100).toFixed(2)}%` : '—'} sub={stats.uptimePercent != null ? (stats.uptimePercent >= 0.99 ? 'Excellent' : stats.uptimePercent >= 0.95 ? 'Good' : 'Degraded') : 'No probes yet'} icon="◐" tone="good" />
      </div>

      <div className="evo-grid-2">
        <section className="evo-panel evo-panel-fill">
          <div className="evo-panel-head">
            <h3 className="evo-panel-title">Evolution Instances</h3>
            <button type="button" className="evo-btn evo-btn-ghost evo-btn-xs" onClick={onRefresh}>↻ Refresh</button>
          </div>
          {instances.length === 0 ? (
            <div className="evo-empty-row">No instances configured. Use “Create Instance” to add one.</div>
          ) : (
            <table className="evo-table">
              <thead><tr><th>NAME</th><th>STATUS</th><th>HEALTH</th><th>UPDATED</th></tr></thead>
              <tbody>
                {instances.slice(0, 6).map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="evo-cell-strong">{i.name}</div>
                      <div className="evo-cell-muted">{new URL(i.internalUrl, 'http://x/').hostname}</div>
                    </td>
                    <td><span className={statusBadge(i.status)}>{i.status}</span></td>
                    <td>{i.lastHealthStatus ?? '—'}</td>
                    <td className="evo-cell-muted">{timeAgo(i.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">Session Status</h3>
          <SessionDonut total={sessionTotal} segments={segs} />
        </section>
      </div>

      <div className="evo-grid-3">
        <section className="evo-panel">
          <h3 className="evo-panel-title">Tenant Overview</h3>
          {tenants.length === 0 ? (
            <div className="evo-empty-row">No tenants bound yet.</div>
          ) : (
            <table className="evo-table evo-table-compact">
              <thead><tr><th>TENANT</th><th>PLAN</th><th>STATUS</th></tr></thead>
              <tbody>
                {tenants.slice(0, 6).map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="evo-cell-strong">{t.tenantName ?? t.tenantId.slice(0, 8)}</div>
                      <div className="evo-cell-muted">{t.tenantDomain ?? '—'}</div>
                    </td>
                    <td><span className={planBadge(t.plan)}>{t.plan}</span></td>
                    <td><span className={statusBadge(t.status)}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">Recent Activity</h3>
          {events.length === 0 ? (
            <div className="evo-empty-row">No recent events.</div>
          ) : (
            <ul className="evo-activity">
              {events.map((e) => (
                <li key={e.id} className={`evo-activity-row evo-activity-${e.severity}`}>
                  <div className="evo-activity-dot" aria-hidden="true" />
                  <div className="evo-activity-body">
                    <div className="evo-activity-title">{e.summary ?? e.eventType}</div>
                    <div className="evo-activity-meta">{e.eventType} · {e.actorEmail ?? 'system'}</div>
                  </div>
                  <div className="evo-activity-time">{timeAgo(e.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">System Health</h3>
          <ul className="evo-health-list">
            {systemHealth.map((h) => (
              <li key={h.label} className="evo-health-row">
                <span className="evo-health-label">{h.label}</span>
                <span className={statusBadge(h.status)}>
                  {h.status === 'healthy' ? 'Healthy ✓' : h.status === 'degraded' ? 'Degraded' : h.status === 'not_configured' ? 'Not configured' : 'Unknown'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: string; tone?: 'good' | 'amber' | 'bad' }) {
  return (
    <section className="evo-stat">
      <div className="evo-stat-head">
        <span className="evo-stat-label">{label}</span>
        <span className="evo-stat-icon">{icon}</span>
      </div>
      <div className={`evo-stat-value${tone ? ` evo-stat-value-${tone}` : ''}`}>{value}</div>
      {sub ? <div className="evo-stat-sub">{sub}</div> : null}
    </section>
  );
}

function SessionDonut({ total, segments }: { total: number; segments: Array<{ key: string; label: string; value: number; tone: string }> }) {
  if (total === 0) {
    return (
      <div className="evo-donut-wrap">
        <div className="evo-donut evo-donut-empty"><span className="evo-donut-num">0</span><span className="evo-donut-tot">Total</span></div>
        <ul className="evo-legend">{segments.map((s) => <li key={s.key}><span className={`evo-legend-dot evo-legend-${s.tone}`} />{s.label} <strong>{s.value}</strong></li>)}</ul>
      </div>
    );
  }
  const colors: Record<string, string> = { good: '#22c55e', info: '#eab308', bad: '#ef4444', muted: '#94a3b8' };
  let cum = 0;
  const stops = segments.map((s) => {
    const start = (cum / total) * 360; cum += s.value;
    const end = (cum / total) * 360;
    return `${colors[s.tone] ?? '#888'} ${start}deg ${end}deg`;
  }).join(', ');
  return (
    <div className="evo-donut-wrap">
      <div className="evo-donut" style={{ background: `conic-gradient(${stops})` }}>
        <div className="evo-donut-hole">
          <span className="evo-donut-num">{total}</span>
          <span className="evo-donut-tot">Total</span>
        </div>
      </div>
      <ul className="evo-legend">
        {segments.map((s) => (
          <li key={s.key}><span className={`evo-legend-dot evo-legend-${s.tone}`} />{s.label} <strong>{s.value}</strong> {total > 0 ? <span className="evo-cell-muted">({Math.round((s.value / total) * 100)}%)</span> : null}</li>
        ))}
      </ul>
    </div>
  );
}

/* ─── INSTANCES TAB ────────────────────────────────────── */
function InstancesTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', internalUrl: 'http://evolution-api:8080', region: '', notes: '' });
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/evolution/instances', { cache: 'no-store' });
      const j = await r.json();
      setRows(j.instances ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    startTransition(async () => {
      const r = await fetch('/api/admin/evolution/instances', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) { setErr((await r.json()).error ?? 'failed'); return; }
      setShowCreate(false);
      setForm({ name: '', slug: '', internalUrl: 'http://evolution-api:8080', region: '', notes: '' });
      await reload(); onChange();
    });
  }

  async function action(id: string, a: 'health' | 'start' | 'stop' | 'restart') {
    if ((a === 'stop' || a === 'restart') && !confirm(`Confirm ${a} for this instance?`)) return;
    await fetch(`/api/admin/evolution/instances/${id}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: a }),
    });
    await reload(); onChange();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete instance "${name}"? This is irreversible.`)) return;
    await fetch(`/api/admin/evolution/instances/${id}`, { method: 'DELETE' });
    await reload(); onChange();
  }

  return (
    <section className="evo-panel evo-panel-fill">
      <div className="evo-panel-head">
        <h3 className="evo-panel-title">Instances</h3>
        <button type="button" className="evo-btn evo-btn-primary evo-btn-xs" onClick={() => setShowCreate((v) => !v)}>＋ New Instance</button>
      </div>

      {showCreate && (
        <form className="evo-form-inline" onSubmit={submit}>
          <input className="evo-input" placeholder="Name (e.g. evo-main-01)" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="evo-input" placeholder="Slug (auto if blank)" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
          <input className="evo-input" placeholder="Internal URL (http://evolution-api:8080)" required value={form.internalUrl} onChange={(e) => setForm((f) => ({ ...f, internalUrl: e.target.value }))} />
          <input className="evo-input" placeholder="Region" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
          <button className="evo-btn evo-btn-primary evo-btn-xs" disabled={busy} type="submit">Create</button>
          <button className="evo-btn evo-btn-ghost evo-btn-xs" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          {err ? <div className="evo-form-err">{err}</div> : null}
        </form>
      )}

      {loading ? <div className="evo-empty">Loading…</div> : rows.length === 0 ? (
        <div className="evo-empty-row">No instances configured.</div>
      ) : (
        <table className="evo-table">
          <thead><tr><th>NAME</th><th>URL</th><th>STATUS</th><th>HEALTH</th><th>UPDATED</th><th>ACTIONS</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="evo-cell-strong">{i.name}</div>
                  <div className="evo-cell-muted">{i.slug}</div>
                </td>
                <td className="evo-cell-mono">{i.internalUrl}</td>
                <td><span className={statusBadge(i.status)}>{i.status}</span></td>
                <td>{i.lastHealthStatus ?? '—'} <span className="evo-cell-muted">{timeAgo(i.lastHealthCheckAt)}</span></td>
                <td className="evo-cell-muted">{timeAgo(i.updatedAt)}</td>
                <td>
                  <div className="evo-row-actions">
                    <button className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => action(i.id, 'health')}>↻ Probe</button>
                    <button className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => action(i.id, i.status === 'stopped' ? 'start' : 'stop')}>{i.status === 'stopped' ? 'Start' : 'Stop'}</button>
                    <button className="evo-btn evo-btn-bad evo-btn-xs" onClick={() => remove(i.id, i.name)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ─── TENANTS TAB ──────────────────────────────────────── */
function TenantsTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<TenantBinding[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ tenantId: '', tenantName: '', tenantDomain: '', instanceId: '', plan: 'trial', status: 'active' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const reload = useCallback(async () => {
    setLoading(true);
    const [t, i] = await Promise.all([
      fetch('/api/admin/evolution/tenants', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/admin/evolution/instances', { cache: 'no-store' }).then((r) => r.json()),
    ]);
    setRows(t.tenants ?? []);
    setInstances(i.instances ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    startTransition(async () => {
      const r = await fetch('/api/admin/evolution/tenants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, instanceId: form.instanceId || null }),
      });
      if (!r.ok) { setErr((await r.json()).error ?? 'failed'); return; }
      setForm({ tenantId: '', tenantName: '', tenantDomain: '', instanceId: '', plan: 'trial', status: 'active' });
      await reload(); onChange();
    });
  }

  return (
    <div className="evo-grid-2-1">
      <section className="evo-panel evo-panel-fill">
        <div className="evo-panel-head"><h3 className="evo-panel-title">Tenant Bindings</h3></div>
        {loading ? <div className="evo-empty">Loading…</div> : rows.length === 0 ? (
          <div className="evo-empty-row">No tenants bound. Use the form to assign a tenant to an instance.</div>
        ) : (
          <table className="evo-table">
            <thead><tr><th>TENANT</th><th>INSTANCE</th><th>PLAN</th><th>STATUS</th><th>UPDATED</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="evo-cell-strong">{t.tenantName ?? t.tenantId.slice(0, 8)}</div>
                    <div className="evo-cell-muted">{t.tenantDomain ?? t.tenantId}</div>
                  </td>
                  <td>{instances.find((i) => i.id === t.instanceId)?.name ?? <span className="evo-cell-muted">—</span>}</td>
                  <td><span className={planBadge(t.plan)}>{t.plan}</span></td>
                  <td><span className={statusBadge(t.status)}>{t.status}</span></td>
                  <td className="evo-cell-muted">{timeAgo(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="evo-panel">
        <h3 className="evo-panel-title">Bind / Update Tenant</h3>
        <form className="evo-form-vert" onSubmit={submit}>
          <label className="evo-label">Tenant ID (UUID)
            <input className="evo-input" required pattern="[0-9a-fA-F-]{32,40}" value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))} />
          </label>
          <label className="evo-label">Display name
            <input className="evo-input" value={form.tenantName} onChange={(e) => setForm((f) => ({ ...f, tenantName: e.target.value }))} />
          </label>
          <label className="evo-label">Domain
            <input className="evo-input" placeholder="abc.com.my" value={form.tenantDomain} onChange={(e) => setForm((f) => ({ ...f, tenantDomain: e.target.value }))} />
          </label>
          <label className="evo-label">Instance
            <select className="evo-input" value={form.instanceId} onChange={(e) => setForm((f) => ({ ...f, instanceId: e.target.value }))}>
              <option value="">— None —</option>
              {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <div className="evo-form-row">
            <label className="evo-label">Plan
              <select className="evo-input" value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}>
                {['trial', 'starter', 'pro', 'business', 'enterprise'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="evo-label">Status
              <select className="evo-input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {['active', 'suspended', 'pending'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <button className="evo-btn evo-btn-primary" disabled={busy} type="submit">Save Binding</button>
          {err ? <div className="evo-form-err">{err}</div> : null}
        </form>
      </section>
    </div>
  );
}

/* ─── SESSIONS TAB ─────────────────────────────────────── */
function SessionsTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Session[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ instanceId: string; status: string; tenantId: string }>({ instanceId: '', status: '', tenantId: '' });
  const [form, setForm] = useState({ sessionName: '', instanceId: '', tenantId: '', phoneNumber: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [busy, startTransition] = useTransition();
  const [qrModal, setQrModal] = useState<{
    id: string;
    sessionName: string;
    instanceName: string;
    provider: string;
    qr: string | null;
    qrCodeText: string | null;
    pairing: string | null;
    detail: string | null;
    state: string | null;
    lastCheckedAt: string;
    pollAttempt: number;
    pollStatus: 'connecting' | 'waiting_qr' | 'ready' | 'connected' | 'timeout' | 'failed';
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.instanceId) params.set('instanceId', filter.instanceId);
    if (filter.status) params.set('status', filter.status);
    if (filter.tenantId) params.set('tenantId', filter.tenantId);
    const [s, i] = await Promise.all([
      fetch(`/api/admin/evolution/sessions?${params}`, { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/admin/evolution/instances', { cache: 'no-store' }).then((r) => r.json()),
    ]);
    setRows(s.sessions ?? []);
    setInstances(i.instances ?? []);
    setLoading(false);
  }, [filter]);
  useEffect(() => { void reload(); }, [reload]);

  async function requestQr(id: string, actionName: 'connect' | 'reconnect' | 'qr'): Promise<SessionQrResponse> {
    const response = await fetch(`/api/admin/evolution/sessions/${id}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: actionName }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        typeof json?.detail === 'string'
          ? json.detail
          : typeof json?.error === 'string'
            ? json.error
            : `Failed (${response.status})`,
      );
    }
    return json as SessionQrResponse;
  }

  useEffect(() => {
    if (!qrModal) return;
    if (qrModal.pollStatus === 'connecting' || qrModal.pollStatus === 'connected' || qrModal.pollStatus === 'failed' || qrModal.pollStatus === 'timeout') return;
    if (qrModal.pollAttempt >= QR_POLL_MAX_ATTEMPTS) {
      setQrModal((current) => current && current.id === qrModal.id ? {
        ...current,
        pollStatus: 'timeout',
        detail: current.qr || current.pairing || current.qrCodeText
          ? 'Timed out waiting for the session to finish connecting. Retry to request a fresh QR.'
          : 'Timed out waiting for Evolution to emit a QR code.',
      } : current);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const result = await requestQr(qrModal.id, 'qr');
        setQrModal((current) => {
          if (!current || current.id !== qrModal.id) return current;
          const nextAttempt = current.pollAttempt + 1;
          return {
            ...current,
            qr: result.qr ?? current.qr,
            qrCodeText: result.qrCode ?? current.qrCodeText,
            pairing: result.pairingCode ?? current.pairing,
            detail: result.detail ?? current.detail,
            state: result.state ?? current.state,
            lastCheckedAt: new Date().toISOString(),
            pollAttempt: nextAttempt,
            pollStatus: getQrPollStatus(result, current),
          };
        });
        await reload();
        onChange();
      } catch (pollError) {
        setQrModal((current) => current && current.id === qrModal.id ? {
          ...current,
          pollStatus: 'failed',
          detail: pollError instanceof Error ? pollError.message : 'Failed to poll QR status.',
          lastCheckedAt: new Date().toISOString(),
        } : current);
      }
    }, QR_POLL_INTERVAL_MS);

    return () => window.clearTimeout(timeout);
  }, [onChange, qrModal, reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    startTransition(async () => {
      const r = await fetch('/api/admin/evolution/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, tenantId: form.tenantId || null, phoneNumber: form.phoneNumber || null,
        }),
      });
      if (!r.ok) { setErr((await r.json()).error ?? 'failed'); return; }
      setForm({ sessionName: '', instanceId: '', tenantId: '', phoneNumber: '' });
      setShowCreate(false);
      await reload(); onChange();
    });
  }

  async function action(id: string, a: 'connect' | 'reconnect' | 'disconnect' | 'qr') {
    if (a === 'disconnect' && !confirm('Disconnect this session?')) return;
    if (a === 'connect' || a === 'reconnect' || a === 'qr') {
      const session = rows.find((row) => row.id === id);
      const instance = instances.find((row) => row.id === session?.instanceId);
      setQrModal({
        id,
        sessionName: session?.sessionName ?? 'Unknown session',
        instanceName: instance?.name ?? 'Unknown instance',
        provider: 'Evolution API',
        qr: null,
        qrCodeText: null,
        pairing: null,
        detail: 'Connecting to Evolution…',
        state: 'connecting',
        lastCheckedAt: new Date().toISOString(),
        pollAttempt: 0,
        pollStatus: 'connecting',
      });
      try {
        const result = await requestQr(id, a);
        setQrModal((current) => current && current.id === id ? {
          ...current,
          qr: result.qr ?? current.qr,
          qrCodeText: result.qrCode ?? current.qrCodeText,
          pairing: result.pairingCode ?? current.pairing,
          detail: result.detail ?? (result.waitRecommended ? 'Waiting for Evolution to emit QR…' : current.detail),
          state: result.state ?? current.state,
          lastCheckedAt: new Date().toISOString(),
          pollAttempt: 0,
          pollStatus: getQrPollStatus(result, current),
        } : current);
      } catch (actionError) {
        setQrModal((current) => current && current.id === id ? {
          ...current,
          pollStatus: 'failed',
          detail: actionError instanceof Error ? actionError.message : 'Failed to request QR.',
          lastCheckedAt: new Date().toISOString(),
        } : current);
      }
      await reload();
      onChange();
      return;
    } else {
      const response = await fetch(`/api/admin/evolution/sessions/${id}/actions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: a }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setErr(typeof payload?.detail === 'string' ? payload.detail : typeof payload?.error === 'string' ? payload.error : 'Action failed');
        return;
      }
    }
    await reload(); onChange();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete session "${name}"? This is irreversible.`)) return;
    await fetch(`/api/admin/evolution/sessions/${id}`, { method: 'DELETE' });
    await reload(); onChange();
  }

  return (
    <section className="evo-panel evo-panel-fill">
      <div className="evo-panel-head">
        <h3 className="evo-panel-title">WhatsApp Sessions</h3>
        <div className="evo-row-actions">
          <select className="evo-input evo-input-sm" value={filter.instanceId} onChange={(e) => setFilter((f) => ({ ...f, instanceId: e.target.value }))}>
            <option value="">All instances</option>
            {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select className="evo-input evo-input-sm" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            {['connected', 'connecting', 'qr_pending', 'disconnected', 'expired', 'error'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" className="evo-btn evo-btn-primary evo-btn-xs" onClick={() => setShowCreate((v) => !v)}>＋ New Session</button>
        </div>
      </div>

      {showCreate && (
        <form className="evo-form-inline" onSubmit={submit}>
          <input className="evo-input" required placeholder="Session name" value={form.sessionName} onChange={(e) => setForm((f) => ({ ...f, sessionName: e.target.value }))} />
          <select className="evo-input" required value={form.instanceId} onChange={(e) => setForm((f) => ({ ...f, instanceId: e.target.value }))}>
            <option value="">Choose instance…</option>
            {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input className="evo-input" placeholder="Tenant ID (optional)" value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))} />
          <input className="evo-input" placeholder="Phone (optional, +60…)" value={form.phoneNumber} onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))} />
          <button className="evo-btn evo-btn-primary evo-btn-xs" type="submit" disabled={busy}>Create</button>
          <button className="evo-btn evo-btn-ghost evo-btn-xs" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          {err ? <div className="evo-form-err">{err}</div> : null}
        </form>
      )}

      {loading ? <div className="evo-empty">Loading…</div> : rows.length === 0 ? (
        <div className="evo-empty-row">No sessions yet.</div>
      ) : (
        <table className="evo-table">
          <thead><tr><th>SESSION</th><th>PHONE</th><th>STATUS</th><th>LAST CONNECTED</th><th>LAST MSG</th><th>ACTIONS</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="evo-cell-strong">{s.sessionName}</div>
                  <div className="evo-cell-muted">{s.tenantId ? s.tenantId.slice(0, 8) : '—'}</div>
                </td>
                <td className="evo-cell-mono">{s.phoneNumber ?? '—'}</td>
                <td><span className={statusBadge(s.status)}>{s.status}</span></td>
                <td className="evo-cell-muted">{timeAgo(s.lastConnectedAt)}</td>
                <td className="evo-cell-muted">{timeAgo(s.lastMessageAt)}</td>
                <td>
                  <div className="evo-row-actions">
                    <button type="button" className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => { void action(s.id, 'qr'); }}>QR</button>
                    <button type="button" className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => { void action(s.id, 'reconnect'); }}>Reconnect</button>
                    <button type="button" className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => { void action(s.id, 'disconnect'); }}>Disconnect</button>
                    <button type="button" className="evo-btn evo-btn-bad evo-btn-xs" onClick={() => { void remove(s.id, s.sessionName); }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {qrModal && (
        <div className="evo-modal-back" onClick={() => setQrModal(null)}>
          <div className="evo-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="evo-panel-title">Connect WhatsApp Session</h3>
            <div className="evo-qr-meta">
              <div><strong>Session:</strong> {qrModal.sessionName}</div>
              <div><strong>Provider:</strong> {qrModal.provider}</div>
              <div><strong>Instance:</strong> {qrModal.instanceName}</div>
              <div><strong>State:</strong> {formatQrState(qrModal.state)}</div>
              <div><strong>Last checked:</strong> {timeAgo(qrModal.lastCheckedAt)}</div>
              <div><strong>Polling:</strong> {qrModal.pollStatus === 'waiting_qr' || qrModal.pollStatus === 'ready' ? `Attempt ${qrModal.pollAttempt}/${QR_POLL_MAX_ATTEMPTS}` : qrModal.pollStatus}</div>
            </div>
            {qrModal.qr ? (
              <img alt="QR code" src={qrModal.qr} className="evo-qr" />
            ) : qrModal.pairing ? (
              <div className="evo-pairing">Pairing code: <code>{qrModal.pairing}</code></div>
            ) : qrModal.qrCodeText ? (
              <div className="evo-empty-row">Evolution returned QR payload without an image. Retry to request a fresh QR.</div>
            ) : (
              <div className="evo-empty-row">{qrModal.detail ?? 'No QR returned by backend.'}</div>
            )}
            {qrModal.pollStatus === 'connecting' ? <div className="evo-qr-status">Connecting to Evolution…</div> : null}
            {qrModal.pollStatus === 'connected' ? <div className="evo-qr-status evo-qr-status-good">Session connected.</div> : null}
            {qrModal.pollStatus === 'waiting_qr' ? <div className="evo-qr-status">Waiting for Evolution to emit QR…</div> : null}
            {qrModal.pollStatus === 'ready' ? <div className="evo-qr-status">QR ready. Scan it in WhatsApp Linked Devices. The portal will keep checking for connection.</div> : null}
            {qrModal.pollStatus === 'timeout' ? <div className="evo-qr-status evo-qr-status-bad">Timed out waiting for QR or connection confirmation. Retry to request a fresh check.</div> : null}
            {qrModal.pollStatus === 'failed' ? <div className="evo-qr-status evo-qr-status-bad">{qrModal.detail ?? 'QR polling failed.'}</div> : null}
            <div className="evo-row-actions evo-row-actions-end">
              <button
                className="evo-btn evo-btn-primary"
                type="button"
                onClick={() => { void action(qrModal.id, 'qr'); }}
                disabled={qrModal.pollStatus === 'connecting'}
              >
                Retry QR
              </button>
            <button className="evo-btn evo-btn-ghost" type="button" onClick={() => setQrModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── WEBHOOKS TAB ─────────────────────────────────────── */
function WebhooksTab() {
  const [rows, setRows] = useState<Webhook[]>([]);
  const [allowedEvents, setAllowedEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ label: '', url: '', tenantId: '', events: new Set<string>() });
  const [createdSecret, setCreatedSecret] = useState<{ id: string; secret: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/evolution/webhooks', { cache: 'no-store' });
    const j = await r.json();
    setRows(j.webhooks ?? []); setAllowedEvents(j.allowedEvents ?? []); setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    startTransition(async () => {
      const r = await fetch('/api/admin/evolution/webhooks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: form.label || null, url: form.url,
          tenantId: form.tenantId || null,
          events: Array.from(form.events),
        }),
      });
      if (!r.ok) { setErr((await r.json()).error ?? 'failed'); return; }
      const j = await r.json();
      setCreatedSecret({ id: j.webhook.id, secret: j.secret });
      setForm({ label: '', url: '', tenantId: '', events: new Set() });
      await reload();
    });
  }

  async function test(id: string) {
    const r = await fetch(`/api/admin/evolution/webhooks/${id}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test' }),
    });
    const j = await r.json();
    alert(j.ok ? `OK (${j.status} in ${j.latencyMs}ms)` : `Failed: ${j.error ?? `HTTP ${j.status}`}`);
    await reload();
  }
  async function rotate(id: string) {
    if (!confirm('Rotate secret? Old secret will stop working.')) return;
    const r = await fetch(`/api/admin/evolution/webhooks/${id}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rotate-secret' }),
    });
    const j = await r.json();
    if (j.ok) setCreatedSecret({ id, secret: j.secret });
    await reload();
  }
  async function remove(id: string) {
    if (!confirm('Delete this webhook?')) return;
    await fetch(`/api/admin/evolution/webhooks/${id}`, { method: 'DELETE' });
    await reload();
  }

  return (
    <div className="evo-grid-2-1">
      <section className="evo-panel evo-panel-fill">
        <h3 className="evo-panel-title">Webhooks</h3>
        {loading ? <div className="evo-empty">Loading…</div> : rows.length === 0 ? (
          <div className="evo-empty-row">No webhooks configured.</div>
        ) : (
          <table className="evo-table">
            <thead><tr><th>LABEL / URL</th><th>EVENTS</th><th>STATUS</th><th>LAST DELIVERY</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td>
                    <div className="evo-cell-strong">{w.label ?? new URL(w.url).hostname}</div>
                    <div className="evo-cell-mono evo-cell-muted">{w.url}</div>
                  </td>
                  <td>{w.events.map((e) => <span key={e} className="evo-pill evo-pill-info evo-pill-xs">{e}</span>)}</td>
                  <td><span className={statusBadge(w.status)}>{w.status}</span></td>
                  <td className="evo-cell-muted">{timeAgo(w.lastDeliveryAt)} {w.lastDeliveryStatus ? `· ${w.lastDeliveryStatus}` : ''}</td>
                  <td>
                    <div className="evo-row-actions">
                      <button className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => test(w.id)}>Test</button>
                      <button className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => rotate(w.id)}>Rotate</button>
                      <button className="evo-btn evo-btn-bad evo-btn-xs" onClick={() => remove(w.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="evo-panel">
        <h3 className="evo-panel-title">Create Webhook</h3>
        <form className="evo-form-vert" onSubmit={submit}>
          <label className="evo-label">Label
            <input className="evo-input" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          </label>
          <label className="evo-label">URL
            <input className="evo-input" type="url" required value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
          </label>
          <label className="evo-label">Tenant ID (optional)
            <input className="evo-input" value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))} />
          </label>
          <fieldset className="evo-fieldset">
            <legend>Events</legend>
            {allowedEvents.map((ev) => (
              <label key={ev} className="evo-checkbox">
                <input type="checkbox" checked={form.events.has(ev)} onChange={() => {
                  const next = new Set(form.events); next.has(ev) ? next.delete(ev) : next.add(ev);
                  setForm((f) => ({ ...f, events: next }));
                }} />
                {ev}
              </label>
            ))}
          </fieldset>
          <button className="evo-btn evo-btn-primary" type="submit" disabled={busy}>Create</button>
          {err ? <div className="evo-form-err">{err}</div> : null}
        </form>

        {createdSecret && (
          <div className="evo-banner evo-banner-good">
            <strong>Secret (shown once):</strong>
            <code className="evo-cell-mono">{createdSecret.secret}</code>
            <button className="evo-btn evo-btn-ghost evo-btn-xs" type="button" onClick={() => navigator.clipboard?.writeText(createdSecret.secret)}>Copy</button>
            <button className="evo-btn evo-btn-ghost evo-btn-xs" type="button" onClick={() => setCreatedSecret(null)}>Dismiss</button>
          </div>
        )}
      </section>
    </div>
  );
}

/* ─── TEMPLATES TAB ───────────────────────────────────── */
function TemplatesTab() {
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', body: '', category: '', language: 'en', status: 'draft', variables: '' });
  const [busy, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/evolution/templates', { cache: 'no-store' });
    const j = await r.json();
    setRows(j.templates ?? []); setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const variables = form.variables.split(',').map((v) => v.trim()).filter(Boolean);
    startTransition(async () => {
      const r = await fetch('/api/admin/evolution/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, variables }),
      });
      if (!r.ok) { setErr((await r.json()).error ?? 'failed'); return; }
      setForm({ name: '', body: '', category: '', language: 'en', status: 'draft', variables: '' });
      await reload();
    });
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/admin/evolution/templates/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await reload();
  }
  async function remove(id: string) {
    if (!confirm('Delete this template?')) return;
    await fetch(`/api/admin/evolution/templates/${id}`, { method: 'DELETE' });
    await reload();
  }

  const previewText = useMemo(() => {
    if (!form.body) return '';
    let t = form.body;
    form.variables.split(',').forEach((v, idx) => {
      const name = v.trim(); if (!name) return;
      t = t.replaceAll(`{{${name}}}`, `[${name}=sample${idx + 1}]`);
    });
    return t;
  }, [form.body, form.variables]);

  return (
    <div className="evo-grid-2-1">
      <section className="evo-panel evo-panel-fill">
        <h3 className="evo-panel-title">Message Templates</h3>
        {loading ? <div className="evo-empty">Loading…</div> : rows.length === 0 ? (
          <div className="evo-empty-row">No templates yet.</div>
        ) : (
          <table className="evo-table">
            <thead><tr><th>NAME</th><th>CATEGORY</th><th>LANG</th><th>STATUS</th><th>UPDATED</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="evo-cell-strong">{t.name}</div>
                    <div className="evo-cell-muted">{t.body.slice(0, 80)}{t.body.length > 80 ? '…' : ''}</div>
                  </td>
                  <td>{t.category ?? '—'}</td>
                  <td className="evo-cell-mono">{t.language}</td>
                  <td><span className={statusBadge(t.status)}>{t.status}</span></td>
                  <td className="evo-cell-muted">{timeAgo(t.updatedAt)}</td>
                  <td>
                    <div className="evo-row-actions">
                      {t.status === 'draft' && <button className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => setStatus(t.id, 'pending')}>Submit</button>}
                      {t.status === 'pending' && <button className="evo-btn evo-btn-ghost evo-btn-xs" onClick={() => setStatus(t.id, 'approved')}>Approve</button>}
                      <button className="evo-btn evo-btn-bad evo-btn-xs" onClick={() => remove(t.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="evo-panel">
        <h3 className="evo-panel-title">New Template</h3>
        <form className="evo-form-vert" onSubmit={submit}>
          <label className="evo-label">Name<input className="evo-input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
          <label className="evo-label">Category<input className="evo-input" placeholder="marketing | utility | auth" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></label>
          <label className="evo-label">Language<input className="evo-input" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} /></label>
          <label className="evo-label">Variables (comma-separated)<input className="evo-input" placeholder="name, code, link" value={form.variables} onChange={(e) => setForm((f) => ({ ...f, variables: e.target.value }))} /></label>
          <label className="evo-label">Body
            <textarea className="evo-input evo-textarea" required rows={5} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Hi {{name}}, your code is {{code}}." />
          </label>
          {previewText ? <div className="evo-preview"><strong>Preview:</strong><br />{previewText}</div> : null}
          <button className="evo-btn evo-btn-primary" type="submit" disabled={busy}>Create</button>
          {err ? <div className="evo-form-err">{err}</div> : null}
        </form>
      </section>
    </div>
  );
}

/* ─── MESSAGES TAB ────────────────────────────────────── */
function MessagesTab() {
  const [rows, setRows] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ tenantId: '', sessionId: '', status: '' });

  const reload = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.tenantId) params.set('tenantId', filter.tenantId);
    if (filter.sessionId) params.set('sessionId', filter.sessionId);
    if (filter.status) params.set('status', filter.status);
    params.set('limit', '200');
    const r = await fetch(`/api/admin/evolution/messages?${params}`, { cache: 'no-store' });
    const j = await r.json();
    setRows(j.messages ?? []); setLoading(false);
  }, [filter]);
  useEffect(() => { void reload(); }, [reload]);

  return (
    <section className="evo-panel evo-panel-fill">
      <div className="evo-panel-head">
        <h3 className="evo-panel-title">Message Logs</h3>
        <div className="evo-row-actions">
          <select className="evo-input evo-input-sm" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            {['queued', 'sent', 'delivered', 'read', 'failed', 'received'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="evo-input evo-input-sm" placeholder="Tenant ID filter" value={filter.tenantId} onChange={(e) => setFilter((f) => ({ ...f, tenantId: e.target.value }))} />
          <button className="evo-btn evo-btn-ghost evo-btn-xs" onClick={reload}>↻ Refresh</button>
        </div>
      </div>
      {loading ? <div className="evo-empty">Loading…</div> : rows.length === 0 ? (
        <div className="evo-empty-row">No messages logged yet.</div>
      ) : (
        <table className="evo-table">
          <thead><tr><th>TIME</th><th>DIR</th><th>FROM → TO</th><th>TYPE</th><th>STATUS</th><th>PREVIEW</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="evo-cell-muted">{timeAgo(m.createdAt)}</td>
                <td><span className={`evo-pill evo-pill-${m.direction === 'inbound' ? 'info' : 'good'} evo-pill-xs`}>{m.direction}</span></td>
                <td className="evo-cell-mono">{m.fromNumber ?? '—'} → {m.toNumber ?? '—'}</td>
                <td>{m.messageType}</td>
                <td><span className={statusBadge(m.status)}>{m.status}</span></td>
                <td className="evo-cell-muted">{m.preview ?? (m.errorCode ? `error: ${m.errorCode}` : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ─── ANALYTICS TAB ───────────────────────────────────── */
interface AnalyticsResponse {
  timeSeries: Array<{ day: string; total: number; failed: number }>;
  topTenants: Array<{ tenant_id: string | null; total: number }>;
  totals: { total: number; sent: number; failed: number; received: number };
  successRate: number | null;
  sessionTrend: { total: number; connected: number };
  webhookHealth: { total: number; active: number; failing: number; deliveries: number; failures: number };
}
function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await fetch('/api/admin/evolution/analytics', { cache: 'no-store' });
      setData(await r.json()); setLoading(false);
    })();
  }, []);

  if (loading) return <div className="evo-empty">Loading…</div>;
  if (!data) return <div className="evo-empty">No data.</div>;

  const max = Math.max(1, ...data.timeSeries.map((s) => Number(s.total)));

  return (
    <div className="evo-overview">
      <div className="evo-stat-grid">
        <StatCard label="TOTAL MESSAGES" value={fmtNumber(Number(data.totals.total))} icon="✉" />
        <StatCard label="SENT / DELIVERED" value={fmtNumber(Number(data.totals.sent))} sub={data.successRate != null ? `${data.successRate}% success` : undefined} icon="✓" tone="good" />
        <StatCard label="FAILED" value={fmtNumber(Number(data.totals.failed))} icon="⚠" tone={Number(data.totals.failed) > 0 ? 'bad' : 'good'} />
        <StatCard label="ACTIVE SESSIONS" value={fmtNumber(Number(data.sessionTrend.connected))} sub={`${data.sessionTrend.total} total`} icon="●" />
        <StatCard label="WEBHOOK DELIVERIES" value={fmtNumber(Number(data.webhookHealth.deliveries))} sub={`${data.webhookHealth.failures} failures`} icon="↺" tone={Number(data.webhookHealth.failing) > 0 ? 'bad' : 'good'} />
      </div>

      <div className="evo-grid-2">
        <section className="evo-panel">
          <h3 className="evo-panel-title">Messages last 7 days</h3>
          {data.timeSeries.length === 0 ? <div className="evo-empty-row">No data.</div> : (
            <div className="evo-bars">
              {data.timeSeries.map((d) => (
                <div key={d.day} className="evo-bar-col" title={`${d.day}: ${d.total} (${d.failed} failed)`}>
                  <div className="evo-bar" style={{ height: `${(Number(d.total) / max) * 100}%` }} />
                  <span className="evo-bar-label">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">Top tenants (7d)</h3>
          {data.topTenants.length === 0 ? <div className="evo-empty-row">No data.</div> : (
            <table className="evo-table evo-table-compact">
              <thead><tr><th>TENANT</th><th>MESSAGES</th></tr></thead>
              <tbody>
                {data.topTenants.map((t, idx) => (
                  <tr key={idx}><td className="evo-cell-mono">{t.tenant_id ? t.tenant_id.slice(0, 12) : '—'}</td><td>{fmtNumber(Number(t.total))}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─── SETTINGS TAB ────────────────────────────────────── */
interface SettingsRow {
  defaultWebhookEvents: string[]; retryMaxAttempts: number;
  rateLimitPerMinute: number; sessionLimitPerTenant: number;
  tenantIsolationStrict: boolean; maintenanceMode: boolean;
  updatedAt: string; updatedByEmail: string | null;
}
function SettingsTab() {
  const [config, setConfig] = useState<EvolutionConfig | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/evolution/settings', { cache: 'no-store' });
    const j = await r.json();
    setConfig(j.config); setSettings(j.settings); setScopes(j.apiKeyManagerScopes ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function save(patch: Partial<SettingsRow>) {
    setMsg(null);
    startTransition(async () => {
      const r = await fetch('/api/admin/evolution/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) { setMsg('Save failed.'); return; }
      setMsg('Saved.');
      await reload();
    });
  }

  if (loading || !settings || !config) return <div className="evo-empty">Loading…</div>;

  return (
    <div className="evo-grid-2-1">
      <section className="evo-panel evo-panel-fill">
        <h3 className="evo-panel-title">Connection</h3>
        <table className="evo-table evo-table-compact">
          <tbody>
            <tr><td>Backend status</td><td><span className={statusBadge(config.configured ? 'active' : 'error')}>{config.configured ? 'Configured' : 'Not configured'}</span></td></tr>
            <tr><td>Base URL</td><td className="evo-cell-mono">{config.baseUrl ?? '—'}</td></tr>
            <tr><td>Admin key</td><td className="evo-cell-mono">{config.adminKeyMask ?? '—'}</td></tr>
            <tr><td>Webhook base URL</td><td className="evo-cell-mono">{config.webhookBase ?? '—'}</td></tr>
          </tbody>
        </table>

        <h3 className="evo-panel-title evo-mt-3">Limits</h3>
        <form className="evo-form-vert" onSubmit={(e) => { e.preventDefault(); void save({
          retryMaxAttempts: settings.retryMaxAttempts,
          rateLimitPerMinute: settings.rateLimitPerMinute,
          sessionLimitPerTenant: settings.sessionLimitPerTenant,
          tenantIsolationStrict: settings.tenantIsolationStrict,
          maintenanceMode: settings.maintenanceMode,
        }); }}>
          <label className="evo-label">Retry max attempts
            <input type="number" min={0} max={50} className="evo-input" value={settings.retryMaxAttempts} onChange={(e) => setSettings({ ...settings, retryMaxAttempts: Number(e.target.value) })} />
          </label>
          <label className="evo-label">Rate limit (per minute, per session)
            <input type="number" min={1} max={10000} className="evo-input" value={settings.rateLimitPerMinute} onChange={(e) => setSettings({ ...settings, rateLimitPerMinute: Number(e.target.value) })} />
          </label>
          <label className="evo-label">Session limit per tenant
            <input type="number" min={1} max={1000} className="evo-input" value={settings.sessionLimitPerTenant} onChange={(e) => setSettings({ ...settings, sessionLimitPerTenant: Number(e.target.value) })} />
          </label>
          <label className="evo-checkbox">
            <input type="checkbox" checked={settings.tenantIsolationStrict} onChange={(e) => setSettings({ ...settings, tenantIsolationStrict: e.target.checked })} />
            Strict tenant isolation
          </label>
          <label className="evo-checkbox">
            <input type="checkbox" checked={settings.maintenanceMode} onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })} />
            Maintenance mode (blocks new sessions)
          </label>
          <button className="evo-btn evo-btn-primary" type="submit" disabled={busy}>Save</button>
          {msg ? <div className="evo-form-msg">{msg}</div> : null}
        </form>
      </section>

      <section className="evo-panel">
        <h3 className="evo-panel-title">Central API Key Manager</h3>
        <p className="evo-cell-muted evo-mb-2">
          WhatsApp Gateway integrates with the portal&apos;s <a href="/admin/api-keys" className="evo-link">central API Key Manager</a>.
          Create a key with one or more of the scopes below, then use it as <code>apikey</code> header on calls.
        </p>
        <ul className="evo-scope-list">
          {scopes.map((s) => <li key={s}><code>{s}</code></li>)}
        </ul>

        <h3 className="evo-panel-title evo-mt-3">Compatibility</h3>
        <ul className="evo-scope-list">
          <li>Legacy WhatsApp keys (<code>api_keys</code> table on wa.getouch.co): <strong>still valid</strong></li>
          <li>Existing WAPI / Getouch WhatsApp gateway: <strong>unchanged</strong></li>
          <li>Evolution backend keys (env-only): <strong>admin-only</strong>, never exposed</li>
        </ul>
      </section>
    </div>
  );
}

/* ─── Styles (scoped to this page; keeps portal globals untouched) ── */
function EvolutionStyles() {
  return (
    <style>{`
.evo-shell { display: flex; flex-direction: column; gap: 1.25rem; }
.evo-page-head { display: flex; flex-direction: column; gap: 0.6rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
.evo-breadcrumb { font-size: 0.78rem; display: flex; gap: 0.4rem; align-items: center; }
.evo-crumb-muted { color: var(--text-secondary); }
.evo-crumb-sep { color: var(--text-secondary); opacity: 0.5; }
.evo-crumb-active { color: var(--text); }
.evo-page-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.evo-title { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.evo-subtitle { font-size: 0.86rem; color: var(--text-secondary); margin: 0.15rem 0 0; }
.evo-head-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.evo-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 0.95rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-subtle); color: var(--text); font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.12s; }
.evo-btn:hover { border-color: var(--border-strong); background: var(--bg-elevated); }
.evo-btn-primary { background: linear-gradient(135deg, #6d68ff, #8b5cf6); border-color: #7c3aed; color: white; }
.evo-btn-primary:hover { filter: brightness(1.08); border-color: #7c3aed; }
.evo-btn-ghost { background: transparent; }
.evo-btn-bad { color: #fca5a5; }
.evo-btn-bad:hover { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.4); }
.evo-btn-xs { padding: 0.35rem 0.6rem; font-size: 0.78rem; }
.evo-btn-ico { font-size: 0.95rem; opacity: 0.85; }
.evo-banner { padding: 0.55rem 0.8rem; border-radius: 8px; margin-top: 0.6rem; font-size: 0.84rem; display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
.evo-banner code { background: rgba(255,255,255,0.06); padding: 0 0.3rem; border-radius: 4px; font-size: 0.8rem; }
.evo-banner-warn { background: rgba(234,179,8,0.10); border: 1px solid rgba(234,179,8,0.30); color: #f7d490; }
.evo-banner-good { background: rgba(34,197,94,0.10); border: 1px solid rgba(34,197,94,0.30); color: #86efac; }
.evo-tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--border); overflow-x: auto; }
.evo-tab { background: none; border: none; padding: 0.7rem 1rem; color: var(--text-secondary); font-size: 0.86rem; font-weight: 500; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
.evo-tab:hover { color: var(--text); }
.evo-tab-active { color: var(--text); border-bottom-color: #8b5cf6; }
.evo-tabpanel { min-height: 240px; }
.evo-error { padding: 0.6rem 0.8rem; background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; color: #fca5a5; font-size: 0.85rem; }
.evo-empty, .evo-empty-row { padding: 1.25rem; color: var(--text-secondary); text-align: center; font-size: 0.86rem; }
.evo-overview { display: flex; flex-direction: column; gap: 1rem; }
.evo-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.85rem; }
.evo-stat { background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; }
.evo-stat-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.evo-stat-label { font-size: 0.7rem; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.05em; text-transform: uppercase; }
.evo-stat-icon { font-size: 1rem; opacity: 0.6; padding: 0.3rem; background: rgba(139,92,246,0.10); border-radius: 6px; color: #c4b5fd; }
.evo-stat-value { font-size: 1.85rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
.evo-stat-value-good { color: #22c55e; }
.evo-stat-value-amber { color: #eab308; }
.evo-stat-value-bad { color: #ef4444; }
.evo-stat-sub { margin-top: 0.4rem; font-size: 0.76rem; color: var(--text-secondary); }
.evo-grid-2 { display: grid; grid-template-columns: 2fr 1fr; gap: 0.85rem; }
.evo-grid-2-1 { display: grid; grid-template-columns: 1fr 380px; gap: 0.85rem; align-items: start; }
.evo-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.85rem; }
@media (max-width: 1100px) { .evo-grid-2, .evo-grid-2-1, .evo-grid-3 { grid-template-columns: 1fr; } }
.evo-panel { background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
.evo-panel-fill { min-height: 200px; }
.evo-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.evo-panel-title { font-size: 0.9rem; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
.evo-table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
.evo-table th { text-align: left; font-size: 0.68rem; letter-spacing: 0.06em; color: var(--text-secondary); font-weight: 600; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--border); }
.evo-table td { padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
.evo-table tr:last-child td { border-bottom: none; }
.evo-table tr:hover td { background: var(--bg-elevated); }
.evo-table-compact td, .evo-table-compact th { padding: 0.4rem 0.5rem; }
.evo-cell-strong { font-weight: 600; }
.evo-cell-muted { color: var(--text-secondary); font-size: 0.78rem; }
.evo-cell-mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.78rem; }
.evo-pill { display: inline-flex; align-items: center; padding: 0.16rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.02em; text-transform: capitalize; }
.evo-pill-xs { font-size: 0.66rem; padding: 0.1rem 0.4rem; margin-right: 0.25rem; }
.evo-pill-good { background: rgba(34,197,94,0.18); color: #86efac; }
.evo-pill-info { background: rgba(234,179,8,0.18); color: #fde68a; }
.evo-pill-bad { background: rgba(239,68,68,0.18); color: #fca5a5; }
.evo-pill-muted { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); }
.evo-pill-violet { background: rgba(139,92,246,0.20); color: #c4b5fd; }
.evo-pill-cyan { background: rgba(6,182,212,0.20); color: #67e8f9; }
.evo-pill-amber { background: rgba(245,158,11,0.20); color: #fcd34d; }
.evo-row-actions { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.evo-row-actions-end { justify-content: flex-end; }
.evo-input { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 7px; padding: 0.5rem 0.65rem; color: var(--text); font-size: 0.85rem; width: 100%; }
.evo-input:focus { outline: 2px solid #8b5cf6; outline-offset: -1px; }
.evo-input-sm { padding: 0.32rem 0.5rem; font-size: 0.78rem; width: auto; }
.evo-textarea { font-family: inherit; resize: vertical; }
.evo-form-inline { display: flex; gap: 0.45rem; flex-wrap: wrap; align-items: center; padding: 0.6rem; background: var(--bg-elevated); border-radius: 8px; margin-bottom: 0.6rem; }
.evo-form-inline .evo-input { width: auto; min-width: 180px; }
.evo-form-vert { display: flex; flex-direction: column; gap: 0.6rem; }
.evo-form-row { display: flex; gap: 0.6rem; }
.evo-form-row .evo-label { flex: 1; }
.evo-label { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.3rem; letter-spacing: 0.02em; }
.evo-fieldset { border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.7rem; display: flex; flex-direction: column; gap: 0.3rem; }
.evo-fieldset legend { font-size: 0.74rem; color: var(--text-secondary); padding: 0 0.3rem; }
.evo-checkbox { display: flex; align-items: center; gap: 0.45rem; font-size: 0.82rem; cursor: pointer; }
.evo-form-err { color: #fca5a5; font-size: 0.8rem; }
.evo-form-msg { color: #86efac; font-size: 0.8rem; }
.evo-link { color: #c4b5fd; text-decoration: underline; }
.evo-mt-3 { margin-top: 1.2rem; }
.evo-mb-2 { margin-bottom: 0.6rem; }
.evo-donut-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.8rem; padding: 0.5rem; }
.evo-donut { position: relative; width: 150px; height: 150px; border-radius: 50%; }
.evo-donut-empty { background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; flex-direction: column; }
.evo-donut-empty .evo-donut-num { font-size: 2rem; font-weight: 800; }
.evo-donut-empty .evo-donut-tot { font-size: 0.7rem; color: var(--text-secondary); }
.evo-donut-hole { position: absolute; inset: 22px; background: var(--bg-subtle); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.evo-donut-num { font-size: 1.7rem; font-weight: 800; }
.evo-donut-tot { font-size: 0.7rem; color: var(--text-secondary); }
.evo-legend { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8rem; width: 100%; }
.evo-legend li { display: flex; align-items: center; gap: 0.45rem; }
.evo-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
.evo-legend-good { background: #22c55e; }
.evo-legend-info { background: #eab308; }
.evo-legend-bad { background: #ef4444; }
.evo-legend-muted { background: #94a3b8; }
.evo-activity { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.55rem; }
.evo-activity-row { display: flex; gap: 0.5rem; align-items: flex-start; }
.evo-activity-dot { width: 8px; height: 8px; border-radius: 50%; background: #8b5cf6; margin-top: 0.5rem; flex-shrink: 0; }
.evo-activity-warn .evo-activity-dot { background: #eab308; }
.evo-activity-error .evo-activity-dot { background: #ef4444; }
.evo-activity-body { flex: 1; min-width: 0; }
.evo-activity-title { font-size: 0.82rem; font-weight: 500; }
.evo-activity-meta { font-size: 0.72rem; color: var(--text-secondary); }
.evo-activity-time { font-size: 0.72rem; color: var(--text-secondary); white-space: nowrap; }
.evo-health-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.evo-health-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; }
.evo-health-label { color: var(--text-secondary); }
.evo-modal-back { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 80; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.evo-modal { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 1.25rem; max-width: 420px; width: 100%; display: flex; flex-direction: column; gap: 0.8rem; }
.evo-qr-meta { display: grid; gap: 0.35rem; font-size: 0.92rem; color: var(--text-dim); }
.evo-qr { width: 100%; max-width: 280px; margin: 0 auto; background: white; padding: 0.5rem; border-radius: 8px; }
.evo-qr-status { font-size: 0.92rem; color: var(--text-dim); }
.evo-qr-status-good { color: #22c55e; }
.evo-qr-status-bad { color: #f87171; }
.evo-pairing { font-size: 1.4rem; text-align: center; font-family: ui-monospace, monospace; }
.evo-bars { display: flex; align-items: flex-end; gap: 0.3rem; height: 140px; padding: 0.4rem 0; }
.evo-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.3rem; min-width: 24px; }
.evo-bar { width: 100%; min-height: 4px; background: linear-gradient(180deg, #8b5cf6, #6d68ff); border-radius: 4px 4px 0 0; }
.evo-bar-label { font-size: 0.65rem; color: var(--text-secondary); }
.evo-preview { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 0.55rem 0.7rem; font-size: 0.82rem; color: var(--text-secondary); white-space: pre-wrap; }
.evo-scope-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.84rem; }
.evo-scope-list code { background: rgba(139,92,246,0.10); padding: 0.05rem 0.4rem; border-radius: 4px; font-size: 0.78rem; }
    `}</style>
  );
}
