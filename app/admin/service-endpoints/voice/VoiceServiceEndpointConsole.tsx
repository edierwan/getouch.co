'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { EvolutionStyles } from '../../whatsapp-services/evolution/EvolutionConsole';
import type { VoiceDashboardStatus } from '@/lib/service-endpoints-voice';
import type {
  VoiceConsoleExtras,
  VoiceDomain,
  VoiceExtension,
  VoiceGateway,
  VoiceCallFlowEntry,
  VoiceCallRow,
  VoiceRecordingRow,
} from '@/lib/voice-console-data';

type ConsolePayload = VoiceDashboardStatus & { extras: VoiceConsoleExtras };

type TabId =
  | 'overview'
  | 'tenants'
  | 'extensions'
  | 'trunks'
  | 'call-flows'
  | 'calls'
  | 'analytics'
  | 'settings';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◉' },
  { id: 'tenants', label: 'Tenants', icon: '⌬' },
  { id: 'extensions', label: 'Extensions', icon: '☎' },
  { id: 'trunks', label: 'Trunks', icon: '⇄' },
  { id: 'call-flows', label: 'Call Flows', icon: '⌥' },
  { id: 'calls', label: 'Calls', icon: '◐' },
  { id: 'analytics', label: 'Analytics', icon: '▣' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

const PBX_URL = 'https://pbx.getouch.co';
const VOICE_API_URL = 'https://voice.getouch.co';

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatRelative(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatNumber(n: number | null | undefined) {
  if (n == null) return '—';
  return n.toLocaleString();
}

export function VoiceServiceEndpointConsole() {
  const [data, setData] = useState<ConsolePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/service-endpoints/voice', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setData(json as ConsolePayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load voice endpoint status');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 60_000);
    return () => clearInterval(t);
  }, []);

  function runHealthCheck() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/service-endpoints/voice/test-health', { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Health check failed (${res.status})`);
        setHealthMessage(json.message || 'Health check completed.');
        await reload();
      } catch (err) {
        setHealthMessage(err instanceof Error ? err.message : 'Health check failed');
      }
    });
  }

  return (
    <div className="evo-shell">
      <header className="evo-page-head">
        <div className="evo-breadcrumb">
          <span className="evo-crumb-muted">Communications</span>
          <span className="evo-crumb-sep">/</span>
          <span className="evo-crumb-active">FusionPBX / Voice</span>
        </div>
        <div className="evo-page-head-row">
          <div>
            <h1 className="evo-title">
              <span style={{ marginRight: 8 }}>☎</span>
              FusionPBX Voice Gateway
              <span
                className={`evo-pill ${data?.summary.statusTone === 'healthy' ? 'evo-pill-good' : 'evo-pill-info'}`}
                style={{ marginLeft: 12, verticalAlign: 'middle', fontSize: '0.72rem' }}
              >
                ● {data?.summary.statusLabel ?? 'Loading'}
              </span>
            </h1>
            <p className="evo-subtitle">
              PBX and voice service endpoint powered by FusionPBX / FreeSWITCH on the <code>voice</code> database.
            </p>
          </div>
          <div className="evo-head-actions">
            <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-primary">
              <span className="evo-btn-ico">↗</span> Open FusionPBX
            </a>
            <a href={VOICE_API_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost">
              <span className="evo-btn-ico">⇆</span> Open Voice API
            </a>
            <button type="button" className="evo-btn evo-btn-ghost" onClick={() => setTab('overview')}>
              <span className="evo-btn-ico">▤</span> View Logs
            </button>
            <a
              href="https://docs.fusionpbx.com/en/latest/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="evo-btn evo-btn-ghost"
            >
              <span className="evo-btn-ico">⌨</span> Docs
            </a>
            <button type="button" className="evo-btn evo-btn-ghost" onClick={runHealthCheck} disabled={busy}>
              <span className="evo-btn-ico">♡</span> {busy ? 'Testing…' : 'Test PBX Health'}
            </button>
          </div>
        </div>
      </header>

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

      {error ? <div className="evo-error">⚠ {error}</div> : null}
      {data && data.extras && !data.extras.dbAvailable ? (
        <div className="evo-banner evo-banner-warn">
          ⚠ Voice DB not reachable from the portal: <code>{data.extras.dbError ?? 'unknown'}</code>. Tabs degrade to empty states.
        </div>
      ) : null}
      {healthMessage ? <div className="evo-banner evo-banner-good">{healthMessage}</div> : null}

      <div className="evo-tabpanel">
        {loading && !data ? (
          <div className="evo-empty">Loading FusionPBX voice endpoint…</div>
        ) : !data ? null : (
          <>
            {tab === 'overview' && <OverviewTab data={data} onTestHealth={runHealthCheck} busy={busy} />}
            {tab === 'tenants' && <TenantsTab data={data} />}
            {tab === 'extensions' && <ExtensionsTab data={data} />}
            {tab === 'trunks' && <TrunksTab data={data} />}
            {tab === 'call-flows' && <CallFlowsTab data={data} />}
            {tab === 'calls' && <CallsTab data={data} />}
            {tab === 'analytics' && <AnalyticsTab data={data} />}
            {tab === 'settings' && <SettingsTab data={data} />}
          </>
        )}
      </div>

      <EvolutionStyles />
      <VoiceStyles />
    </div>
  );
}

/* ─── Helper components ────────────────────────────── */

function StatCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'amber' | 'bad';
  icon?: string;
}) {
  const valueClass = tone ? `evo-stat-value evo-stat-value-${tone}` : 'evo-stat-value';
  return (
    <div className="evo-stat">
      <div className="evo-stat-head">
        <div className="evo-stat-label">{label}</div>
        <div className="evo-stat-icon">{icon ?? '◇'}</div>
      </div>
      <div className={valueClass}>{value}</div>
      {detail ? <div className="evo-stat-sub">{detail}</div> : null}
    </div>
  );
}

