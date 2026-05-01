'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { InfrastructureStorageSnapshot } from '@/lib/infrastructure';
import {
  describeClickHouse,
  describeLangfuse,
  describeLiteLlm,
  describeN8n,
  describeRedis,
  formatRuntimeSource,
  resolveRuntimeSource,
  type PlatformServicesSnapshot,
  type PlatformTone,
} from '@/lib/platform-service-shared';

type Tone = PlatformTone;

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

function stripScheme(value: string | null | undefined) {
  if (!value) return 'Not available';
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function StatusChip({ label, tone = 'active' }: { label: string; tone?: Tone }) {
  return <span className={`dash-chip dash-tone-${tone}`}>● {label}</span>;
}

function MiniSparkline({ tone = 'active' }: { tone?: Tone }) {
  const points = [12, 18, 14, 22, 18, 26, 24, 30, 22, 28, 26, 34, 30, 38, 34, 42];
  const width = 220;
  const height = 40;
  const max = 50;
  const stepX = width / (points.length - 1);
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${(index * stepX).toFixed(1)},${(height - (point / max) * height).toFixed(1)}`)
    .join(' ');

  return (
    <svg className="dash-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke={`var(--dash-tone-${tone})`} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

interface ServiceCardModel {
  name: string;
  desc: string;
  tone: Tone;
  statusLabel: string;
  href: string;
  external?: boolean;
  rows?: Array<{ label: string; value: string }>;
  icon: string;
  accent?: string;
  publicSurface?: boolean;
}

function ServiceCard({ card }: { card: ServiceCardModel }) {
  const inner = (
    <>
      <div className="dash-svc-head">
        <div className="dash-svc-icon" style={{ background: card.accent }}>{card.icon}</div>
        <div className="dash-svc-name">{card.name}</div>
        <StatusChip label={card.statusLabel} tone={card.tone} />
      </div>
      <div className="dash-svc-desc">{card.desc}</div>
      {card.rows ? (
        <div className="dash-svc-rows">
          {card.rows.map((row) => (
            <div key={row.label} className="dash-svc-row">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <div className="dash-svc-foot">
        <MiniSparkline tone={card.tone === 'critical' ? 'warning' : card.tone} />
        <span className="dash-svc-cta">{card.external ? 'Open ↗' : 'View →'}</span>
      </div>
    </>
  );

  return card.external ? (
    <a href={card.href} target="_blank" rel="noopener noreferrer" className="dash-svc-card">{inner}</a>
  ) : (
    <a href={card.href} className="dash-svc-card">{inner}</a>
  );
}

export default function DashboardClient({
  storage,
  services,
}: {
  storage: InfrastructureStorageSnapshot;
  services: PlatformServicesSnapshot;
}) {
  const [now, setNow] = useState<string>(new Date().toISOString());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const totalBytes = storage.available ? storage.total.totalBytes : 0;
  const usedBytes = storage.available ? storage.total.usedBytes : 0;
  const diskPct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : null;

  const liteLlmStatus = describeLiteLlm(services);
  const n8nStatus = describeN8n(services);
  const langfuseStatus = describeLangfuse(services);
  const clickhouseStatus = describeClickHouse(services);
  const redisStatus = describeRedis(services);

  const n8nPrimary = services.n8n.containers[0] || null;
  const litellmPrimary = services.litellm.containers[0] || null;
  const langfusePrimary = services.langfuse.containers[0] || null;
  const clickhousePrimary = services.clickhouse.containers[0] || null;

  const aiServices: ServiceCardModel[] = [
    {
      name: 'vLLM Gateway',
      desc: 'High-throughput LLM inference gateway and routing.',
      tone: 'warning',
      statusLabel: 'PLANNED',
      icon: '◉',
      accent: 'rgba(140,103,255,0.18)',
      href: '/admin/service-endpoints/vllm',
      publicSurface: true,
      rows: [
        { label: 'Public', value: 'vllm.getouch.co/v1' },
        { label: 'Backend', value: 'Not Deployed' },
      ],
    },
    {
      name: 'LiteLLM Gateway',
      desc: 'OpenAI-compatible model proxy and routing gateway for multiple model providers.',
      tone: liteLlmStatus.tone,
      statusLabel: liteLlmStatus.label,
      icon: '◎',
      accent: 'rgba(110,166,255,0.16)',
      href: '/admin/service-endpoints/litellm',
      publicSurface: true,
      rows: [
        { label: 'Public', value: stripScheme(services.litellm.publicUrl) },
        { label: 'Runtime', value: litellmPrimary?.name || 'Not detected' },
      ],
    },
    {
      name: 'Open WebUI',
      desc: 'AI chat, RAG, workflows, and operator tooling.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '◌',
      accent: 'rgba(46,226,129,0.16)',
      href: 'https://ai.getouch.co',
      external: true,
      publicSurface: true,
      rows: [{ label: 'URL', value: 'ai.getouch.co' }],
    },
    {
      name: 'Dify',
      desc: 'AI workflow and bot builder console.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '◍',
      accent: 'rgba(110,166,255,0.16)',
      href: '/admin/service-endpoints/dify',
      publicSurface: true,
      rows: [{ label: 'Console', value: 'dify.getouch.co' }],
    },
    {
      name: 'MCP Endpoint',
      desc: 'Model Context Protocol endpoint for tool integrations.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '⌬',
      accent: 'rgba(78,206,199,0.16)',
      href: '/admin/service-endpoints/mcp',
      publicSurface: true,
      rows: [{ label: 'Endpoint', value: 'mcp.getouch.co/mcp' }],
    },
  ];

  const automationServices: ServiceCardModel[] = [
    {
      name: 'n8n Workflows',
      desc: 'Workflow automation and integration runner for webhooks, scheduled jobs, and AI-triggered actions.',
      tone: n8nStatus.tone,
      statusLabel: n8nStatus.label,
      icon: '⇄',
      accent: 'rgba(243,179,73,0.16)',
      href: '/admin/automation/n8n',
      publicSurface: true,
      rows: [
        { label: 'Configured URL', value: stripScheme(services.n8n.publicUrl) },
        { label: 'Runtime', value: n8nPrimary?.name || 'Not detected' },
      ],
    },
  ];

  const commsServices: ServiceCardModel[] = [
    {
      name: 'Evolution Gateway',
      desc: 'WhatsApp Business API gateway and automation.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '◈',
      accent: 'rgba(46,226,129,0.16)',
      href: '/admin/service-endpoints/evolution',
      publicSurface: true,
      rows: [{ label: 'API', value: 'wa.getouch.co' }],
    },
    {
      name: 'Baileys Gateway',
      desc: 'WhatsApp automation via Baileys multi-device.',
      tone: 'active',
      statusLabel: 'RUNTIME OK',
      icon: '◌',
      accent: 'rgba(110,166,255,0.16)',
      href: '/admin/service-endpoints/baileys',
      rows: [{ label: 'Sessions', value: 'See console' }],
    },
    {
      name: 'Chatwoot',
      desc: 'Omnichannel customer support and live chat.',
      tone: 'active',
      statusLabel: 'INSTALLED',
      icon: '◑',
      accent: 'rgba(110,166,255,0.16)',
      href: '/admin/service-endpoints/chatwoot',
      publicSurface: true,
      rows: [{ label: 'App', value: 'chatwoot.getouch.co' }],
    },
    {
      name: 'FusionPBX / Voice',
      desc: 'VoIP PBX platform for voice calls and routing.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '☎',
      accent: 'rgba(243,179,73,0.16)',
      href: '/admin/service-endpoints/voice',
      rows: [{ label: 'Module', value: 'FusionPBX' }],
    },
  ];

  const opsServices: ServiceCardModel[] = [
    {
      name: 'Coolify',
      desc: 'Self-hosted PaaS for deployments.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '◈',
      accent: 'rgba(46,226,129,0.14)',
      href: 'https://coolify.getouch.co',
      external: true,
      publicSurface: true,
    },
    {
      name: 'Grafana',
      desc: 'Monitoring and observability dashboards.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '◔',
      accent: 'rgba(243,179,73,0.14)',
      href: 'https://grafana.getouch.co',
      external: true,
      publicSurface: true,
    },
    {
      name: 'Langfuse',
      desc: 'AI observability, tracing, and evaluation surface.',
      tone: langfuseStatus.tone,
      statusLabel: langfuseStatus.label,
      icon: '◎',
      accent: 'rgba(140,103,255,0.14)',
      href: '/admin/operations/langfuse',
      publicSurface: true,
      rows: [
        { label: 'Public URL', value: stripScheme(services.langfuse.publicUrl) },
        { label: 'Runtime', value: langfusePrimary?.name || 'Not detected' },
      ],
    },
    {
      name: 'PostgreSQL 16',
      desc: 'Primary database engine for platform data.',
      tone: 'healthy',
      statusLabel: 'HEALTHY',
      icon: '▤',
      accent: 'rgba(110,166,255,0.14)',
      href: '/admin/databases',
    },
    {
      name: 'ClickHouse',
      desc: 'AI trace analytics store for Langfuse workloads.',
      tone: clickhouseStatus.tone,
      statusLabel: clickhouseStatus.label,
      icon: '▥',
      accent: 'rgba(110,166,255,0.14)',
      href: '/admin/databases',
      rows: [
        { label: 'Public URL', value: stripScheme(services.clickhouse.publicUrl) },
        { label: 'Runtime', value: clickhousePrimary?.name || 'Not detected' },
      ],
    },
    {
      name: 'Redis / Queue Cache',
      desc: 'Internal cache and background-job queue dependency.',
      tone: redisStatus.tone,
      statusLabel: redisStatus.label,
      icon: '◫',
      accent: 'rgba(46,226,129,0.14)',
      href: '/admin/databases',
      rows: [
        { label: 'Primary', value: services.redis.primary?.name || 'Not detected' },
        { label: 'Exposure', value: 'Internal only' },
      ],
    },
    {
      name: 'Caddy Reverse Proxy',
      desc: 'TLS termination and routing for main workloads.',
      tone: 'active',
      statusLabel: 'ACTIVE',
      icon: '◉',
      accent: 'rgba(110,166,255,0.14)',
      href: '/admin/servers',
    },
    {
      name: 'Cloudflare Tunnel',
      desc: 'Secure ingress routing via Cloudflare.',
      tone: 'active',
      statusLabel: 'ACTIVE',
      icon: '◇',
      accent: 'rgba(243,179,73,0.14)',
      href: '/admin/servers',
    },
    {
      name: 'Mail Services',
      desc: 'Inbound, outbound, and admin mail flows.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '✉',
      accent: 'rgba(46,226,129,0.14)',
      href: 'https://mail.getouch.co',
      external: true,
      publicSurface: true,
    },
    {
      name: 'Object Storage',
      desc: 'S3-compatible object storage for tenants.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '▦',
      accent: 'rgba(110,166,255,0.14)',
      href: '/admin/service-endpoints/object-storage',
    },
    {
      name: 'pgAdmin',
      desc: 'Database administration UI.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '⌨',
      accent: 'rgba(140,103,255,0.14)',
      href: 'https://db.getouch.co',
      external: true,
      publicSurface: true,
    },
  ];

  const trackedServices = [...aiServices, ...automationServices, ...commsServices, ...opsServices];
  const total = trackedServices.length;
  const healthy = trackedServices.filter((service) => service.tone === 'healthy' || service.tone === 'active').length;
  const degraded = trackedServices.filter((service) => service.tone === 'warning' || service.tone === 'critical').length;
  const aiUp = aiServices.filter((service) => service.tone === 'healthy' || service.tone === 'active').length;
  const automationUp = automationServices.filter((service) => service.tone === 'healthy' || service.tone === 'active').length;
  const commsUp = commsServices.filter((service) => service.tone === 'healthy' || service.tone === 'active').length;
  const publicApps = trackedServices.filter((service) => service.publicSurface).length;

  const alerts: Array<{ title: string; detail: string; tone: Tone }> = [];
  if (diskPct !== null && diskPct >= 80) {
    alerts.push({ title: 'Disk usage high', detail: `Root filesystem at ${diskPct}%`, tone: 'warning' });
  }
  alerts.push({ title: 'vLLM Gateway not deployed', detail: 'Backend planned, public endpoint reserved.', tone: 'warning' });
  if (liteLlmStatus.tone === 'info') {
    alerts.push({ title: 'LiteLLM Gateway not installed', detail: 'Model routing layer planned on llm.getouch.co.', tone: 'info' });
  }
  if (n8nStatus.label === 'INSTALLED') {
    alerts.push({ title: 'n8n installed, metrics pending', detail: 'Workflow counts and execution metrics are not wired yet.', tone: 'info' });
  }
  if (n8nStatus.tone === 'warning') {
    alerts.push({ title: 'n8n Workflows unavailable', detail: n8nStatus.detail, tone: 'warning' });
  }
  if (langfuseStatus.tone === 'info') {
    alerts.push({ title: 'Langfuse not installed', detail: 'Tracing UI and origin route are planned but not live yet.', tone: 'info' });
  }
  if (services.clickhouse.publicOriginCode !== null && services.clickhouse.publicOriginCode !== 421) {
    alerts.push({ title: 'ClickHouse exposure requires review', detail: 'Confirm auth or keep ClickHouse internal-only before public use.', tone: 'warning' });
  }
  if (services.redis.publicOriginCode !== null) {
    alerts.push({ title: 'Redis must stay internal', detail: 'Redis exposure should not be public.', tone: 'critical' });
  }

  const recentActivity = [
    n8nStatus.tone === 'healthy'
      ? 'n8n runtime is healthy from the news Docker Compose stack.'
      : 'n8n workflow metrics are awaiting API integration.',
    liteLlmStatus.detail,
    langfuseStatus.detail,
    `Redis inventory shows ${services.redis.containers.length || 0} internal runtime${services.redis.containers.length === 1 ? '' : 's'}.`,
  ];

  return (
    <div className="dash-shell">
      <header className="dash-page-head">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-sub">Unified overview of infrastructure, AI services, automation, communications, and observability.</p>
        </div>
        <div className="dash-page-meta">
          <span className="dash-live-dot" /> Live · {new Date(now).toLocaleString()}
        </div>
      </header>

      <div className="dash-summary-grid">
        <SummaryCard label="Total Services" value={String(total)} icon="▣" tone="info" detail="Tracked surfaces" />
        <SummaryCard label="Healthy" value={String(healthy)} icon="♡" tone="healthy" detail={`${Math.round((healthy / total) * 100)}% of total`} />
        <SummaryCard label="Degraded" value={String(degraded)} icon="△" tone={degraded > 0 ? 'warning' : 'healthy'} detail={degraded > 0 ? 'Action recommended' : 'All clear'} />
        <SummaryCard label="AI Services Online" value={`${aiUp} / ${aiServices.length}`} icon="◉" tone={aiUp === aiServices.length ? 'healthy' : 'warning'} detail={aiUp === aiServices.length ? 'All AI services up' : 'Tracked with planned gaps'} />
        <SummaryCard label="Automation Online" value={`${automationUp} / ${automationServices.length}`} icon="⇄" tone={automationUp === automationServices.length ? 'healthy' : 'warning'} detail={automationUp === automationServices.length ? 'Automation live' : 'See runtime status'} />
        <SummaryCard label="Communication Channels" value={`${commsUp} / ${commsServices.length}`} icon="◈" tone="healthy" detail="Channels active" />
        <SummaryCard label="Public Apps" value={String(publicApps)} icon="▥" tone="active" detail="Tracked public-facing surfaces" />
        <SummaryCard label="Alerts" value={String(alerts.length)} icon="⚠" tone={alerts.length > 0 ? 'warning' : 'healthy'} detail={alerts.length > 0 ? 'Action required' : 'No alerts'} />
        <SummaryCard label="Disk Usage" value={diskPct !== null ? `${diskPct}%` : 'N/A'} icon="▦" tone={diskPct !== null && diskPct >= 80 ? 'warning' : 'healthy'} detail={diskPct !== null ? `${formatStorage(usedBytes)} / ${formatStorage(totalBytes)}` : 'No data'} />
      </div>

      <div className="dash-main-grid">
        <div className="dash-col-main">
          <Section title="AI Stack Overview" link={{ label: 'View all AI services →', href: '/admin/service-endpoints/litellm' }} accent="rgba(140,103,255,0.4)">
            <div className="dash-svc-grid">
              {aiServices.map((card) => <ServiceCard key={card.name} card={card} />)}
            </div>
          </Section>

          <Section title="Automation Overview" link={{ label: 'View automation →', href: '/admin/automation/n8n' }} accent="rgba(243,179,73,0.4)">
            <div className="dash-svc-grid">
              {automationServices.map((card) => <ServiceCard key={card.name} card={card} />)}
            </div>
          </Section>

          <Section title="Communications Overview" link={{ label: 'View all communications →', href: '/admin/service-endpoints/evolution' }} accent="rgba(78,206,199,0.4)">
            <div className="dash-svc-grid">
              {commsServices.map((card) => <ServiceCard key={card.name} card={card} />)}
            </div>
          </Section>

          <Section title="Operations & Infrastructure" accent="rgba(110,166,255,0.4)">
            <div className="dash-ops-grid">
              {opsServices.map((card) => <ServiceCard key={card.name} card={card} />)}
            </div>
          </Section>
        </div>

        <aside className="dash-col-side">
          <Panel title="Quick Actions">
            <div className="dash-actions">
              <a href="https://coolify.getouch.co" target="_blank" rel="noopener noreferrer" className="dash-action">Open Coolify</a>
              <a href="https://grafana.getouch.co" target="_blank" rel="noopener noreferrer" className="dash-action">Open Grafana</a>
              <a href="https://ai.getouch.co" target="_blank" rel="noopener noreferrer" className="dash-action">Open WebUI</a>
              <a href="https://chatwoot.getouch.co" target="_blank" rel="noopener noreferrer" className="dash-action">Open Chatwoot</a>
              <a href={services.n8n.publicUrl || '/admin/automation/n8n'} target={services.n8n.publicUrl ? '_blank' : undefined} rel={services.n8n.publicUrl ? 'noopener noreferrer' : undefined} className="dash-action">Open n8n</a>
              <a href="/admin/service-endpoints/litellm" className="dash-action">LiteLLM Gateway</a>
              <a href="/admin/api-keys" className="dash-action">Manage API Keys</a>
              <a href="/admin/service-endpoints/mcp" className="dash-action">MCP Endpoint</a>
              <a href="/admin/service-endpoints/baileys" className="dash-action">Baileys Gateway</a>
              <a href="/admin/quick-links" className="dash-action">Quick Links</a>
            </div>
          </Panel>

          <Panel title="Alerts / Action Required">
            {alerts.length === 0 ? (
              <div className="dash-empty">No active alerts.</div>
            ) : (
              <ul className="dash-alert-list">
                {alerts.map((alert) => (
                  <li key={`${alert.title}-${alert.detail}`} className={`dash-alert dash-tone-${alert.tone}`}>
                    <div className="dash-alert-title">⚠ {alert.title}</div>
                    <div className="dash-alert-detail">{alert.detail}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Environment">
            <ul className="dash-env-list">
              <li><span>Environment</span><strong>Production</strong></li>
              <li><span>Runtime</span><strong>Coolify + Compose</strong></li>
              <li><span>Automation</span><strong>{n8nStatus.label === 'ONLINE' ? 'n8n' : 'n8n planned/partial'}</strong></li>
              <li><span>Model Router</span><strong>{liteLlmStatus.label}</strong></li>
              <li><span>Observability</span><strong>{langfuseStatus.label}</strong></li>
              <li><span>Queue / Cache</span><strong>{redisStatus.label}</strong></li>
            </ul>
          </Panel>

          <Panel title="Network">
            <ul className="dash-env-list">
              <li><span>Public IP</span><strong>100.84.14.93</strong></li>
              <li><span>Domain</span><strong>getouch.co</strong></li>
              <li><span>Reverse Proxy</span><strong>Caddy</strong></li>
              <li><span>Tunnel</span><strong>Cloudflare</strong></li>
              <li><span>n8n Route</span><strong>{services.n8n.publicOriginCode === 200 ? 'Origin live' : 'Configured / pending edge'}</strong></li>
              <li><span>LiteLLM Route</span><strong>{services.litellm.publicOriginCode === 421 ? 'Reserved only' : 'Check route'}</strong></li>
            </ul>
          </Panel>

          <Panel title="Recent Activity">
            <ul className="dash-activity">
              {recentActivity.map((item) => (
                <li key={item}><span className="dash-act-tag">Auto</span>{item}</li>
              ))}
            </ul>
            <div className="dash-empty-note">Runtime sources: n8n {formatRuntimeSource(resolveRuntimeSource(n8nPrimary))}, LiteLLM {formatRuntimeSource(resolveRuntimeSource(litellmPrimary))}, Langfuse {formatRuntimeSource(resolveRuntimeSource(langfusePrimary))}.</div>
          </Panel>
        </aside>
      </div>

      <DashboardStyles />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone = 'info',
  detail,
}: {
  label: string;
  value: string;
  icon: string;
  tone?: Tone;
  detail?: string;
}) {
  return (
    <section className="dash-summary">
      <div className="dash-summary-head">
        <span className="dash-summary-label">{label}</span>
        <span className="dash-summary-icon">{icon}</span>
      </div>
      <div className={`dash-summary-value dash-tone-${tone}-text`}>{value}</div>
      {detail ? <div className="dash-summary-detail">{detail}</div> : null}
    </section>
  );
}

function Section({
  title,
  link,
  accent,
  children,
}: {
  title: string;
  link?: { label: string; href: string };
  accent?: string;
  children: ReactNode;
}) {
  return (
    <section className="dash-section">
      <header className="dash-section-head">
        <span className="dash-section-bar" style={{ background: accent }} />
        <h2 className="dash-section-title">{title}</h2>
        {link ? <a href={link.href} className="dash-section-link">{link.label}</a> : null}
      </header>
      {children}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dash-panel">
      <h3 className="dash-panel-title">{title}</h3>
      {children}
    </section>
  );
}

function DashboardStyles() {
  return (
    <style jsx global>{`
      .dash-shell {
        --dash-tone-healthy: #2ee281;
        --dash-tone-active: #6ea6ff;
        --dash-tone-warning: #f3b349;
        --dash-tone-critical: #f96666;
        --dash-tone-info: #8a8da0;
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
      }
      .dash-page-head { display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:0.75rem; }
      .dash-title { font-size:1.7rem; font-weight:800; letter-spacing:-0.03em; margin:0 0 0.3rem; }
      .dash-sub { color:#7d8095; font-size:0.92rem; max-width:780px; margin:0; }
      .dash-page-meta { font-size:0.75rem; color:#7d8095; display:inline-flex; align-items:center; gap:0.4rem; }
      .dash-live-dot { width:8px; height:8px; border-radius:50%; background:var(--dash-tone-healthy); box-shadow:0 0 8px var(--dash-tone-healthy); animation: dashPulse 2s infinite; display:inline-block; }
      @keyframes dashPulse { 0%,100% { opacity:0.85; transform:scale(1); } 50% { opacity:1; transform:scale(1.15); } }
      .dash-summary-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:0.85rem; }
      .dash-summary { background: linear-gradient(180deg, rgba(24,25,31,0.96), rgba(18,19,24,0.98)); border:1px solid rgba(255,255,255,0.06); border-radius:18px; padding:0.95rem 1rem; }
      .dash-summary-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; }
      .dash-summary-label { font-size:0.66rem; letter-spacing:0.12em; color:#7d8095; font-weight:700; text-transform:uppercase; }
      .dash-summary-icon { color:#8c67ff; font-size:0.95rem; }
      .dash-summary-value { font-size:1.65rem; font-weight:800; letter-spacing:-0.03em; }
      .dash-summary-detail { margin-top:0.35rem; font-size:0.75rem; color:#7d8095; }
      .dash-tone-healthy-text { color: var(--dash-tone-healthy); }
      .dash-tone-warning-text { color: var(--dash-tone-warning); }
      .dash-tone-critical-text { color: var(--dash-tone-critical); }
      .dash-tone-active-text { color:#dce1ff; }
      .dash-tone-info-text { color:#e9ecf6; }
      .dash-main-grid { display:grid; grid-template-columns: minmax(0, 2.5fr) minmax(280px, 1fr); gap:1.1rem; }
      @media (max-width: 1100px) { .dash-main-grid { grid-template-columns: 1fr; } }
      .dash-col-main { display:flex; flex-direction:column; gap:1.1rem; min-width:0; }
      .dash-col-side { display:flex; flex-direction:column; gap:0.85rem; }
      .dash-section { display:flex; flex-direction:column; gap:0.85rem; }
      .dash-section-head { display:flex; align-items:center; gap:0.7rem; }
      .dash-section-bar { width:4px; height:18px; border-radius:4px; background: rgba(140,103,255,0.4); }
      .dash-section-title { font-size:1rem; font-weight:700; margin:0; letter-spacing:-0.01em; }
      .dash-section-link { margin-left:auto; font-size:0.78rem; color:#8a8fb3; text-decoration:none; }
      .dash-section-link:hover { color:#cdd2e6; }
      .dash-svc-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:0.85rem; }
      .dash-ops-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:0.75rem; }
      .dash-svc-card { background: linear-gradient(180deg, rgba(24,25,31,0.96), rgba(18,19,24,0.98)); border:1px solid rgba(255,255,255,0.06); border-radius:18px; padding:1rem; text-decoration:none; color:#cdd2e6; display:flex; flex-direction:column; gap:0.55rem; transition: transform 0.15s ease, border-color 0.15s ease; }
      .dash-svc-card:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.12); }
      .dash-svc-head { display:flex; align-items:center; gap:0.55rem; }
      .dash-svc-icon { width:30px; height:30px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:0.95rem; color:#cdd2e6; background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); }
      .dash-svc-name { font-weight:700; font-size:0.92rem; color:#e9ecf6; flex:1; }
      .dash-svc-desc { font-size:0.78rem; color:#a8acc2; line-height:1.45; }
      .dash-svc-rows { display:flex; flex-direction:column; gap:0.25rem; margin-top:0.2rem; }
      .dash-svc-row { display:flex; justify-content:space-between; gap:0.65rem; font-size:0.72rem; }
      .dash-svc-row span { color:#7d8095; }
      .dash-svc-row strong { color:#dce1ff; font-weight:600; text-align:right; }
      .dash-svc-foot { display:flex; align-items:center; justify-content:space-between; margin-top:0.4rem; }
      .dash-spark { width: 80px; height: 24px; opacity: 0.7; }
      .dash-svc-cta { font-size:0.72rem; color:#a8acc2; }
      .dash-chip { font-size:0.62rem; letter-spacing:0.08em; font-weight:700; padding:0.25rem 0.5rem; border-radius:999px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); }
      .dash-tone-healthy { color:var(--dash-tone-healthy); background:rgba(46,226,129,0.08); border-color:rgba(46,226,129,0.2); }
      .dash-tone-active { color:var(--dash-tone-active); background:rgba(110,166,255,0.08); border-color:rgba(110,166,255,0.2); }
      .dash-tone-warning { color:var(--dash-tone-warning); background:rgba(243,179,73,0.08); border-color:rgba(243,179,73,0.2); }
      .dash-tone-critical { color:var(--dash-tone-critical); background:rgba(249,102,102,0.08); border-color:rgba(249,102,102,0.2); }
      .dash-tone-info { color:#cdd2e6; background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.1); }
      .dash-panel { background: linear-gradient(180deg, rgba(24,25,31,0.96), rgba(18,19,24,0.98)); border:1px solid rgba(255,255,255,0.06); border-radius:18px; padding:0.9rem 1rem; }
      .dash-panel-title { margin:0 0 0.65rem; font-size:0.85rem; font-weight:700; letter-spacing:-0.01em; }
      .dash-actions { display:grid; grid-template-columns: 1fr 1fr; gap:0.45rem; }
      .dash-action { background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:0.55rem 0.65rem; text-decoration:none; color:#cdd2e6; font-size:0.78rem; text-align:left; }
      .dash-action:hover { background: rgba(255,255,255,0.06); }
      .dash-env-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; }
      .dash-env-list li { display:flex; justify-content:space-between; gap:0.65rem; padding:0.45rem 0; border-bottom:1px solid rgba(255,255,255,0.04); font-size:0.78rem; }
      .dash-env-list li:last-child { border-bottom:none; }
      .dash-env-list span { color:#7d8095; }
      .dash-env-list strong { color:#e9ecf6; font-weight:600; text-align:right; }
      .dash-empty { padding:0.7rem; text-align:center; color:#7d8095; font-size:0.8rem; border:1px dashed rgba(255,255,255,0.06); border-radius:10px; }
      .dash-empty-note { margin-top:0.55rem; font-size:0.7rem; color:#7d8095; }
      .dash-alert-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.45rem; }
      .dash-alert { padding:0.55rem 0.7rem; border-radius:10px; border:1px solid transparent; }
      .dash-alert.dash-tone-warning { background: rgba(243,179,73,0.08); border-color: rgba(243,179,73,0.2); }
      .dash-alert.dash-tone-critical { background: rgba(249,102,102,0.08); border-color: rgba(249,102,102,0.2); }
      .dash-alert.dash-tone-info { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
      .dash-alert-title { font-size:0.82rem; font-weight:600; }
      .dash-alert-detail { font-size:0.74rem; color:#a8acc2; margin-top:0.2rem; }
      .dash-activity { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.4rem; font-size:0.78rem; }
      .dash-activity li { display:flex; align-items:center; gap:0.55rem; padding:0.4rem 0; border-bottom:1px dashed rgba(255,255,255,0.04); }
      .dash-activity li:last-child { border-bottom:none; }
      .dash-act-tag { font-size:0.6rem; font-weight:700; letter-spacing:0.08em; padding:0.2rem 0.4rem; border-radius:6px; background: rgba(140,103,255,0.1); color:#b9a4ff; border:1px solid rgba(140,103,255,0.2); }
    `}</style>
  );
}