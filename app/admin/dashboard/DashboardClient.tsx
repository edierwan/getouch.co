'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { InfrastructureStorageSnapshot } from '@/lib/infrastructure';
import {
  describeClickHouse,
  describeLangfuse,
  describeLiteLlm,
  describeN8n,
  describeRedis,
  describeServiceProbe,
  formatRuntimeSource,
  getCatalogService,
  resolveRuntimeSource,
  type PlatformServicesSnapshot,
  type PlatformTone,
} from '@/lib/platform-service-shared';

type Tone = PlatformTone;

type ServiceCardModel = {
  name: string;
  desc: string;
  tone: Tone;
  statusLabel: string;
  href: string;
  external?: boolean;
  rows?: Array<{ label: string; value: string }>;
  icon: string;
  accent?: string;
};

type SectionModel = {
  title: string;
  link?: { label: string; href: string };
  accent: string;
  cards: ServiceCardModel[];
};

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

function formatRouteCode(code: number | null | undefined) {
  if (code === null || code === undefined) return 'Unknown';
  return String(code);
}

function healthyCount(cards: ServiceCardModel[]) {
  return cards.filter((card) => card.tone === 'healthy' || card.tone === 'active').length;
}

function healthLabel(cards: ServiceCardModel[]) {
  return `${healthyCount(cards)} / ${cards.length}`;
}

function statusClassName(tone: Tone) {
  if (tone === 'warning' || tone === 'critical') return 'dash-tone-warning';
  if (tone === 'healthy') return 'dash-tone-healthy';
  if (tone === 'active') return 'dash-tone-active';
  return 'dash-tone-info';
}