function Donut({
  segments,
  total,
  centerLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
  centerLabel: string;
}) {
  const sum = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  const radius = 60;
  const stroke = 18;
  const circ = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="voice-donut">
      <svg width={150} height={150} viewBox="0 0 150 150">
        <circle cx={75} cy={75} r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
        {segments.map((seg, idx) => {
          const len = (seg.value / sum) * circ;
          const dasharray = `${len} ${circ - len}`;
          const el = (
            <circle
              key={idx}
              cx={75}
              cy={75}
              r={radius}
              stroke={seg.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={dasharray}
              strokeDashoffset={-offset}
              transform="rotate(-90 75 75)"
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="voice-donut-center">
        <div className="voice-donut-num">{total}</div>
        <div className="voice-donut-tot">{centerLabel}</div>
      </div>
    </div>
  );
}

function MiniLineChart({
  points,
  height = 110,
  color = '#8b5cf6',
}: {
  points: number[];
  height?: number;
  color?: string;
}) {
  if (points.length === 0) return <div className="evo-empty" style={{ height }}>No data</div>;
  const max = Math.max(1, ...points);
  const w = 100;
  const h = 100;
  const step = w / Math.max(1, points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - (p / max) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id="voiceGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#voiceGrad)" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.4} />
    </svg>
  );
}

function MiniBarChart({ values }: { values: { label: string; value: number }[] }) {
  if (values.length === 0) return <div className="evo-empty">No data</div>;
  const max = Math.max(1, ...values.map((v) => v.value));
  return (
    <div className="evo-bars">
      {values.map((v) => (
        <div key={v.label} className="evo-bar-col">
          <div className="evo-bar" style={{ height: `${(v.value / max) * 100}%` }} />
          <div className="evo-bar-label">{v.label}</div>
        </div>
      ))}
    </div>
  );
}

function Pill({ tone, children }: { tone: 'good' | 'info' | 'bad' | 'muted' | 'violet'; children: React.ReactNode }) {
  return <span className={`evo-pill evo-pill-${tone}`}>{children}</span>;
}

function tenantStatusToTone(status: 'active' | 'suspended' | 'inactive'): 'good' | 'info' | 'bad' {
  if (status === 'active') return 'good';
  if (status === 'suspended') return 'info';
  return 'bad';
}

/* ─── OVERVIEW ───────────────────────────────────── */

function OverviewTab({ data, onTestHealth, busy }: { data: ConsolePayload; onTestHealth: () => void; busy: boolean }) {
  const e = data.extras;
  const totalTenants = e.domains.length;
  const activeExt = e.extensions.filter((x) => x.enabled).length;
  const concurrent = e.calls.activeNow;
  const out = e.analytics.outcomes;
  const answerRate = out.total > 0 ? Math.round((out.answered / out.total) * 1000) / 10 : null;
  const onlineTrunks = e.gateways.filter((g) => g.enabled && g.registerEnabled).length;
  const recordingsToday = e.calls.recordings.filter((r) =>
    r.startStamp ? new Date(r.startStamp).toDateString() === new Date().toDateString() : false,
  ).length;

  const callVolumePoints = e.analytics.volumeDaily.map((d) => d.total);
  const totalCalls7d = e.analytics.volumeDaily.reduce((a, b) => a + b.total, 0);

  return (
    <div className="evo-overview">
      <div className="evo-stat-grid">
        <StatCard label="Total Tenants" value={String(totalTenants)} detail={`${e.domains.filter((d) => d.enabled).length} active`} icon="⌬" />
        <StatCard label="Active Extensions" value={String(activeExt)} detail={`of ${e.extensions.length} total`} icon="☎" />
        <StatCard label="Concurrent Calls" value={String(concurrent)} detail={concurrent > 0 ? 'live' : 'no live calls'} icon="◐" />
        <StatCard
          label="Answer Rate"
          value={answerRate == null ? '—' : `${answerRate}%`}
          detail="last 7 days"
          tone={answerRate == null ? undefined : answerRate > 80 ? 'good' : answerRate > 50 ? 'amber' : 'bad'}
          icon="◔"
        />
        <StatCard label="Online Trunks" value={`${onlineTrunks} / ${e.gateways.length}`} detail={e.gateways.length === 0 ? 'no trunks yet' : ''} icon="⇄" />
        <StatCard label="Recordings Today" value={String(recordingsToday)} detail="from CDR" icon="◉" />
      </div>

      <div className="evo-grid-2-1">
        <div className="evo-panel-stack">
          <section className="evo-panel">
            <div className="evo-panel-head">
              <h3 className="evo-panel-title">Call Volume (Last 7 days)</h3>
              <span className="evo-cell-muted">Total {totalCalls7d}</span>
            </div>
            {totalCalls7d > 0 ? (
              <MiniLineChart points={callVolumePoints} />
            ) : (
              <div className="evo-empty">No call activity yet.</div>
            )}
            <div className="voice-axis">
              {e.analytics.volumeDaily.map((d) => (
                <span key={d.date}>{d.date.slice(5)}</span>
              ))}
            </div>
          </section>

          <section className="evo-panel">
            <div className="evo-panel-head">
              <h3 className="evo-panel-title">Tenant Activity</h3>
              <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-link">View all tenants</a>
            </div>
            {e.domains.length === 0 ? (
              <div className="evo-empty">No tenants/domains configured yet. Use FusionPBX to create the first tenant.</div>
            ) : (
              <table className="evo-table">
                <thead>
                  <tr>
                    <th>Tenant Name</th>
                    <th>Active Extensions</th>
                    <th>Today&apos;s Calls</th>
                    <th>Answer Rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {e.domains.slice(0, 8).map((d) => (
                    <tr key={d.domainUuid}>
                      <td className="evo-cell-strong">{d.domainName}</td>
                      <td>{d.extensionCount}</td>
                      <td>{d.callsToday}</td>
                      <td>{d.answerRate == null ? '—' : `${d.answerRate}%`}</td>
                      <td><Pill tone={tenantStatusToTone(d.status)}>{d.status}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div className="evo-panel-stack">
          <section className="evo-panel">
            <div className="evo-panel-head">
              <h3 className="evo-panel-title">Call Outcome (7 days)</h3>
            </div>
            {out.total > 0 ? (
              <>
                <Donut
                  total={out.total}
                  centerLabel="Total Calls"
                  segments={[
                    { label: 'Answered', value: out.answered, color: '#22c55e' },
                    { label: 'Voicemail', value: out.voicemail, color: '#eab308' },
                    { label: 'Missed', value: out.missed, color: '#ef4444' },
                    { label: 'Failed', value: out.failed, color: '#94a3b8' },
                  ]}
                />
                <ul className="evo-legend">
                  <li><span className="evo-legend-dot evo-legend-good" /> Answered <strong style={{ marginLeft: 'auto' }}>{out.answered}</strong></li>
                  <li><span className="evo-legend-dot evo-legend-info" /> Voicemail <strong style={{ marginLeft: 'auto' }}>{out.voicemail}</strong></li>
                  <li><span className="evo-legend-dot evo-legend-bad" /> Missed <strong style={{ marginLeft: 'auto' }}>{out.missed}</strong></li>
                  <li><span className="evo-legend-dot evo-legend-muted" /> Failed <strong style={{ marginLeft: 'auto' }}>{out.failed}</strong></li>
                </ul>
              </>
            ) : (
              <div className="evo-empty">No call activity yet.</div>
            )}
          </section>

          <section className="evo-panel">
            <h3 className="evo-panel-title">Quick Actions</h3>
            <div className="voice-quick-actions">
              <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost">＋ Add Extension (FusionPBX)</a>
              <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost">⇄ Add Trunk (FusionPBX)</a>
              <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost">⌬ Create Tenant (FusionPBX)</a>
              <button type="button" className="evo-btn evo-btn-ghost" onClick={onTestHealth} disabled={busy}>♡ {busy ? 'Testing…' : 'Test PBX Health'}</button>
            </div>
          </section>

          <section className="evo-panel">
            <h3 className="evo-panel-title">Health Overview</h3>
            <ul className="evo-health-list">
              <li className="evo-health-row"><span className="evo-health-label">FusionPBX UI</span><Pill tone={data.runtime.web.status === 'running' ? 'good' : 'bad'}>{data.runtime.web.summary}</Pill></li>
              <li className="evo-health-row"><span className="evo-health-label">FreeSWITCH</span><Pill tone={data.runtime.freeswitch.status === 'running' ? 'good' : 'bad'}>{data.runtime.freeswitch.summary}</Pill></li>
              <li className="evo-health-row"><span className="evo-health-label">SIP / RTP</span><Pill tone={data.summary.sipRtpStatus === 'Published' ? 'good' : 'info'}>{data.summary.sipRtpStatus}</Pill></li>
              <li className="evo-health-row"><span className="evo-health-label">Database</span><Pill tone={data.summary.dbStatus === 'Ready' ? 'good' : 'info'}>{data.summary.dbStatus}</Pill></li>
              <li className="evo-health-row"><span className="evo-health-label">Voice API</span><Pill tone={data.summary.voiceApiStatus === 'Healthy' || data.summary.voiceApiStatus === 'Protected' ? 'good' : 'info'}>{data.summary.voiceApiStatus}</Pill></li>
            </ul>
          </section>
        </div>
      </div>

      <section className="evo-panel" id="logs">
        <div className="evo-panel-head">
          <h3 className="evo-panel-title">Recent Logs</h3>
          <span className="evo-cell-muted">Sanitized · last lines</span>
        </div>
        <div className="evo-grid-2">
          <div>
            <div className="evo-panel-title" style={{ fontSize: '0.78rem', marginBottom: 4 }}>FusionPBX UI</div>
            {data.runtime.logs.web.length > 0 ? (
              <pre className="voice-log">{data.runtime.logs.web.join('\n')}</pre>
            ) : <div className="evo-empty">No recent log lines.</div>}
          </div>
          <div>
            <div className="evo-panel-title" style={{ fontSize: '0.78rem', marginBottom: 4 }}>FreeSWITCH</div>
            {data.runtime.logs.freeswitch.length > 0 ? (
              <pre className="voice-log">{data.runtime.logs.freeswitch.join('\n')}</pre>
            ) : <div className="evo-empty">No recent log lines.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── TENANTS ─────────────────────────────────────── */

function TenantsTab({ data }: { data: ConsolePayload }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const e = data.extras;

  const filtered = useMemo(() => {
    return e.domains.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (search && !d.domainName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [e.domains, search, statusFilter]);

  const total = e.domains.length;
  const active = e.domains.filter((d) => d.enabled).length;
  const suspended = e.domains.filter((d) => !d.enabled).length;
  const totalExt = e.extensions.length;
  const newThisMonth = e.domains.filter((d) => {
    if (!d.insertDate) return false;
    const ts = new Date(d.insertDate);
    const now = new Date();
    return ts.getUTCFullYear() === now.getUTCFullYear() && ts.getUTCMonth() === now.getUTCMonth();
  }).length;

  return (
    <div className="evo-overview">
      <div className="evo-stat-grid">
        <StatCard label="Total Tenants" value={String(total)} icon="⌬" />
        <StatCard label="Active Tenants" value={String(active)} tone="good" icon="✓" />
        <StatCard label="New This Month" value={String(newThisMonth)} icon="＋" />
        <StatCard label="Suspended" value={String(suspended)} tone={suspended > 0 ? 'amber' : undefined} icon="‖" />
        <StatCard label="Total Extensions" value={String(totalExt)} icon="☎" />
      </div>

      <div className="evo-grid-2-1">
        <section className="evo-panel">
          <div className="evo-form-inline">
            <input className="evo-input evo-input-search" placeholder="Search tenants by name or domain…" value={search} onChange={(ev) => setSearch(ev.target.value)} />
            <select className="evo-input evo-input-sm" value={statusFilter} onChange={(ev) => setStatusFilter(ev.target.value as 'all' | 'active' | 'suspended')}>
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-primary evo-btn-xs" style={{ marginLeft: 'auto' }}>＋ Create Tenant (FusionPBX)</a>
          </div>
          {filtered.length === 0 ? (
            <div className="evo-empty">No tenants match the filters.</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Domain</th>
                  <th>Extensions</th>
                  <th>Trunks</th>
                  <th>Today Calls</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d: VoiceDomain) => (
                  <tr key={d.domainUuid}>
                    <td className="evo-cell-strong">{d.domainName}</td>
                    <td className="evo-cell-mono">{d.domainName}</td>
                    <td>{d.extensionCount}</td>
                    <td>{d.gatewayCount}</td>
                    <td>{d.callsToday}</td>
                    <td><Pill tone={tenantStatusToTone(d.status)}>{d.status}</Pill></td>
                    <td>
                      <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost evo-btn-xs">Open</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="evo-panel-stack">
          <section className="evo-panel">
            <h3 className="evo-panel-title">Tenant Health</h3>
            {total > 0 ? (
              <>
                <Donut
                  total={total}
                  centerLabel="Total"
                  segments={[
                    { label: 'Active', value: active, color: '#22c55e' },
                    { label: 'Suspended', value: suspended, color: '#eab308' },
                  ]}
                />
                <ul className="evo-legend">
                  <li><span className="evo-legend-dot evo-legend-good" /> Active <strong style={{ marginLeft: 'auto' }}>{active}</strong></li>
                  <li><span className="evo-legend-dot evo-legend-info" /> Suspended <strong style={{ marginLeft: 'auto' }}>{suspended}</strong></li>
                </ul>
              </>
            ) : <div className="evo-empty">No tenants yet.</div>}
          </section>

          <section className="evo-panel">
            <h3 className="evo-panel-title">Tenant Mapping</h3>
            <div className="evo-cell-muted" style={{ fontSize: '0.8rem' }}>
              Portal tenant_id → FusionPBX domain mapping is planned. Currently FusionPBX domains are shown unmapped.
            </div>
            <ul className="evo-legend" style={{ marginTop: 8 }}>
              {e.domains.slice(0, 5).map((d) => (
                <li key={d.domainUuid}>
                  <span className="evo-cell-mono">{d.domainName}</span>
                  <span style={{ marginLeft: 'auto' }}><Pill tone="muted">Unmapped</Pill></span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ─── EXTENSIONS ──────────────────────────────────── */

function ExtensionsTab({ data }: { data: ConsolePayload }) {
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const e = data.extras;

  const tenantOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const x of e.extensions) {
      if (x.domainName) set.set(x.domainName, x.domainName);
    }
    return Array.from(set.values());
  }, [e.extensions]);

  const filtered = useMemo(() => {
    return e.extensions.filter((x) => {
      if (statusFilter === 'enabled' && !x.enabled) return false;
      if (statusFilter === 'disabled' && x.enabled) return false;
      if (tenantFilter !== 'all' && x.domainName !== tenantFilter) return false;
      if (search && !`${x.extension} ${x.callerIdName ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [e.extensions, search, tenantFilter, statusFilter]);

  const total = e.extensions.length;
  const enabled = e.extensions.filter((x) => x.enabled).length;
  const disabled = total - enabled;
  const voicemail = e.extensions.filter((x) => x.voicemailEnabled).length;

  return (
    <div className="evo-overview">
      <div className="evo-stat-grid">
        <StatCard label="Total Extensions" value={String(total)} icon="☎" />
        <StatCard label="Enabled" value={String(enabled)} tone="good" detail={total > 0 ? `${Math.round((enabled / total) * 100)}%` : ''} icon="✓" />
        <StatCard label="Disabled" value={String(disabled)} tone={disabled > 0 ? 'amber' : undefined} icon="‖" />
        <StatCard label="Voicemail Enabled" value={String(voicemail)} icon="◉" />
        <StatCard label="Live Registrations" value={data.extras.freeswitch.registrations == null ? 'Unknown' : String(data.extras.freeswitch.registrations)} detail="FreeSWITCH ESL" icon="●" />
      </div>

      <div className="evo-grid-2-1">
        <section className="evo-panel">
          <div className="evo-form-inline">
            <input className="evo-input evo-input-search" placeholder="Search extensions…" value={search} onChange={(ev) => setSearch(ev.target.value)} />
            <select className="evo-input evo-input-sm" value={tenantFilter} onChange={(ev) => setTenantFilter(ev.target.value)}>
              <option value="all">All Tenants</option>
              {tenantOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="evo-input evo-input-sm" value={statusFilter} onChange={(ev) => setStatusFilter(ev.target.value as 'all' | 'enabled' | 'disabled')}>
              <option value="all">All Statuses</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
            <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-primary evo-btn-xs" style={{ marginLeft: 'auto' }}>＋ Add Extension (FusionPBX)</a>
          </div>
          {filtered.length === 0 ? (
            <div className="evo-empty">No extensions match.</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Extension</th>
                  <th>User / Label</th>
                  <th>Tenant</th>
                  <th>Voicemail</th>
                  <th>Call Forward</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((x: VoiceExtension) => (
                  <tr key={x.extensionUuid}>
                    <td className="evo-cell-strong">{x.extension}</td>
                    <td>{x.callerIdName ?? '—'}</td>
                    <td className="evo-cell-mono">{x.domainName ?? '—'}</td>
                    <td>{x.voicemailEnabled ? <Pill tone="good">Enabled</Pill> : <Pill tone="muted">—</Pill>}</td>
                    <td>{x.callForward ? <span className="evo-cell-mono">{x.callForward}</span> : '—'}</td>
                    <td>{x.enabled ? <Pill tone="good">Enabled</Pill> : <Pill tone="bad">Disabled</Pill>}</td>
                    <td><a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost evo-btn-xs">Edit</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {filtered.length > 50 ? <div className="evo-cell-muted" style={{ marginTop: 6 }}>Showing first 50 of {filtered.length}.</div> : null}
        </section>

        <div className="evo-panel-stack">
          <section className="evo-panel">
            <h3 className="evo-panel-title">Registration Health</h3>
            {total > 0 ? (
              <>
                <Donut
                  total={total}
                  centerLabel="Extensions"
                  segments={[
                    { label: 'Enabled', value: enabled, color: '#22c55e' },
                    { label: 'Disabled', value: disabled, color: '#94a3b8' },
                  ]}
                />
                <ul className="evo-legend">
                  <li><span className="evo-legend-dot evo-legend-good" /> Enabled <strong style={{ marginLeft: 'auto' }}>{enabled}</strong></li>
                  <li><span className="evo-legend-dot evo-legend-muted" /> Disabled <strong style={{ marginLeft: 'auto' }}>{disabled}</strong></li>
                </ul>
              </>
            ) : <div className="evo-empty">No extensions yet.</div>}
            <div className="evo-cell-muted" style={{ fontSize: '0.78rem' }}>
              Live SIP registration counts require FreeSWITCH ESL access. Currently the portal cannot read live registrations and shows DB status only.
            </div>
          </section>

          <section className="evo-panel">
            <h3 className="evo-panel-title">Quick Actions</h3>
            <div className="voice-quick-actions">
              <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost">＋ Add Extension</a>
              <button type="button" className="evo-btn evo-btn-ghost" disabled title="Bulk import not implemented">⤓ Bulk Import</button>
              <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost">▤ Manage Voicemail</a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ─── TRUNKS ──────────────────────────────────────── */

function TrunksTab({ data }: { data: ConsolePayload }) {
  const e = data.extras;
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => e.gateways.filter((g) =>
    !search || `${g.gateway} ${g.proxy ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  ), [e.gateways, search]);

  const total = e.gateways.length;
  const online = e.gateways.filter((g) => g.enabled && g.registerEnabled).length;
  const degraded = e.gateways.filter((g) => g.enabled && !g.registerEnabled).length;
  const offline = e.gateways.filter((g) => !g.enabled).length;

  return (
    <div className="evo-overview">
      <div className="evo-stat-grid">
        <StatCard label="Total Trunks" value={String(total)} icon="⇄" />
        <StatCard label="Online" value={String(online)} tone="good" icon="●" />
        <StatCard label="Degraded" value={String(degraded)} tone={degraded > 0 ? 'amber' : undefined} icon="◐" />
        <StatCard label="Offline" value={String(offline)} tone={offline > 0 ? 'bad' : undefined} icon="○" />
        <StatCard label="Failover Ready" value="—" detail="Not monitored yet" icon="◇" />
      </div>

      <div className="evo-grid-2-1">
        <section className="evo-panel">
          <div className="evo-form-inline">
            <input className="evo-input evo-input-search" placeholder="Search trunks…" value={search} onChange={(ev) => setSearch(ev.target.value)} />
            <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-primary evo-btn-xs" style={{ marginLeft: 'auto' }}>＋ Add Trunk (FusionPBX)</a>
          </div>
          {filtered.length === 0 ? (
            <div className="evo-empty">
              No trunks/gateways configured yet. Provision a SIP carrier in FusionPBX to enable outbound and inbound calling.
            </div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Trunk Name</th>
                  <th>Tenant</th>
                  <th>Proxy</th>
                  <th>Register</th>
                  <th>Status</th>
                  <th>Quality</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g: VoiceGateway) => (
                  <tr key={g.gatewayUuid}>
                    <td className="evo-cell-strong">{g.gateway}</td>
                    <td className="evo-cell-mono">{g.domainName ?? '—'}</td>
                    <td className="evo-cell-mono">{g.proxy ?? '—'}</td>
                    <td>{g.registerEnabled ? <Pill tone="good">Yes</Pill> : <Pill tone="muted">No</Pill>}</td>
                    <td>{g.enabled ? <Pill tone="good">Online</Pill> : <Pill tone="bad">Offline</Pill>}</td>
                    <td><span className="evo-cell-muted">Not monitored</span></td>
                    <td><a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost evo-btn-xs">Open</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="evo-panel-stack">
          <section className="evo-panel">
            <h3 className="evo-panel-title">Trunk Status</h3>
            {total > 0 ? (
              <>
                <Donut
                  total={total}
                  centerLabel="Trunks"
                  segments={[
                    { label: 'Online', value: online, color: '#22c55e' },
                    { label: 'Degraded', value: degraded, color: '#eab308' },
                    { label: 'Offline', value: offline, color: '#ef4444' },
                  ]}
                />
                <ul className="evo-legend">
                  <li><span className="evo-legend-dot evo-legend-good" /> Online <strong style={{ marginLeft: 'auto' }}>{online}</strong></li>
                  <li><span className="evo-legend-dot evo-legend-info" /> Degraded <strong style={{ marginLeft: 'auto' }}>{degraded}</strong></li>
                  <li><span className="evo-legend-dot evo-legend-bad" /> Offline <strong style={{ marginLeft: 'auto' }}>{offline}</strong></li>
                </ul>
              </>
            ) : <div className="evo-empty">No trunks yet.</div>}
          </section>
          <section className="evo-panel">
            <h3 className="evo-panel-title">Call Quality / Latency</h3>
            <div className="evo-empty" style={{ minHeight: 120 }}>SIP RTT / jitter monitoring not enabled yet.</div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ─── CALL FLOWS ──────────────────────────────────── */

function CallFlowsTab({ data }: { data: ConsolePayload }) {
  const e = data.extras;
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | VoiceCallFlowEntry['type']>('all');
  const [selected, setSelected] = useState<VoiceCallFlowEntry | null>(null);

  const filtered = useMemo(() => e.callFlows.filter((f) => {
    if (typeFilter !== 'all' && f.type !== typeFilter) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [e.callFlows, search, typeFilter]);

  const detail = selected ?? filtered[0] ?? null;

  return (
    <div className="evo-overview">
      <div className="evo-stat-grid">
        <StatCard label="Total Flows" value={String(e.callFlows.length)} icon="⌥" />
        <StatCard label="Active IVRs" value={String(e.callFlowCounts.ivrMenus)} icon="◧" />
        <StatCard label="Ring Groups" value={String(e.callFlowCounts.ringGroups)} icon="⌘" />
        <StatCard label="Queues" value={String(e.callFlowCounts.queues)} icon="⌘" />
        <StatCard label="Time Conditions" value={String(e.callFlowCounts.timeConditions)} icon="◷" />
      </div>

      <div className="voice-flow-grid">
        <section className="evo-panel">
          <div className="evo-form-inline">
            <input className="evo-input evo-input-search" placeholder="Search flows…" value={search} onChange={(ev) => setSearch(ev.target.value)} />
            <select className="evo-input evo-input-sm" value={typeFilter} onChange={(ev) => setTypeFilter(ev.target.value as 'all' | VoiceCallFlowEntry['type'])}>
              <option value="all">All Types</option>
              <option value="IVR">IVR</option>
              <option value="Ring Group">Ring Group</option>
              <option value="Queue">Queue</option>
              <option value="Call Flow">Call Flow</option>
            </select>
          </div>
          {filtered.length === 0 ? (
            <div className="evo-empty">No call flows configured yet. Build IVRs, ring groups, and queues in FusionPBX.</div>
          ) : (
            <table className="evo-table evo-table-compact">
              <thead><tr><th>Name</th><th>Tenant</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.uuid} className={detail?.uuid === f.uuid ? 'evo-row-selected' : ''} style={{ cursor: 'pointer' }} onClick={() => setSelected(f)}>
                    <td className="evo-cell-strong">{f.name}</td>
                    <td className="evo-cell-mono">{f.domainName ?? '—'}</td>
                    <td><Pill tone="violet">{f.type}</Pill></td>
                    <td>{f.enabled ? <Pill tone="good">Published</Pill> : <Pill tone="muted">Draft</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">Flow Details</h3>
          {detail ? (
            <>
              <div className="evo-info-rows">
                <div><span className="evo-cell-muted">Name</span><strong>{detail.name}</strong></div>
                <div><span className="evo-cell-muted">Type</span><Pill tone="violet">{detail.type}</Pill></div>
                <div><span className="evo-cell-muted">Tenant</span><span className="evo-cell-mono">{detail.domainName ?? '—'}</span></div>
                <div><span className="evo-cell-muted">Extension</span><span className="evo-cell-mono">{detail.extension ?? '—'}</span></div>
                <div><span className="evo-cell-muted">Updated</span><span>{formatDateTime(detail.updatedAt)}</span></div>
                <div><span className="evo-cell-muted">Status</span>{detail.enabled ? <Pill tone="good">Enabled</Pill> : <Pill tone="muted">Disabled</Pill>}</div>
              </div>
              <div className="voice-quick-actions" style={{ marginTop: 12 }}>
                <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost">✎ Edit in FusionPBX</a>
                <button type="button" className="evo-btn evo-btn-ghost" disabled>⎘ Duplicate</button>
                <button type="button" className="evo-btn evo-btn-ghost" disabled>◑ Test Route</button>
              </div>
            </>
          ) : (
            <div className="evo-empty">Select a flow to see details.</div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─── CALLS ───────────────────────────────────────── */

function CallsTab({ data }: { data: ConsolePayload }) {
  const e = data.extras;
  const out = e.analytics.outcomes;

  const todayStr = new Date().toDateString();
  const answeredToday = e.calls.recent.filter((c) => c.startStamp && new Date(c.startStamp).toDateString() === todayStr && c.status && ['answered', 'normal_clearing'].includes(c.status.toLowerCase())).length;
  const missedToday = e.calls.recent.filter((c) => c.startStamp && new Date(c.startStamp).toDateString() === todayStr && c.status && ['no_answer', 'no answer'].includes(c.status.toLowerCase())).length;
  const recordingsToday = e.calls.recordings.filter((r) => r.startStamp && new Date(r.startStamp).toDateString() === todayStr).length;
  const avgDuration = out.total > 0 ? formatDuration(e.analytics.totalsLast7d.avgDurationSec) : '—';

  return (
    <div className="evo-overview">
      <div className="evo-stat-grid">
        <StatCard label="Active Calls" value={String(e.calls.activeNow)} icon="◐" />
        <StatCard label="Queued Calls" value={String(e.calls.queuedNow)} icon="≡" />
        <StatCard label="Avg Duration" value={avgDuration} detail="last 7 days" icon="◷" />
        <StatCard label="Answered Today" value={String(answeredToday)} tone={answeredToday > 0 ? 'good' : undefined} icon="✓" />
        <StatCard label="Missed Today" value={String(missedToday)} tone={missedToday > 0 ? 'amber' : undefined} icon="✕" />
        <StatCard label="Recordings Today" value={String(recordingsToday)} icon="◉" />
      </div>

      <div className="evo-grid-2-1">
        <div className="evo-panel-stack">
          <section className="evo-panel">
            <div className="evo-panel-head">
              <h3 className="evo-panel-title">Live Calls</h3>
              <span className="evo-cell-muted">Live channel reads require FreeSWITCH ESL — currently shows recent CDR</span>
            </div>
            {e.calls.recent.length === 0 ? (
              <div className="evo-empty">No call activity yet.</div>
            ) : (
              <table className="evo-table">
                <thead><tr><th>Caller</th><th>Destination</th><th>Tenant</th><th>Direction</th><th>Started</th><th>Duration</th><th>Status</th></tr></thead>
                <tbody>
                  {e.calls.recent.slice(0, 20).map((c: VoiceCallRow) => (
                    <tr key={c.uuid}>
                      <td>{c.callerName ?? c.callerNumber ?? '—'}</td>
                      <td className="evo-cell-mono">{c.destination ?? '—'}</td>
                      <td className="evo-cell-mono">{c.domainName ?? '—'}</td>
                      <td>{c.direction ?? '—'}</td>
                      <td>{formatRelative(c.startStamp)}</td>
                      <td>{formatDuration(c.durationSec)}</td>
                      <td>{c.status ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="evo-panel">
            <div className="evo-panel-head">
              <h3 className="evo-panel-title">Recent Recordings</h3>
              <span className="evo-cell-muted">{e.calls.recordings.length} recordings in CDR</span>
            </div>
            {e.calls.recordings.length === 0 ? (
              <div className="evo-empty">No recordings available.</div>
            ) : (
              <table className="evo-table">
                <thead><tr><th>Date &amp; Time</th><th>Caller</th><th>Tenant</th><th>Duration</th><th>File</th></tr></thead>
                <tbody>
                  {e.calls.recordings.slice(0, 20).map((r: VoiceRecordingRow) => (
                    <tr key={r.uuid}>
                      <td>{formatDateTime(r.startStamp)}</td>
                      <td className="evo-cell-mono">{r.callerNumber ?? '—'}</td>
                      <td className="evo-cell-mono">{r.domainName ?? '—'}</td>
                      <td>{formatDuration(r.durationSec)}</td>
                      <td className="evo-cell-mono evo-cell-muted">{r.recordName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div className="evo-panel-stack">
          <section className="evo-panel">
            <h3 className="evo-panel-title">Queue Monitor</h3>
            {e.callFlowCounts.queues === 0 ? (
              <div className="evo-empty">No call center queues configured.</div>
            ) : (
              <div className="evo-cell-muted" style={{ fontSize: '0.82rem' }}>
                {e.callFlowCounts.queues} queue(s) defined. Live SLA stats require FreeSWITCH callcenter module read access.
              </div>
            )}
          </section>
          <section className="evo-panel">
            <h3 className="evo-panel-title">Recent Call Alerts</h3>
            <div className="evo-empty">No alerts captured.</div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ─── ANALYTICS ───────────────────────────────────── */

function AnalyticsTab({ data }: { data: ConsolePayload }) {
  const a = data.extras.analytics;
  const totals = a.totalsLast7d;
  const out = a.outcomes;
  const answerRate = out.total > 0 ? Math.round((out.answered / out.total) * 1000) / 10 : null;
  const avgDuration = formatDuration(totals.avgDurationSec);

  const hourBars = a.callsByHour.filter((_, i) => i % 2 === 0).map((h) => ({
    label: `${h.hour}h`,
    value: h.total,
  }));

  return (
    <div className="evo-overview">
      <div className="evo-stat-grid">
        <StatCard label="Total Calls" value={formatNumber(totals.total)} detail="last 7 days" icon="☎" />
        <StatCard label="Answer Rate" value={answerRate == null ? '—' : `${answerRate}%`} icon="◔" tone={answerRate == null ? undefined : answerRate > 80 ? 'good' : 'amber'} />
        <StatCard label="Avg Call Duration" value={avgDuration} icon="◷" />
        <StatCard label="Peak Concurrent" value={formatNumber(totals.peakConcurrent)} detail="not measured yet" icon="◐" />
        <StatCard label="SLA (7d)" value="—" detail="No SLA monitor yet" icon="◇" />
        <StatCard label="Tenants" value={String(data.extras.domains.length)} icon="⌬" />
      </div>

      <div className="evo-grid-3">
        <section className="evo-panel">
          <h3 className="evo-panel-title">Call Volume Over Time</h3>
          {a.volumeDaily.length > 0 && a.volumeDaily.some((d) => d.total > 0) ? (
            <>
              <MiniLineChart points={a.volumeDaily.map((d) => d.total)} />
              <div className="voice-axis">{a.volumeDaily.map((d) => <span key={d.date}>{d.date.slice(5)}</span>)}</div>
            </>
          ) : <div className="evo-empty">No call activity yet.</div>}
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">Calls by Hour</h3>
          {a.callsByHour.some((h) => h.total > 0) ? <MiniBarChart values={hourBars} /> : <div className="evo-empty">No call activity yet.</div>}
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">Call Outcome</h3>
          {out.total > 0 ? (
            <Donut
              total={out.total}
              centerLabel="Total Calls"
              segments={[
                { label: 'Answered', value: out.answered, color: '#22c55e' },
                { label: 'Voicemail', value: out.voicemail, color: '#eab308' },
                { label: 'Missed', value: out.missed, color: '#ef4444' },
                { label: 'Failed', value: out.failed, color: '#94a3b8' },
              ]}
            />
          ) : <div className="evo-empty">No outcomes yet.</div>}
        </section>
      </div>

      <section className="evo-panel">
        <div className="evo-panel-head">
          <h3 className="evo-panel-title">Top Tenants by Call Volume</h3>
        </div>
        {a.topDomains.length === 0 ? (
          <div className="evo-empty">No call activity yet.</div>
        ) : (
          <table className="evo-table">
            <thead><tr><th>#</th><th>Tenant</th><th>Total Calls</th><th>Answered</th><th>Answer Rate</th><th>Avg Duration</th></tr></thead>
            <tbody>
              {a.topDomains.map((d, i) => (
                <tr key={d.domainName}>
                  <td>{i + 1}</td>
                  <td className="evo-cell-strong">{d.domainName}</td>
                  <td>{d.total}</td>
                  <td>{d.answered}</td>
                  <td>{d.total > 0 ? `${Math.round((d.answered / d.total) * 1000) / 10}%` : '—'}</td>
                  <td>{formatDuration(d.avgDurationSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/* ─── SETTINGS ────────────────────────────────────── */

function SettingsTab({ data }: { data: ConsolePayload }) {
  const sv = data.serviceInformation;
  const r = data.runtime;

  return (
    <div className="evo-overview">
      <div className="evo-grid-3">
        <section className="evo-panel">
          <h3 className="evo-panel-title">General</h3>
          <div className="evo-info-rows">
            <div><span className="evo-cell-muted">System Name</span><strong>GetTouch FusionPBX</strong></div>
            <div><span className="evo-cell-muted">Native PBX UI</span><a href={sv.nativePbxUi} target="_blank" rel="noopener noreferrer" className="evo-link">{sv.nativePbxUi}</a></div>
            <div><span className="evo-cell-muted">Voice API URL</span><span className="evo-cell-mono">{sv.voiceApiUrl}</span></div>
            <div><span className="evo-cell-muted">Database</span><span className="evo-cell-mono">{sv.database}</span></div>
            <div><span className="evo-cell-muted">Engine</span><span>{sv.engine}</span></div>
            <div><span className="evo-cell-muted">Version</span><span>{sv.version ?? '—'}</span></div>
          </div>
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">Tenant Defaults</h3>
          <div className="evo-cell-muted" style={{ fontSize: '0.82rem' }}>
            Managed in FusionPBX (Advanced → Default Settings). Portal does not write tenant defaults.
          </div>
          <div className="voice-quick-actions" style={{ marginTop: 12 }}>
            <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost">Open Default Settings</a>
          </div>
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">Recording Policy</h3>
          <div className="evo-cell-muted" style={{ fontSize: '0.82rem' }}>
            Recording behavior is configured per extension/dialplan in FusionPBX. The portal does not currently expose a global toggle.
          </div>
          <div className="voice-quick-actions" style={{ marginTop: 12 }}>
            <a href={PBX_URL} target="_blank" rel="noopener noreferrer" className="evo-btn evo-btn-ghost">Manage Recordings</a>
          </div>
        </section>
      </div>

      <div className="evo-grid-3">
        <section className="evo-panel">
          <h3 className="evo-panel-title">Security &amp; Access</h3>
          <ul className="evo-health-list">
            <li className="evo-health-row"><span className="evo-health-label">Strong Passwords</span><Pill tone="good">Enforced (FusionPBX)</Pill></li>
            <li className="evo-health-row"><span className="evo-health-label">Session Timeout</span><span>FusionPBX session</span></li>
            <li className="evo-health-row"><span className="evo-health-label">2FA</span><Pill tone="muted">Managed in FusionPBX</Pill></li>
          </ul>
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">Integrations</h3>
          <ul className="evo-health-list">
            <li className="evo-health-row"><span className="evo-health-label">SIP Trunk Providers</span><span>{data.extras.gateways.length}</span></li>
            <li className="evo-health-row"><span className="evo-health-label">Webhooks</span><Pill tone="muted">Not configured</Pill></li>
            <li className="evo-health-row"><span className="evo-health-label">CRM Integration</span><Pill tone="muted">None</Pill></li>
          </ul>
        </section>

        <section className="evo-panel">
          <h3 className="evo-panel-title">System Status</h3>
          <ul className="evo-health-list">
            <li className="evo-health-row"><span className="evo-health-label">FusionPBX UI</span><Pill tone={r.web.status === 'running' ? 'good' : 'bad'}>{r.web.summary}</Pill></li>
            <li className="evo-health-row"><span className="evo-health-label">FreeSWITCH</span><Pill tone={r.freeswitch.status === 'running' ? 'good' : 'bad'}>{r.freeswitch.summary}</Pill></li>
            <li className="evo-health-row"><span className="evo-health-label">Compose</span><span>{r.composeProject ?? '—'}</span></li>
            <li className="evo-health-row"><span className="evo-health-label">SIP / RTP</span><span className="evo-cell-mono" style={{ fontSize: '0.74rem' }}>{r.directPortExposure}</span></li>
            <li className="evo-health-row"><span className="evo-health-label">Last Checked</span><span>{formatDateTime(sv.lastChecked)}</span></li>
          </ul>
        </section>
      </div>

      <section className="evo-panel">
        <h3 className="evo-panel-title">Notes</h3>
        <ul className="evo-activity">
          {data.notes.length === 0 ? <li className="evo-cell-muted">No notes.</li> : data.notes.map((n, i) => (
            <li key={i} className="evo-activity-row"><span className="evo-activity-dot" /><div className="evo-activity-body"><div className="evo-activity-title">{n}</div></div></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ─── Local styles overlay ───────────────────────── */

function VoiceStyles() {
  return (
    <style>{`
.voice-donut { position: relative; width: 150px; height: 150px; margin: 0 auto; }
.voice-donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
.voice-donut-num { font-size: 1.7rem; font-weight: 800; }
.voice-donut-tot { font-size: 0.7rem; color: var(--text-secondary); }
.voice-quick-actions { display: flex; flex-direction: column; gap: 0.4rem; }
.voice-quick-actions .evo-btn { justify-content: flex-start; }
.voice-axis { display: flex; justify-content: space-between; font-size: 0.66rem; color: var(--text-secondary); margin-top: 4px; }
.voice-flow-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 0.85rem; align-items: start; }
@media (max-width: 1100px) { .voice-flow-grid { grid-template-columns: 1fr; } }
.voice-log { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.65rem; font-size: 0.74rem; line-height: 1.35; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
.evo-info-rows { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.85rem; }
.evo-info-rows > div { display: flex; justify-content: space-between; gap: 0.6rem; align-items: center; }
.evo-info-rows .evo-cell-muted { font-size: 0.74rem; }
    `}</style>
  );
}
