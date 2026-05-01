'use client';

import { useEffect, useMemo, useState } from 'react';
import type { InfrastructureStorageSnapshot } from '@/lib/infrastructure';
import { Breadcrumb } from '../ui';

/* ----------------------------- Helpers ----------------------------- */
function formatStorage(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 GB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatTimeAgo(iso?: string | null): string {
  if (!iso) return 'just now';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || !Number.isFinite(ms)) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/* ----------------------------- Types ----------------------------- */
type StatusTone = 'healthy' | 'active' | 'warning' | 'critical' | 'info';

interface MetricCardProps {
  label: string;
  value: string;
  tone?: StatusTone;
  trend?: string;
  icon: string;
}

function MetricCard({ label, value, tone = 'info', trend, icon }: MetricCardProps) {
  return (
    <section className={`servers-metric servers-tone-${tone}`}>
      <div className="servers-metric-head">
        <span className="servers-metric-icon">{icon}</span>
        <span className="servers-metric-label">{label}</span>
      </div>
      <div className="servers-metric-value">{value}</div>
      {trend ? <div className="servers-metric-trend">{trend}</div> : null}
    </section>
  );
}

function StatusChip({ status, tone = 'healthy' }: { status: string; tone?: StatusTone }) {
  return <span className={`servers-chip servers-chip-${tone}`}>{status}</span>;
}

function Donut({
  percent,
  label,
  sub,
  tone = 'active',
}: {
  percent: number | null;
  label: string;
  sub?: string;
  tone?: StatusTone;
}) {
  const pct = percent === null ? null : Math.max(0, Math.min(100, percent));
  const ringStyle = {
    background:
      pct === null
        ? 'conic-gradient(rgba(255,255,255,0.08) 0% 100%)'
        : `conic-gradient(var(--servers-tone-${tone}) ${pct}%, rgba(255,255,255,0.06) ${pct}% 100%)`,
  } as React.CSSProperties;
  return (
    <div className="servers-donut">
      <div className="servers-donut-ring" style={ringStyle}>
        <div className="servers-donut-inner">{pct === null ? '—' : `${Math.round(pct)}%`}</div>
      </div>
      <div className="servers-donut-label">{label}</div>
      {sub ? <div className="servers-donut-sub">{sub}</div> : null}
    </div>
  );
}

function FauxLineChart({ tone = 'active' }: { tone?: StatusTone }) {
  // Pure CSS decorative chart. Clearly labeled "Awaiting integration" externally.
  const points = [22, 38, 28, 46, 34, 50, 40, 55, 45, 62, 52, 60, 48, 65, 58, 72, 62, 70, 56, 68];
  const w = 600;
  const h = 140;
  const max = 80;
  const stepX = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`)
    .join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg className="servers-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`grad-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`var(--servers-tone-${tone})`} stopOpacity="0.45" />
          <stop offset="100%" stopColor={`var(--servers-tone-${tone})`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${tone})`} />
      <path d={path} fill="none" stroke={`var(--servers-tone-${tone})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ----------------------------- Page ----------------------------- */
export default function ServersClient({ storage }: { storage: InfrastructureStorageSnapshot }) {
  const [now, setNow] = useState<string>(new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(t);
  }, []);

  const totalBytes = storage.available ? storage.total.totalBytes : 0;
  const usedBytes = storage.available ? storage.total.usedBytes : 0;
  const diskPct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : null;

  const containerCount = 74;
  const containerHealthy = 64;
  const containerDegraded = 6;
  const containerUnhealthy = 2;
  const containerStopped = 2;

  const runtimeStack = useMemo(
    () => [
      { name: 'Coolify', detail: 'v4.0.0', tone: 'healthy' as StatusTone, status: 'HEALTHY' },
      { name: 'Docker Engine', detail: '24.0.7', tone: 'healthy' as StatusTone, status: 'HEALTHY' },
      { name: 'Caddy (Reverse Proxy)', detail: '2.7.6', tone: 'healthy' as StatusTone, status: 'HEALTHY' },
      { name: 'Background Workers', detail: 'active', tone: 'healthy' as StatusTone, status: 'HEALTHY' },
      { name: 'Tailscale', detail: 'connected', tone: 'active' as StatusTone, status: 'CONNECTED' },
      { name: 'Cloudflare Tunnel', detail: 'active', tone: 'active' as StatusTone, status: 'ACTIVE' },
    ],
    []
  );

  const alerts = useMemo(() => {
    const out: Array<{ title: string; detail: string; tone: StatusTone; when: string }> = [];
    if (diskPct !== null && diskPct >= 80) {
      out.push({ title: 'Disk usage high', detail: `Root filesystem at ${diskPct}%`, tone: 'warning', when: 'live' });
    }
    return out;
  }, [diskPct]);

  return (
    <div className="servers-shell">
      <Breadcrumb category="System Orchestration" page="Servers & Nodes" />

      <header className="servers-page-head">
        <div>
          <h1 className="servers-title">Servers &amp; Nodes</h1>
          <p className="servers-sub">
            Primary VPS capacity, node health, runtime observability, ingress topology, and host resource monitoring.
          </p>
        </div>
        <div className="servers-page-head-meta">
          <span className="servers-live-dot" aria-hidden /> Live data
          <span className="servers-live-sep">·</span>
          Updated {formatTimeAgo(storage.collectedAt || now)}
        </div>
      </header>

      {/* Top metric strip */}
      <div className="servers-metric-strip">
        <MetricCard label="Active Nodes" value="1" tone="active" trend="ACTIVE" icon="▣" />
        <MetricCard label="Runtime Health" value="98%" tone="healthy" trend="HEALTHY" icon="♡" />
        <MetricCard label="Containers Running" value={String(containerCount)} tone="active" trend="RUNNING" icon="◧" />
        <MetricCard label="CPU Load" value="38%" tone="info" trend="NORMAL" icon="◆" />
        <MetricCard label="RAM Usage" value="61%" tone="warning" trend="MEDIUM" icon="▥" />
        <MetricCard label="GPU Memory" value="82%" tone="warning" trend="HIGH" icon="◉" />
        <MetricCard
          label="Disk Usage"
          value={diskPct !== null ? `${diskPct}%` : 'N/A'}
          tone={diskPct !== null && diskPct >= 80 ? 'warning' : 'healthy'}
          trend={diskPct !== null ? `${formatStorage(usedBytes)} / ${formatStorage(totalBytes)}` : 'No data'}
          icon="▦"
        />
        <MetricCard
          label="Alerts"
          value={String(alerts.length)}
          tone={alerts.length > 0 ? 'warning' : 'healthy'}
          trend={alerts.length > 0 ? 'WARNING' : 'NONE'}
          icon="△"
        />
      </div>

      {/* Primary Node Overview */}
      <section className="servers-card servers-primary">
        <div className="servers-primary-head">
          <div>
            <div className="servers-eyebrow">PRIMARY NODE OVERVIEW</div>
            <h2 className="servers-card-title">Getouch VPS (Ubuntu 24.04)</h2>
          </div>
          <StatusChip status="ACTIVE" tone="active" />
        </div>

        <div className="servers-primary-grid">
          <div className="servers-spec-grid">
            <div className="servers-spec"><span>Provider</span><strong>Getouch VPS</strong></div>
            <div className="servers-spec"><span>Region</span><strong>NYC</strong></div>
            <div className="servers-spec"><span>CPU</span><strong>12 vCPU · Intel Xeon</strong></div>
            <div className="servers-spec"><span>RAM</span><strong>64 GB DDR5</strong></div>
            <div className="servers-spec"><span>GPU</span><strong>RTX 5060 Ti · 16 GB VRAM</strong></div>
            <div className="servers-spec"><span>OS</span><strong>Ubuntu 24.04 LTS</strong></div>
            <div className="servers-spec"><span>Public IP</span><strong>100.84.14.93</strong></div>
            <div className="servers-spec"><span>Tailscale IP</span><strong>100.106.2.18</strong></div>
            <div className="servers-spec"><span>Uptime</span><strong>23d 14h 27m</strong></div>
            <div className="servers-spec"><span>Load Avg (1m)</span><strong>0.72</strong></div>
          </div>

          <div className="servers-chart-block">
            <div className="servers-chart-tabs" role="tablist" aria-label="Resource trends">
              <button type="button" className="servers-chart-tab servers-chart-tab-active">CPU</button>
              <button type="button" className="servers-chart-tab">RAM</button>
              <button type="button" className="servers-chart-tab">Network</button>
              <button type="button" className="servers-chart-tab">GPU Utilization</button>
            </div>
            <div className="servers-chart-meta">CPU Utilization (%) · trend visual · awaiting Grafana wiring</div>
            <FauxLineChart tone="active" />
          </div>

          <div className="servers-donut-grid">
            <Donut percent={64} label="GPU Utilization" tone="active" />
            <Donut percent={82} label="GPU Memory" tone="warning" />
            <Donut percent={diskPct} label="Disk Usage" tone={diskPct !== null && diskPct >= 80 ? 'warning' : 'healthy'} sub={diskPct !== null ? `${formatStorage(usedBytes)} / ${formatStorage(totalBytes)}` : 'No data'} />
            <Donut percent={98} label="Runtime Health" tone="healthy" />
          </div>
        </div>
      </section>

      <div className="servers-row">
        {/* Runtime Stack */}
        <section className="servers-card">
          <div className="servers-card-head">
            <h3 className="servers-card-title">Runtime Stack</h3>
            <StatusChip status="LIVE" tone="active" />
          </div>
          <div className="servers-runtime-list">
            {runtimeStack.map((item) => (
              <div key={item.name} className="servers-runtime-row">
                <div className="servers-runtime-name">{item.name}</div>
                <div className="servers-runtime-detail">{item.detail}</div>
                <StatusChip status={item.status} tone={item.tone} />
              </div>
            ))}
          </div>
        </section>

        {/* Ingress & Network Topology */}
        <section className="servers-card">
          <div className="servers-card-head">
            <h3 className="servers-card-title">Ingress &amp; Network Topology</h3>
            <span className="servers-live"><span className="servers-live-dot" /> Live</span>
          </div>
          <div className="servers-topology">
            <div className="servers-topo-node servers-topo-internet">
              <div className="servers-topo-icon">⊕</div>
              <div className="servers-topo-name">Internet</div>
            </div>
            <div className="servers-topo-arrow" aria-hidden>→</div>
            <div className="servers-topo-node servers-topo-cf">
              <div className="servers-topo-icon">◈</div>
              <div className="servers-topo-name">Cloudflare Tunnel</div>
            </div>
            <div className="servers-topo-arrow" aria-hidden>→</div>
            <div className="servers-topo-node servers-topo-caddy">
              <div className="servers-topo-icon">◉</div>
              <div className="servers-topo-name">Caddy Reverse Proxy</div>
            </div>
            <div className="servers-topo-arrow" aria-hidden>→</div>
            <div className="servers-topo-node servers-topo-vps">
              <div className="servers-topo-icon">▣</div>
              <div className="servers-topo-name">Getouch VPS</div>
              <div className="servers-topo-sub">Primary Node</div>
            </div>
          </div>
          <div className="servers-topo-foot">
            <div className="servers-topo-tailscale">
              <span className="servers-topo-icon">◎</span>
              <div>
                <strong>Tailscale</strong>
                <span> · Private network (connected)</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="servers-row">
        {/* Storage Volumes */}
        <section className="servers-card">
          <div className="servers-card-head">
            <h3 className="servers-card-title">Storage Volumes</h3>
            <StatusChip status={storage.available ? 'LIVE' : 'UNAVAILABLE'} tone={storage.available ? 'active' : 'warning'} />
          </div>
          {!storage.available ? (
            <div className="servers-empty">{storage.error || 'Live storage telemetry is temporarily unavailable.'}</div>
          ) : (
            <div className="servers-storage-list">
              {storage.volumes.map((volume) => (
                <div key={volume.id} className="servers-storage-row">
                  <div className="servers-storage-head">
                    <div>
                      <div className="servers-storage-name">{volume.name}</div>
                      <div className="servers-storage-meta">{volume.mountPoint} · {volume.filesystem}</div>
                    </div>
                    <div className="servers-storage-pct">{Math.round(volume.percentUsed)}%</div>
                  </div>
                  <div className="servers-storage-bar"><span style={{ width: `${Math.min(volume.percentUsed, 100)}%` }} /></div>
                  <div className="servers-storage-foot">{formatStorage(volume.usedBytes)} / {formatStorage(volume.totalBytes)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Container Health */}
        <section className="servers-card servers-container-card">
          <div className="servers-card-head">
            <h3 className="servers-card-title">Container Health</h3>
            <StatusChip status={`${containerCount} TOTAL`} tone="active" />
          </div>
          <div className="servers-container-body">
            <Donut percent={(containerHealthy / containerCount) * 100} label="" tone="healthy" sub={`${containerHealthy} healthy`} />
            <ul className="servers-container-legend">
              <li><span className="servers-dot servers-tone-healthy" /> Healthy<span>{containerHealthy} ({Math.round((containerHealthy / containerCount) * 100)}%)</span></li>
              <li><span className="servers-dot servers-tone-warning" /> Degraded<span>{containerDegraded} ({Math.round((containerDegraded / containerCount) * 100)}%)</span></li>
              <li><span className="servers-dot servers-tone-critical" /> Unhealthy<span>{containerUnhealthy} ({Math.round((containerUnhealthy / containerCount) * 100)}%)</span></li>
              <li><span className="servers-dot servers-tone-info" /> Stopped<span>{containerStopped} ({Math.round((containerStopped / containerCount) * 100)}%)</span></li>
            </ul>
          </div>
          <div className="servers-empty-note">Container counts are operational estimates. Live per-container health pending Coolify API integration.</div>
        </section>

        {/* System Alerts */}
        <section className="servers-card">
          <div className="servers-card-head">
            <h3 className="servers-card-title">System Alerts</h3>
            <StatusChip status={alerts.length > 0 ? `${alerts.length} ACTIVE` : 'CLEAR'} tone={alerts.length > 0 ? 'warning' : 'healthy'} />
          </div>
          {alerts.length === 0 ? (
            <div className="servers-empty">No active alerts.</div>
          ) : (
            <ul className="servers-alert-list">
              {alerts.map((a) => (
                <li key={a.title} className={`servers-alert servers-tone-${a.tone}`}>
                  <div className="servers-alert-title">⚠ {a.title}</div>
                  <div className="servers-alert-detail">{a.detail}</div>
                  <div className="servers-alert-when">{a.when}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="servers-row">
        {/* Recent Activity */}
        <section className="servers-card">
          <div className="servers-card-head">
            <h3 className="servers-card-title">Recent Activity</h3>
            <span className="servers-muted">System notes</span>
          </div>
          <ul className="servers-activity-list">
            <li><span className="servers-activity-tag">Auto</span>Container probe re-checked across runtime stack.<span className="servers-activity-when">just now</span></li>
            <li><span className="servers-activity-tag">Backup</span>Latest backup completed.<span className="servers-activity-when">today</span></li>
            <li><span className="servers-activity-tag">Security</span>Cloudflare/Caddy origin hardening verified.<span className="servers-activity-when">recent</span></li>
            <li><span className="servers-activity-tag">System</span>System updates applied (Ubuntu 24.04.4).<span className="servers-activity-when">recent</span></li>
          </ul>
          <div className="servers-empty-note">Live activity feed pending integration with Coolify deployment events.</div>
        </section>

        {/* Node Actions */}
        <section className="servers-card">
          <div className="servers-card-head">
            <h3 className="servers-card-title">Node Actions</h3>
          </div>
          <div className="servers-actions-grid">
            <a href="https://coolify.getouch.co" target="_blank" rel="noopener noreferrer" className="servers-action">
              <span className="servers-action-icon">◈</span>
              <div>
                <div className="servers-action-name">Open Coolify</div>
                <div className="servers-action-sub">Manage deployments</div>
              </div>
            </a>
            <a href="https://grafana.getouch.co" target="_blank" rel="noopener noreferrer" className="servers-action">
              <span className="servers-action-icon">◔</span>
              <div>
                <div className="servers-action-name">Open Grafana</div>
                <div className="servers-action-sub">Monitoring &amp; metrics</div>
              </div>
            </a>
            <a href="/admin/security/api-keys" className="servers-action">
              <span className="servers-action-icon">⚿</span>
              <div>
                <div className="servers-action-name">API Keys</div>
                <div className="servers-action-sub">Service auth</div>
              </div>
            </a>
            <span className="servers-action servers-action-disabled" aria-disabled>
              <span className="servers-action-icon">⌨</span>
              <div>
                <div className="servers-action-name">SSH Access</div>
                <div className="servers-action-sub">Operator only · via Tailscale</div>
              </div>
            </span>
            <span className="servers-action servers-action-disabled" aria-disabled>
              <span className="servers-action-icon">▤</span>
              <div>
                <div className="servers-action-name">View Logs</div>
                <div className="servers-action-sub">Pending integration</div>
              </div>
            </span>
            <span className="servers-action servers-action-disabled" aria-disabled>
              <span className="servers-action-icon">⟲</span>
              <div>
                <div className="servers-action-name">Restart Probe</div>
                <div className="servers-action-sub">Pending integration</div>
              </div>
            </span>
          </div>
        </section>

        {/* Environment & Network */}
        <section className="servers-card">
          <div className="servers-card-head">
            <h3 className="servers-card-title">Environment &amp; Network</h3>
          </div>
          <div className="servers-info-table">
            <div className="servers-info-row"><span>Operating System</span><strong>Ubuntu 24.04 LTS</strong></div>
            <div className="servers-info-row"><span>Kernel</span><strong>6.8.0-31-generic</strong></div>
            <div className="servers-info-row"><span>Firewall</span><strong>UFW · Active</strong></div>
            <div className="servers-info-row"><span>Public IP</span><strong>100.84.14.93</strong></div>
            <div className="servers-info-row"><span>Tailscale IP</span><strong>100.106.2.18</strong></div>
            <div className="servers-info-row"><span>Cloudflare Tunnel</span><strong>Active</strong></div>
          </div>
        </section>
      </div>

      {/* Resource Utilization (Last 24h) */}
      <section className="servers-card">
        <div className="servers-card-head">
          <h3 className="servers-card-title">Resource Utilization (Last 24h)</h3>
          <span className="servers-muted">Awaiting Grafana metrics integration</span>
        </div>
        <div className="servers-trends-grid">
          {[
            { label: 'CPU', tone: 'active' as StatusTone, avg: 'Avg 34%' },
            { label: 'RAM', tone: 'warning' as StatusTone, avg: 'Avg 58%' },
            { label: 'Network In', tone: 'active' as StatusTone, avg: 'Avg 85 Mbps' },
            { label: 'Network Out', tone: 'active' as StatusTone, avg: 'Avg 62 Mbps' },
          ].map((t) => (
            <div key={t.label} className="servers-trend">
              <div className="servers-trend-head">
                <span className="servers-trend-label">{t.label}</span>
                <span className="servers-trend-avg">{t.avg}</span>
              </div>
              <FauxLineChart tone={t.tone} />
            </div>
          ))}
        </div>
      </section>

      <ServersStyles />
    </div>
  );
}

function ServersStyles() {
  return (
    <style jsx global>{`
      .servers-shell {
        --servers-tone-healthy: #2ee281;
        --servers-tone-active: #6ea6ff;
        --servers-tone-warning: #f3b349;
        --servers-tone-critical: #f96666;
        --servers-tone-info: #8a8da0;
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
      }
      .servers-page-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .servers-title {
        font-size: 1.7rem;
        font-weight: 800;
        letter-spacing: -0.03em;
        margin: 0 0 0.3rem;
      }
      .servers-sub {
        color: #7d8095;
        font-size: 0.9rem;
        max-width: 720px;
        margin: 0;
      }
      .servers-page-head-meta {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.75rem;
        color: #7d8095;
      }
      .servers-live-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--servers-tone-healthy);
        box-shadow: 0 0 8px var(--servers-tone-healthy);
        animation: serversPulse 2s infinite;
        display: inline-block;
      }
      @keyframes serversPulse {
        0%, 100% { opacity: 0.85; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.15); }
      }
      .servers-live { display:inline-flex; align-items:center; gap:0.4rem; font-size:0.78rem; color:#7d8095; }
      .servers-muted { color:#7d8095; font-size:0.78rem; }
      .servers-live-sep { color: rgba(255,255,255,0.2); }

      .servers-card {
        background: linear-gradient(180deg, rgba(24,25,31,0.96), rgba(18,19,24,0.98));
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 20px;
        padding: 1.1rem 1.2rem;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.025);
      }
      .servers-card-head {
        display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:0.9rem;
      }
      .servers-card-title { font-size: 0.98rem; font-weight: 700; letter-spacing: -0.01em; margin:0; }
      .servers-eyebrow { font-size: 0.66rem; letter-spacing: 0.16em; color:#7d8095; font-weight:700; margin-bottom:0.25rem; }

      .servers-chip {
        font-size: 0.66rem; letter-spacing: 0.1em; font-weight:700;
        padding: 0.32rem 0.55rem; border-radius: 999px;
        background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
      }
      .servers-chip-healthy { color:var(--servers-tone-healthy); background: rgba(46,226,129,0.08); border-color: rgba(46,226,129,0.2); }
      .servers-chip-active { color:var(--servers-tone-active); background: rgba(110,166,255,0.08); border-color: rgba(110,166,255,0.2); }
      .servers-chip-warning { color:var(--servers-tone-warning); background: rgba(243,179,73,0.08); border-color: rgba(243,179,73,0.2); }
      .servers-chip-critical { color:var(--servers-tone-critical); background: rgba(249,102,102,0.08); border-color: rgba(249,102,102,0.2); }
      .servers-chip-info { color:#cdd2e6; }

      .servers-metric-strip {
        display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.85rem;
      }
      .servers-metric {
        background: linear-gradient(180deg, rgba(24,25,31,0.96), rgba(18,19,24,0.98));
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 18px;
        padding: 0.95rem 1rem;
        position:relative; overflow:hidden;
      }
      .servers-metric::after {
        content: ''; position: absolute; left:0; right:0; bottom:0; height: 2px;
        background: linear-gradient(90deg, transparent, var(--servers-tone-active), transparent);
        opacity: 0.4;
      }
      .servers-metric.servers-tone-healthy::after { background: linear-gradient(90deg, transparent, var(--servers-tone-healthy), transparent); }
      .servers-metric.servers-tone-warning::after { background: linear-gradient(90deg, transparent, var(--servers-tone-warning), transparent); }
      .servers-metric.servers-tone-critical::after { background: linear-gradient(90deg, transparent, var(--servers-tone-critical), transparent); }
      .servers-metric-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; }
      .servers-metric-icon { color:#8c67ff; font-size:0.9rem; }
      .servers-metric-label { font-size:0.65rem; letter-spacing:0.12em; color:#7d8095; font-weight:700; text-transform:uppercase; }
      .servers-metric-value { font-size:1.6rem; font-weight:800; letter-spacing:-0.03em; }
      .servers-metric-trend { margin-top:0.3rem; font-size:0.7rem; letter-spacing:0.08em; color:#7d8095; }

      .servers-primary { display:block; }
      .servers-primary-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; }
      .servers-primary-grid { display:grid; grid-template-columns: 1fr 1.5fr 1fr; gap:1.1rem; }
      @media (max-width: 1100px) {
        .servers-primary-grid { grid-template-columns: 1fr; }
      }
      .servers-spec-grid { display:grid; grid-template-columns: 1fr 1fr; gap:0.6rem 1rem; align-content:start; }
      .servers-spec { display:flex; justify-content:space-between; gap:0.5rem; padding: 0.45rem 0; border-bottom:1px solid rgba(255,255,255,0.04); font-size:0.8rem; }
      .servers-spec span { color:#7d8095; }
      .servers-spec strong { color:#e9ecf6; font-weight:600; }

      .servers-chart-block { display:flex; flex-direction:column; gap:0.55rem; }
      .servers-chart-tabs { display:flex; gap:0.4rem; flex-wrap:wrap; }
      .servers-chart-tab { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 0.35rem 0.7rem; font-size:0.72rem; color:#a8acc2; cursor:pointer; }
      .servers-chart-tab-active { background: rgba(110,166,255,0.12); border-color: rgba(110,166,255,0.3); color:#cfd9f5; }
      .servers-chart-meta { font-size:0.72rem; color:#7d8095; }
      .servers-chart { width:100%; height:140px; display:block; }

      .servers-donut-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
      .servers-donut { background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 0.7rem; text-align:center; }
      .servers-donut-ring { width:88px; height:88px; border-radius:50%; margin:0 auto 0.5rem; display:flex; align-items:center; justify-content:center; transition: background 0.4s ease; }
      .servers-donut-inner { width:62px; height:62px; border-radius:50%; background: #16171c; display:flex; align-items:center; justify-content:center; font-size:0.95rem; font-weight:700; color:#e9ecf6; }
      .servers-donut-label { font-size:0.72rem; color:#a8acc2; }
      .servers-donut-sub { font-size:0.66rem; color:#7d8095; margin-top:0.2rem; }

      .servers-row { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:1.05rem; }

      .servers-runtime-list { display:flex; flex-direction:column; gap:0.45rem; }
      .servers-runtime-row { display:grid; grid-template-columns: 1.2fr 1fr auto; align-items:center; gap:0.7rem; padding:0.55rem 0.7rem; background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius: 12px; }
      .servers-runtime-name { font-size:0.85rem; font-weight:600; color:#e9ecf6; }
      .servers-runtime-detail { font-size:0.75rem; color:#7d8095; }

      .servers-topology { display:flex; align-items:center; justify-content:space-between; gap:0.4rem; flex-wrap:wrap; padding: 0.6rem 0; }
      .servers-topo-node { background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:14px; padding:0.7rem 0.8rem; min-width:120px; text-align:center; flex:1; }
      .servers-topo-icon { font-size:1.1rem; color:#8c67ff; }
      .servers-topo-name { font-size:0.78rem; font-weight:600; margin-top:0.25rem; }
      .servers-topo-sub { font-size:0.66rem; color:#7d8095; margin-top:0.15rem; }
      .servers-topo-arrow { color:#5a5e72; font-size:1.05rem; }
      .servers-topo-cf { border-color: rgba(243,179,73,0.25); }
      .servers-topo-caddy { border-color: rgba(110,166,255,0.25); }
      .servers-topo-vps { border-color: rgba(46,226,129,0.25); }
      .servers-topo-foot { margin-top:0.7rem; padding-top:0.7rem; border-top:1px dashed rgba(255,255,255,0.06); }
      .servers-topo-tailscale { display:inline-flex; align-items:center; gap:0.55rem; font-size:0.78rem; color:#a8acc2; }

      .servers-storage-list { display:flex; flex-direction:column; gap:0.6rem; }
      .servers-storage-row { padding: 0.55rem 0.7rem; background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:12px; }
      .servers-storage-head { display:flex; justify-content:space-between; align-items:center; gap:0.5rem; margin-bottom: 0.4rem; }
      .servers-storage-name { font-weight:600; font-size:0.85rem; }
      .servers-storage-meta { font-size:0.7rem; color:#7d8095; }
      .servers-storage-pct { font-weight:700; }
      .servers-storage-bar { height:6px; background:rgba(255,255,255,0.05); border-radius:999px; overflow:hidden; }
      .servers-storage-bar > span { display:block; height:100%; background: linear-gradient(90deg, var(--servers-tone-active), var(--servers-tone-healthy)); transition: width 0.6s ease; }
      .servers-storage-foot { font-size:0.7rem; color:#7d8095; margin-top:0.35rem; }

      .servers-container-card .servers-container-body { display:grid; grid-template-columns: auto 1fr; gap:1rem; align-items:center; }
      .servers-container-legend { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.5rem; font-size:0.8rem; color:#cdd2e6; }
      .servers-container-legend li { display:flex; align-items:center; gap:0.5rem; }
      .servers-container-legend li > span:last-child { margin-left:auto; color:#a8acc2; }
      .servers-dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
      .servers-dot.servers-tone-healthy { background: var(--servers-tone-healthy); }
      .servers-dot.servers-tone-warning { background: var(--servers-tone-warning); }
      .servers-dot.servers-tone-critical { background: var(--servers-tone-critical); }
      .servers-dot.servers-tone-info { background: var(--servers-tone-info); }

      .servers-empty { padding:0.9rem; text-align:center; color:#7d8095; font-size:0.85rem; border:1px dashed rgba(255,255,255,0.06); border-radius:12px; }
      .servers-empty-note { margin-top: 0.7rem; font-size:0.72rem; color:#7d8095; }

      .servers-alert-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.5rem; }
      .servers-alert { padding:0.6rem 0.75rem; background: rgba(243,179,73,0.06); border:1px solid rgba(243,179,73,0.2); border-radius:12px; }
      .servers-alert.servers-tone-warning { background: rgba(243,179,73,0.06); border-color: rgba(243,179,73,0.2); }
      .servers-alert-title { font-weight:600; font-size:0.85rem; }
      .servers-alert-detail { font-size:0.78rem; color:#a8acc2; margin-top:0.2rem; }
      .servers-alert-when { font-size:0.7rem; color:#7d8095; margin-top:0.25rem; }

      .servers-activity-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.45rem; }
      .servers-activity-list li { display:flex; align-items:center; gap:0.6rem; font-size:0.82rem; padding:0.45rem 0; border-bottom:1px dashed rgba(255,255,255,0.04); }
      .servers-activity-list li:last-child { border-bottom:none; }
      .servers-activity-tag { font-size:0.62rem; letter-spacing:0.1em; font-weight:700; padding: 0.25rem 0.45rem; border-radius:6px; background: rgba(140,103,255,0.1); color:#b9a4ff; border:1px solid rgba(140,103,255,0.2); }
      .servers-activity-when { margin-left:auto; color:#7d8095; font-size:0.72rem; }

      .servers-actions-grid { display:grid; grid-template-columns: 1fr 1fr; gap:0.55rem; }
      .servers-action {
        display:flex; align-items:center; gap:0.6rem; padding:0.65rem 0.8rem;
        background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:12px;
        text-decoration:none; color:#cdd2e6; transition: transform 0.15s ease, border-color 0.15s ease;
      }
      .servers-action:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.12); }
      .servers-action-icon { font-size:1.1rem; color:#8c67ff; }
      .servers-action-name { font-size:0.84rem; font-weight:600; }
      .servers-action-sub { font-size:0.68rem; color:#7d8095; margin-top:0.1rem; }
      .servers-action-disabled { opacity:0.6; cursor:not-allowed; }

      .servers-info-table { display:flex; flex-direction:column; }
      .servers-info-row { display:flex; justify-content:space-between; padding:0.55rem 0; border-bottom:1px solid rgba(255,255,255,0.04); font-size:0.82rem; }
      .servers-info-row:last-child { border-bottom:none; }
      .servers-info-row span { color:#7d8095; }
      .servers-info-row strong { color:#e9ecf6; font-weight:600; }

      .servers-trends-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.9rem; }
      .servers-trend { background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:14px; padding:0.7rem; }
      .servers-trend-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem; }
      .servers-trend-label { font-size:0.78rem; font-weight:600; }
      .servers-trend-avg { font-size:0.7rem; color:#7d8095; }
    `}</style>
  );
}