function StatusChip({ label, tone = 'active' }: { label: string; tone?: Tone }) {
  return <span className={`dash-chip ${statusClassName(tone)}`}>● {label}</span>;
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
  accent: string;
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

function buildStaticCard(card: ServiceCardModel): ServiceCardModel {
  return card;
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

  const vllmProbe = getCatalogService(services, 'vllm');
  const vllmStatus = describeServiceProbe(vllmProbe, {
    requirePublicRoute: true,
    missingDetail: 'No healthy vLLM runtime is live on the public route.',
    degradedDetail: 'The vLLM origin currently returns 503 and needs runtime repair.',
  });
  const authentikProbe = getCatalogService(services, 'authentik');
  const authentikStatus = describeServiceProbe(authentikProbe, {
    requirePublicRoute: true,
    missingDetail: 'No Authentik runtime is installed yet.',
    onlineDetail: 'Authentik is online on sso.getouch.co. Admin onboarding is still required.',
  });
  const difyProbe = getCatalogService(services, 'dify');
  const difyStatus = describeServiceProbe(difyProbe, {
    requirePublicRoute: true,
    onlineDetail: 'Dify runtime and public route are healthy.',
  });
  const mcpProbe = getCatalogService(services, 'mcp');
  const mcpStatus = describeServiceProbe(mcpProbe, {
    requirePublicRoute: true,
    publicOnlyDetail: 'MCP is live through the portal-backed shared runtime.',
  });
  const qdrantProbe = getCatalogService(services, 'qdrant');
  const qdrantStatus = describeServiceProbe(qdrantProbe, {
    requirePublicRoute: true,
    missingDetail: 'Qdrant is not installed and the public route is not served.',
    onlineDetail: 'Qdrant is online and protected by API auth.',
  });
  const airbyteProbe = getCatalogService(services, 'airbyte');
  const airbyteStatus = describeServiceProbe(airbyteProbe, {
    requirePublicRoute: true,
    missingDetail: 'Airbyte is still blocked because this Coolify version has no built-in production template.',
  });
  const infisicalProbe = getCatalogService(services, 'infisical');
  const infisicalStatus = describeServiceProbe(infisicalProbe, {
    requirePublicRoute: true,
    missingDetail: 'Infisical is not installed and the public route is not served.',
    onlineDetail: 'Infisical is online. Admin onboarding is still required.',
  });
  const coolifyProbe = getCatalogService(services, 'coolify');
  const coolifyStatus = describeServiceProbe(coolifyProbe, {
    requirePublicRoute: true,
    onlineDetail: 'Coolify is online and protected by Cloudflare Access.',
  });
  const grafanaProbe = getCatalogService(services, 'grafana');
  const grafanaStatus = describeServiceProbe(grafanaProbe, {
    requirePublicRoute: true,
    onlineDetail: 'Grafana is online and responds with the expected login redirect.',
  });
  const openWebUiProbe = getCatalogService(services, 'open-webui');
  const openWebUiStatus = describeServiceProbe(openWebUiProbe, {
    requirePublicRoute: true,
    onlineDetail: 'Open WebUI is online on the public route.',
  });
  const evolutionProbe = getCatalogService(services, 'evolution');
  const evolutionStatus = describeServiceProbe(evolutionProbe, {
    installedDetail: 'Evolution runtime is healthy; origin verification is pending or route-specific.',
  });
  const baileysProbe = getCatalogService(services, 'baileys');
  const baileysStatus = describeServiceProbe(baileysProbe, {
    requirePublicRoute: true,
    installedDetail: 'Baileys runtime is healthy, but the root route does not expose a landing page.',
  });
  const chatwootProbe = getCatalogService(services, 'chatwoot');
  const chatwootStatus = describeServiceProbe(chatwootProbe, {
    requirePublicRoute: true,
    onlineDetail: 'Chatwoot is online and reachable through the public route.',
  });
  const voiceProbe = getCatalogService(services, 'voice');
  const voiceStatus = describeServiceProbe(voiceProbe, {
    installedDetail: 'FusionPBX runtime is healthy on the host.',
    missingDetail: 'No FusionPBX runtime is detected.',
  });
  const objectStorageProbe = getCatalogService(services, 'object-storage');
  const objectStorageStatus = describeServiceProbe(objectStorageProbe, {
    installedDetail: 'SeaweedFS object storage runtime is healthy on the host.',
    onlineDetail: 'Object storage runtime is healthy.',
  });

  const systemCards: ServiceCardModel[] = [
    buildStaticCard({
      name: 'Dashboard',
      desc: 'System summary and control-plane overview for the canonical portal IA.',
      tone: 'active',
      statusLabel: 'LIVE',
      icon: '⌘',
      accent: 'rgba(126,154,255,0.16)',
      href: '/admin/system/dashboard',
      rows: [
        { label: 'Updated', value: new Date(now).toLocaleTimeString() },
        { label: 'Tracked', value: 'Canonical route tree' },
      ],
    }),
    buildStaticCard({
      name: 'Servers & Nodes',
      desc: 'Primary VPS capacity, runtime health, and ingress topology.',
      tone: 'active',
      statusLabel: 'ONLINE',
      icon: '▣',
      accent: 'rgba(126,154,255,0.16)',
      href: '/admin/system/servers',
      rows: [
        { label: 'Node', value: 'Primary VPS' },
        { label: 'Runtime', value: 'Coolify + Docker' },
      ],
    }),
    {
      name: 'Authentik',
      desc: 'SSO, identity, and central login for the control plane.',
      tone: authentikStatus.tone,
      statusLabel: authentikStatus.label,
      icon: '⚲',
      accent: 'rgba(126,154,255,0.16)',
      href: '/admin/system/authentik',
      rows: [
        { label: 'Public', value: stripScheme(authentikProbe.publicUrl) },
        { label: 'Setup', value: 'Admin onboarding' },
      ],
    },
  ];

  const aiCards: ServiceCardModel[] = [
    {
      name: 'vLLM Gateway',
      desc: 'Inference gateway and model-serving surface for AI workloads.',
      tone: vllmStatus.tone,
      statusLabel: vllmStatus.label,
      icon: '◉',
      accent: 'rgba(78,206,199,0.16)',
      href: '/admin/ai/vllm',
      rows: [
        { label: 'Public', value: stripScheme(vllmProbe.publicUrl) },
        { label: 'Origin', value: String(vllmProbe.publicOriginCode ?? 'Unknown') },
      ],
    },
    {
      name: 'LiteLLM Gateway',
      desc: 'OpenAI-compatible model router and proxy endpoint.',
      tone: liteLlmStatus.tone,
      statusLabel: liteLlmStatus.label,
      icon: '◎',
      accent: 'rgba(78,206,199,0.16)',
      href: '/admin/ai/litellm',
      rows: [
        { label: 'Public', value: stripScheme(services.litellm.publicUrl) },
        { label: 'Edge', value: formatRouteCode(services.litellm.publicEdgeCode) },
      ],
    },
    {
      name: 'Dify',
      desc: 'AI workflow, application, and bot builder runtime.',
      tone: difyStatus.tone,
      statusLabel: difyStatus.label,
      icon: '◍',
      accent: 'rgba(78,206,199,0.16)',
      href: '/admin/ai/dify',
      rows: [
        { label: 'Public', value: stripScheme(difyProbe.publicUrl) },
        { label: 'Runtime', value: difyProbe.containers[0]?.name || 'Shared stack' },
      ],
    },
    {
      name: 'MCP Endpoint',
      desc: 'Portal-backed Model Context Protocol endpoint.',
      tone: mcpStatus.tone,
      statusLabel: mcpStatus.label,
      icon: '⌬',
      accent: 'rgba(78,206,199,0.16)',
      href: '/admin/ai/mcp',
      rows: [
        { label: 'Public', value: stripScheme(mcpProbe.publicUrl) },
        { label: 'Runtime', value: 'Portal shared runtime' },
      ],
    },
    {
      name: 'Qdrant',
      desc: 'Vector database for RAG, memory retrieval, and semantic search.',
      tone: qdrantStatus.tone,
      statusLabel: qdrantStatus.label,
      icon: '◌',
      accent: 'rgba(78,206,199,0.16)',
      href: '/admin/ai/qdrant',
      rows: [
        { label: 'Public', value: stripScheme(qdrantProbe.publicUrl) },
        { label: 'Access', value: 'API auth required' },
      ],
    },
  ];

  const automationCards: ServiceCardModel[] = [
    {
      name: 'n8n Workflows',
      desc: 'Workflow automation, schedules, and event-driven integrations.',
      tone: n8nStatus.tone,
      statusLabel: n8nStatus.label,
      icon: '⇄',
      accent: 'rgba(243,179,73,0.16)',
      href: '/admin/automation/n8n',
      rows: [
        { label: 'Public', value: stripScheme(services.n8n.publicUrl) },
        { label: 'Runtime', value: services.n8n.containers[0]?.name || 'Not detected' },
      ],
    },
    buildStaticCard({
      name: 'Webhooks',
      desc: 'Portal-managed webhook signing, integration, and delivery surface.',
      tone: 'active',
      statusLabel: 'PORTAL',
      icon: '↺',
      accent: 'rgba(243,179,73,0.16)',
      href: '/admin/automation/webhooks',
      rows: [
        { label: 'Mode', value: 'Portal managed' },
        { label: 'Scope', value: 'Signing + delivery' },
      ],
    }),
    {
      name: 'Airbyte',
      desc: 'Data ingestion and ELT sync runtime for external sources.',
      tone: airbyteStatus.tone,
      statusLabel: airbyteStatus.label,
      icon: '⟷',
      accent: 'rgba(243,179,73,0.16)',
      href: '/admin/automation/airbyte',
      rows: [
        { label: 'Public', value: stripScheme(airbyteProbe.publicUrl) },
        { label: 'Install', value: 'Coolify blocked' },
      ],
    },
  ];

  const communicationCards: ServiceCardModel[] = [
    {
      name: 'Evolution Gateway',
      desc: 'WhatsApp Business API and messaging automation runtime.',
      tone: evolutionStatus.tone,
      statusLabel: evolutionStatus.label,
      icon: '◈',
      accent: 'rgba(92,210,184,0.16)',
      href: '/admin/communications/evolution',
      rows: [
        { label: 'Public', value: stripScheme(evolutionProbe.publicUrl) },
        { label: 'Runtime', value: evolutionProbe.containers[0]?.name || 'Not detected' },
      ],
    },
    {
      name: 'Baileys Gateway',
      desc: 'Baileys multi-device WhatsApp gateway runtime.',
      tone: baileysStatus.tone,
      statusLabel: baileysStatus.label,
      icon: '◌',
      accent: 'rgba(92,210,184,0.16)',
      href: '/admin/communications/baileys',
      rows: [
        { label: 'Public', value: stripScheme(baileysProbe.publicUrl) },
        { label: 'Runtime', value: baileysProbe.containers[0]?.name || 'Not detected' },
      ],
    },
    {
      name: 'Open WebUI',
      desc: 'User-facing AI chat and operator workspace.',
      tone: openWebUiStatus.tone,
      statusLabel: openWebUiStatus.label,
      icon: '◎',
      accent: 'rgba(92,210,184,0.16)',
      href: '/admin/communications/open-webui',
      rows: [
        { label: 'Public', value: stripScheme(openWebUiProbe.publicUrl) },
        { label: 'Runtime', value: openWebUiProbe.containers[0]?.name || 'Not detected' },
      ],
    },
    {
      name: 'Chatwoot',
      desc: 'Omnichannel customer communication and support workspace.',
      tone: chatwootStatus.tone,
      statusLabel: chatwootStatus.label,
      icon: '◐',
      accent: 'rgba(92,210,184,0.16)',
      href: '/admin/communications/chatwoot',
      rows: [
        { label: 'Public', value: stripScheme(chatwootProbe.publicUrl) },
        { label: 'Runtime', value: chatwootProbe.containers[0]?.name || 'Not detected' },
      ],
    },
    {
      name: 'FusionPBX / Voice',
      desc: 'Voice routing and PBX runtime for telephony workflows.',
      tone: voiceStatus.tone,
      statusLabel: voiceStatus.label,
      icon: '☎',
      accent: 'rgba(92,210,184,0.16)',
      href: '/admin/communications/voice',
      rows: [
        { label: 'Internal', value: voiceProbe.internalUrl || 'Not available' },
        { label: 'Runtime', value: voiceProbe.containers[0]?.name || 'Not detected' },
      ],
    },
  ];

  const infraCards: ServiceCardModel[] = [
    {
      name: 'Coolify',
      desc: 'Canonical deployment control plane for portal and future services.',
      tone: coolifyStatus.tone,
      statusLabel: coolifyStatus.label,
      icon: '◈',
      accent: 'rgba(104,187,255,0.16)',
      href: '/admin/infra/coolify',
      rows: [
        { label: 'Public', value: stripScheme(coolifyProbe.publicUrl) },
        { label: 'Runtime', value: coolifyProbe.containers[0]?.name || 'Not detected' },
      ],
    },
    buildStaticCard({
      name: 'Databases',
      desc: 'Portal view of PostgreSQL, ClickHouse, Redis, and service databases.',
      tone: 'healthy',
      statusLabel: 'ONLINE',
      icon: '▤',
      accent: 'rgba(104,187,255,0.16)',
      href: '/admin/infra/databases',
      rows: [
        { label: 'Primary', value: 'PostgreSQL 16' },
        { label: 'Admin', value: 'pgAdmin' },
      ],
    }),
    {
      name: 'Object Storage',
      desc: 'S3-compatible SeaweedFS storage runtime for tenant assets and blobs.',
      tone: objectStorageStatus.tone,
      statusLabel: objectStorageStatus.label,
      icon: '▦',
      accent: 'rgba(104,187,255,0.16)',
      href: '/admin/infra/object-storage',
      rows: [
        { label: 'Internal', value: objectStorageProbe.internalUrl || 'Not available' },
        { label: 'Runtime', value: objectStorageProbe.containers[0]?.name || 'Not detected' },
      ],
    },
    buildStaticCard({
      name: 'Backups',
      desc: 'Backup and restore operations for platform data and recovery workflows.',
      tone: 'active',
      statusLabel: 'OPERATIONS',
      icon: '⟲',
      accent: 'rgba(104,187,255,0.16)',
      href: '/admin/infra/backups',
      rows: [
        { label: 'Mode', value: 'Portal actions' },
        { label: 'Scope', value: 'Preprod + ops' },
      ],
    }),
    {
      name: 'ClickHouse',
      desc: 'Trace analytics store backing future Langfuse workloads.',
      tone: clickhouseStatus.tone,
      statusLabel: clickhouseStatus.label,
      icon: '▥',
      accent: 'rgba(104,187,255,0.16)',
      href: '/admin/infra/databases',
      rows: [
        { label: 'Public', value: stripScheme(services.clickhouse.publicUrl) },
        { label: 'Exposure', value: 'Internal only' },
      ],
    },
    {
      name: 'Redis / Queue Cache',
      desc: 'Internal cache and queue runtime for background jobs and app dependencies.',
      tone: redisStatus.tone,
      statusLabel: redisStatus.label,
      icon: '◫',
      accent: 'rgba(104,187,255,0.16)',
      href: '/admin/infra/databases',
      rows: [
        { label: 'Primary', value: services.redis.primary?.name || 'Not detected' },
        { label: 'Exposure', value: 'Internal only' },
      ],
    },
  ];

  const observabilityCards: ServiceCardModel[] = [
    {
      name: 'Grafana',
      desc: 'Protected metrics and dashboard UI for platform monitoring.',
      tone: grafanaStatus.tone,
      statusLabel: grafanaStatus.label,
      icon: '◔',
      accent: 'rgba(155,167,255,0.16)',
      href: '/admin/observability/grafana',
      rows: [
        { label: 'Public', value: stripScheme(grafanaProbe.publicUrl) },
        { label: 'Runtime', value: grafanaProbe.containers[0]?.name || 'Not detected' },
      ],
    },
    {
      name: 'Langfuse',
      desc: 'AI observability, tracing, and evaluation runtime.',
      tone: langfuseStatus.tone,
      statusLabel: langfuseStatus.label,
      icon: '◎',
      accent: 'rgba(155,167,255,0.16)',
      href: '/admin/observability/langfuse',
      rows: [
        { label: 'Public', value: stripScheme(services.langfuse.publicUrl) },
        { label: 'Setup', value: 'Admin onboarding' },
      ],
    },
  ];

  const securityCards: ServiceCardModel[] = [
    buildStaticCard({
      name: 'API Keys',
      desc: 'Portal-issued keys for tenants, apps, and clients.',
      tone: 'active',
      statusLabel: 'PORTAL',
      icon: '⚿',
      accent: 'rgba(196,161,255,0.16)',
      href: '/admin/security/api-keys',
      rows: [
        { label: 'Boundary', value: 'Tenant / app keys' },
        { label: 'Masking', value: 'Enabled' },
      ],
    }),
    {
      name: 'Infisical',
      desc: 'Internal secret vault distinct from tenant-issued API keys.',
      tone: infisicalStatus.tone,
      statusLabel: infisicalStatus.label,
      icon: '◫',
      accent: 'rgba(196,161,255,0.16)',
      href: '/admin/security/infisical',
      rows: [
        { label: 'Public', value: stripScheme(infisicalProbe.publicUrl) },
        { label: 'Setup', value: 'Admin onboarding' },
      ],
    },
    buildStaticCard({
      name: 'SDK & Docs',
      desc: 'Reference docs and integration guidance for the platform.',
      tone: 'active',
      statusLabel: 'PORTAL',
      icon: '⌥',
      accent: 'rgba(196,161,255,0.16)',
      href: '/admin/security/docs',
      rows: [
        { label: 'Source', value: 'Portal docs' },
        { label: 'Audience', value: 'Operators + integrators' },
      ],
    }),
    buildStaticCard({
      name: 'Quick Links',
      desc: 'Operator shortcuts to the primary platform surfaces.',
      tone: 'active',
      statusLabel: 'PORTAL',
      icon: '⊞',
      accent: 'rgba(196,161,255,0.16)',
      href: '/admin/security/quick-links',
      rows: [
        { label: 'Mode', value: 'Navigation hub' },
        { label: 'Scope', value: 'Ops links' },
      ],
    }),
  ];

  const sections: SectionModel[] = [
    { title: 'SYSTEM ORCHESTRATION', link: { label: 'Open system pages →', href: '/admin/system/dashboard' }, accent: 'rgba(126,154,255,0.4)', cards: systemCards },
    { title: 'AI ENGINE & COGNITION', link: { label: 'Open AI pages →', href: '/admin/ai/vllm' }, accent: 'rgba(78,206,199,0.4)', cards: aiCards },
    { title: 'AUTOMATION & DATA FLOW', link: { label: 'Open automation pages →', href: '/admin/automation/n8n' }, accent: 'rgba(243,179,73,0.4)', cards: automationCards },
    { title: 'COMMUNICATION HUBS', link: { label: 'Open communication pages →', href: '/admin/communications/evolution' }, accent: 'rgba(92,210,184,0.4)', cards: communicationCards },
    { title: 'INFRA & PERSISTENCE', link: { label: 'Open infra pages →', href: '/admin/infra/coolify' }, accent: 'rgba(104,187,255,0.4)', cards: infraCards },
    { title: 'OBSERVABILITY & TRACING', link: { label: 'Open observability pages →', href: '/admin/observability/grafana' }, accent: 'rgba(155,167,255,0.4)', cards: observabilityCards },
    { title: 'ACCESS & SECURITY', link: { label: 'Open security pages →', href: '/admin/security/api-keys' }, accent: 'rgba(196,161,255,0.4)', cards: securityCards },
  ];

  const trackedCards = sections.flatMap((section) => section.cards);
  const total = trackedCards.length;
  const healthy = trackedCards.filter((card) => card.tone === 'healthy' || card.tone === 'active').length;
  const degraded = trackedCards.filter((card) => card.tone === 'warning' || card.tone === 'critical').length;
  const actionRequired = trackedCards.filter((card) => card.tone === 'info' || card.tone === 'warning' || card.tone === 'critical').length;

  const alerts: Array<{ title: string; detail: string; tone: Tone }> = [];
  if (diskPct !== null && diskPct >= 80) {
    alerts.push({ title: 'Disk usage high', detail: `Root filesystem is at ${diskPct}%.`, tone: 'warning' });
  }
  if (vllmStatus.tone !== 'healthy' && vllmStatus.tone !== 'active') {
    alerts.push({ title: 'vLLM Gateway degraded', detail: vllmStatus.detail, tone: vllmStatus.tone });
  }
  if (liteLlmStatus.tone === 'warning' || liteLlmStatus.tone === 'critical') {
    alerts.push({ title: 'LiteLLM public route mismatch', detail: liteLlmStatus.detail, tone: liteLlmStatus.tone });
  } else if (liteLlmStatus.tone === 'info') {
    alerts.push({ title: 'LiteLLM not installed', detail: liteLlmStatus.detail, tone: 'info' });
  }
  if (langfuseStatus.tone === 'info') {
    alerts.push({ title: 'Langfuse not installed', detail: langfuseStatus.detail, tone: 'info' });
  }
  if (qdrantStatus.tone === 'info') {
    alerts.push({ title: 'Qdrant missing', detail: qdrantStatus.detail, tone: 'info' });
  }
  if ((services.clickhouse.publicOriginCode !== null && services.clickhouse.publicOriginCode >= 200 && services.clickhouse.publicOriginCode < 400)
    || (services.clickhouse.publicEdgeCode !== null && services.clickhouse.publicEdgeCode >= 200 && services.clickhouse.publicEdgeCode < 400)) {
    alerts.push({ title: 'Review ClickHouse exposure', detail: 'ClickHouse should remain auth-protected or internal-only.', tone: 'warning' });
  }
  if (services.redis.publicOriginCode !== null || services.redis.publicEdgeCode !== null) {
    alerts.push({ title: 'Redis exposure detected', detail: 'Redis must remain internal-only.', tone: 'critical' });
  }

  const recentActivity = [
    `Canonical route tree now groups ${sections.length} dashboard sections exactly like the sidebar IA.`,
    `n8n runtime source: ${formatRuntimeSource(resolveRuntimeSource(services.n8n.containers[0]))}.`,
    `LiteLLM status: ${liteLlmStatus.detail} Edge=${formatRouteCode(services.litellm.publicEdgeCode)}.`,
    `Langfuse status: ${langfuseStatus.detail}`,
    `Redis inventory: ${services.redis.containers.length} internal runtime${services.redis.containers.length === 1 ? '' : 's'} detected.`,
  ];

  return (
    <div className="dash-shell">
      <header className="dash-page-head">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-sub">Canonical control-plane overview grouped exactly like the portal sidebar for the GetTouch AI ecosystem foundation.</p>
        </div>
        <div className="dash-page-meta">
          <span className="dash-live-dot" /> Live · {new Date(now).toLocaleString()}
        </div>
      </header>

      <div className="dash-summary-grid">
        <SummaryCard label="TOTAL SERVICES" value={String(total)} icon="▣" tone="info" detail="Tracked dashboard surfaces" />
        <SummaryCard label="HEALTHY" value={String(healthy)} icon="♡" tone="healthy" detail="Healthy or active services" />
        <SummaryCard label="DEGRADED" value={String(degraded)} icon="△" tone={degraded > 0 ? 'warning' : 'healthy'} detail={degraded > 0 ? 'Requires repair' : 'No degraded runtimes'} />
        <SummaryCard label="ACTION REQUIRED" value={String(actionRequired)} icon="⚠" tone={actionRequired > 0 ? 'warning' : 'healthy'} detail={actionRequired > 0 ? 'Missing or pending setup' : 'No open setup gaps'} />
        <SummaryCard label="AI ENGINE STATUS" value={healthLabel(aiCards)} icon="◎" tone={healthyCount(aiCards) === aiCards.length ? 'healthy' : 'warning'} detail="vLLM, LiteLLM, Dify, MCP, Qdrant" />
        <SummaryCard label="AUTOMATION STATUS" value={healthLabel(automationCards)} icon="⇄" tone={healthyCount(automationCards) === automationCards.length ? 'healthy' : 'warning'} detail="n8n, Webhooks, Airbyte" />
        <SummaryCard label="COMMUNICATIONS STATUS" value={healthLabel(communicationCards)} icon="◈" tone={healthyCount(communicationCards) === communicationCards.length ? 'healthy' : 'warning'} detail="Messaging and voice surfaces" />
        <SummaryCard label="SECURITY / OBSERVABILITY" value={`${healthLabel(securityCards)} + ${healthLabel(observabilityCards)}`} icon="◫" tone={healthyCount(securityCards) === securityCards.length && healthyCount(observabilityCards) === observabilityCards.length ? 'healthy' : 'warning'} detail="API Keys, Infisical, Grafana, Langfuse" />
        <SummaryCard label="DISK USAGE" value={diskPct !== null ? `${diskPct}%` : 'N/A'} icon="▦" tone={diskPct !== null && diskPct >= 80 ? 'warning' : 'healthy'} detail={diskPct !== null ? `${formatStorage(usedBytes)} / ${formatStorage(totalBytes)}` : 'No data'} />
      </div>

      <div className="dash-main-grid">
        <div className="dash-col-main">
          {sections.map((section) => (
            <Section key={section.title} title={section.title} link={section.link} accent={section.accent}>
              <div className="dash-svc-grid">
                {section.cards.map((card) => <ServiceCard key={card.name} card={card} />)}
              </div>
            </Section>
          ))}
        </div>

        <aside className="dash-col-side">
          <Panel title="Quick Actions">
            <div className="dash-actions">
              <a href="/admin/system/dashboard" className="dash-action">System Dashboard</a>
              <a href="/admin/ai/litellm" className="dash-action">LiteLLM Gateway</a>
              <a href="/admin/ai/qdrant" className="dash-action">Qdrant</a>
              <a href="/admin/automation/n8n" className="dash-action">n8n Workflows</a>
              <a href="/admin/communications/open-webui" className="dash-action">Open WebUI</a>
              <a href="/admin/infra/coolify" className="dash-action">Coolify</a>
              <a href="/admin/observability/grafana" className="dash-action">Grafana</a>
              <a href="/admin/security/api-keys" className="dash-action">API Keys</a>
              <a href="/admin/security/infisical" className="dash-action">Infisical</a>
              <a href="/admin/security/quick-links" className="dash-action">Quick Links</a>
            </div>
          </Panel>

          <Panel title="Alerts / Action Required">
            {alerts.length === 0 ? (
              <div className="dash-empty">No active alerts.</div>
            ) : (
              <ul className="dash-alert-list">
                {alerts.map((alert) => (
                  <li key={`${alert.title}-${alert.detail}`} className={`dash-alert ${statusClassName(alert.tone)}`}>
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
              <li><span>Portal Runtime</span><strong>Coolify only</strong></li>
              <li><span>Edge Path</span><strong>Cloudflare → Caddy → Coolify app</strong></li>
              <li><span>AI Router</span><strong>{liteLlmStatus.label}</strong></li>
              <li><span>Observability</span><strong>{langfuseStatus.label}</strong></li>
              <li><span>Queue / Cache</span><strong>{redisStatus.label}</strong></li>
            </ul>
          </Panel>

          <Panel title="Recent Activity">
            <ul className="dash-activity">
              {recentActivity.map((item) => (
                <li key={item}><span className="dash-act-tag">Auto</span>{item}</li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      <DashboardStyles />
    </div>
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
      .dash-summary-grid { display:grid; gap:0.8rem; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
      .dash-summary { background:linear-gradient(180deg, rgba(19,21,28,0.94), rgba(13,15,20,0.98)); border:1px solid rgba(255,255,255,0.06); border-radius:18px; padding:0.95rem 1rem; min-height:122px; }
      .dash-summary-head { display:flex; align-items:center; justify-content:space-between; gap:0.75rem; margin-bottom:0.7rem; }
      .dash-summary-label { font-size:0.72rem; font-weight:700; letter-spacing:0.12em; color:#7d8095; }
      .dash-summary-icon { font-size:1rem; color:#9ca3be; }
      .dash-summary-value { font-size:1.5rem; font-weight:800; letter-spacing:-0.05em; }
      .dash-summary-detail { margin-top:0.35rem; color:#6f7388; font-size:0.8rem; }
      .dash-tone-healthy-text { color:var(--dash-tone-healthy); }
      .dash-tone-active-text { color:var(--dash-tone-active); }
      .dash-tone-warning-text { color:var(--dash-tone-warning); }
      .dash-tone-info-text { color:#dfe5ff; }
      .dash-main-grid { display:grid; grid-template-columns:minmax(0, 2fr) minmax(300px, 0.95fr); gap:1rem; align-items:start; }
      .dash-col-main, .dash-col-side { display:flex; flex-direction:column; gap:1rem; }
      .dash-section { display:flex; flex-direction:column; gap:0.75rem; }
      .dash-section-head { display:flex; align-items:center; gap:0.65rem; flex-wrap:wrap; }
      .dash-section-bar { width:22px; height:4px; border-radius:999px; flex:0 0 auto; }
      .dash-section-title { margin:0; font-size:0.95rem; letter-spacing:0.08em; color:#f0f3ff; }
      .dash-section-link { margin-left:auto; color:#93a4ff; text-decoration:none; font-size:0.78rem; }
      .dash-svc-grid { display:grid; gap:0.85rem; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); }
      .dash-svc-card { display:grid; gap:0.8rem; padding:1rem; border-radius:20px; border:1px solid rgba(255,255,255,0.06); background:linear-gradient(180deg, rgba(18,20,28,0.95), rgba(11,13,18,0.98)); color:#edf2ff; text-decoration:none; min-height:205px; }
      .dash-svc-head { display:grid; grid-template-columns:auto 1fr auto; gap:0.7rem; align-items:center; }
      .dash-svc-icon { width:38px; height:38px; display:grid; place-items:center; border-radius:13px; font-size:1.05rem; color:#eef2ff; }
      .dash-svc-name { font-size:1rem; font-weight:700; }
      .dash-chip { border-radius:999px; font-size:0.68rem; padding:0.26rem 0.52rem; white-space:nowrap; border:1px solid rgba(255,255,255,0.08); }
      .dash-tone-healthy { color:var(--dash-tone-healthy); background:rgba(46,226,129,0.08); }
      .dash-tone-active { color:var(--dash-tone-active); background:rgba(110,166,255,0.08); }
      .dash-tone-warning { color:var(--dash-tone-warning); background:rgba(243,179,73,0.08); }
      .dash-tone-info { color:#b8bfd7; background:rgba(184,191,215,0.08); }
      .dash-svc-desc { color:#aab2ca; font-size:0.88rem; line-height:1.55; }
      .dash-svc-rows { display:grid; gap:0.45rem; }
      .dash-svc-row { display:flex; align-items:center; justify-content:space-between; gap:0.75rem; font-size:0.78rem; color:#8791af; }
      .dash-svc-row strong { color:#edf2ff; font-weight:600; }
      .dash-svc-foot { display:flex; align-items:center; justify-content:space-between; gap:0.65rem; margin-top:auto; }
      .dash-spark { flex:1 1 auto; height:40px; opacity:0.85; }
      .dash-svc-cta { font-size:0.76rem; color:#93a4ff; white-space:nowrap; }
      .dash-panel { border:1px solid rgba(255,255,255,0.06); border-radius:18px; background:linear-gradient(180deg, rgba(18,20,28,0.95), rgba(11,13,18,0.98)); padding:1rem; }
      .dash-panel-title { margin:0 0 0.8rem; font-size:0.9rem; letter-spacing:0.08em; color:#eef2ff; }
      .dash-actions { display:grid; gap:0.55rem; }
      .dash-action { display:flex; align-items:center; justify-content:space-between; min-height:40px; padding:0.65rem 0.8rem; border-radius:12px; color:#e9eeff; text-decoration:none; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); }
      .dash-alert-list, .dash-env-list, .dash-activity { list-style:none; padding:0; margin:0; display:grid; gap:0.55rem; }
      .dash-alert { border-radius:12px; padding:0.8rem; border:1px solid rgba(255,255,255,0.08); }
      .dash-alert-title { font-weight:700; margin-bottom:0.25rem; }
      .dash-alert-detail { color:#aab2ca; font-size:0.82rem; line-height:1.5; }
      .dash-env-list li { display:flex; align-items:center; justify-content:space-between; gap:0.75rem; font-size:0.82rem; color:#9aa3bf; padding:0.1rem 0; }
      .dash-env-list strong { color:#f0f3ff; font-weight:600; text-align:right; }
      .dash-activity li { display:flex; gap:0.55rem; align-items:flex-start; color:#ccd5f5; font-size:0.84rem; line-height:1.55; }
      .dash-act-tag { flex:0 0 auto; border-radius:999px; padding:0.12rem 0.42rem; font-size:0.66rem; color:#0c1220; background:#dfe5ff; font-weight:700; }
      .dash-empty { color:#8d95af; font-size:0.82rem; }
      @keyframes dashPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      @media (max-width: 1120px) {
        .dash-main-grid { grid-template-columns:1fr; }
      }
      @media (max-width: 640px) {
        .dash-summary-grid { grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); }
        .dash-svc-grid { grid-template-columns:1fr; }
      }
    `}</style>
  );
}