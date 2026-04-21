export type StatusTone = 'healthy' | 'active' | 'warning';
export type InfrastructureSectionId = 'servers' | 'databases' | 'reverse-proxy' | 'baas';

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  external?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export interface SummaryCard {
  label: string;
  value: string;
  tone?: StatusTone;
  icon: string;
}

export interface ResourceRow {
  name: string;
  description: string;
  type: string;
  status: string;
  tone: StatusTone;
  href?: string;
  external?: boolean;
}

export interface InfoRow {
  label: string;
  value: string;
}

export interface DetailCard {
  title: string;
  status: string;
  tone: StatusTone;
  rows: InfoRow[];
}

export interface QuickLinkGroup {
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}

export interface InfrastructureSectionLink {
  id: InfrastructureSectionId;
  label: string;
  icon: string;
  description: string;
}

export interface InfrastructureModule {
  eyebrow: string;
  title: string;
  description: string;
  footer: string;
  status: string;
  tone: StatusTone;
  href?: string;
}

export const ADMIN_NAV: NavSection[] = [
  {
    label: 'OVERVIEW',
    items: [{ label: 'Dashboard', href: '/admin', icon: '⌘' }],
  },
  {
    label: 'INFRASTRUCTURE',
    items: [
      { label: 'Infrastructure', href: '/admin/infrastructure', icon: '▥' },
      { label: 'Servers & Nodes', href: '/admin/infrastructure#servers', icon: '▣' },
      { label: 'Databases', href: '/admin/infrastructure#databases', icon: '▤' },
      { label: 'Preprod Backups', href: '/admin/databases', icon: '⟲' },
      { label: 'Reverse Proxy', href: '/admin/infrastructure#reverse-proxy', icon: '◫' },
    ],
  },
  {
    label: 'PLATFORM',
    items: [
      { label: 'Coolify', href: 'https://coolify.getouch.co', icon: '◈', external: true },
      { label: 'Deployments', href: '/admin/deployments', icon: '⬡' },
    ],
  },
  {
    label: 'APPLICATIONS',
    items: [{ label: 'App Registry', href: '/admin/app-registry', icon: '▥' }],
  },
  {
    label: 'COMMUNICATION',
    items: [
      { label: 'Mail Services', href: '/admin/mail-services', icon: '✉' },
      { label: 'Messaging', href: '/admin/messaging', icon: '◌' },
    ],
  },
  {
    label: 'AI & AUTOMATION',
    items: [
      { label: 'AI Services', href: '/admin/ai-services', icon: '◎' },
      { label: 'Dify API Setup', href: '/admin/dify-api-setup', icon: '◉' },
      { label: 'OpenClaw', href: 'https://openclaw.getouch.co', icon: '🦞', external: true },
    ],
  },
  {
    label: 'MONITORING',
    items: [
      { label: 'System Health', href: '/admin/system-health', icon: '∿' },
      { label: 'Unexpected Shutdown', href: '/admin/unexpected-shutdown', icon: '⚠' },
      { label: 'Scheduled Restart', href: '/admin/scheduled-restart', icon: '↻' },
    ],
  },
  {
    label: 'ACCESS',
    items: [{ label: 'Quick Links', href: '/admin/quick-links', icon: '⊞' }],
  },
];

export const DASHBOARD_SUMMARY: SummaryCard[] = [
  { label: 'TOTAL SERVICES', value: '13', icon: '▤' },
  { label: 'HEALTHY', value: '13', tone: 'healthy', icon: '♡' },
  { label: 'DEGRADED', value: '0', tone: 'warning', icon: '△' },
  { label: 'APPLICATIONS', value: '1', icon: '▣' },
  { label: 'MAIL', value: 'OK', tone: 'active', icon: '✉' },
  { label: 'AI ENGINE', value: 'Active', tone: 'active', icon: '◎' },
];

export const QUICK_ACTIONS = [
  { label: 'Open Coolify', href: 'https://coolify.getouch.co', external: true },
  { label: 'Open Webmail', href: 'https://mail.getouch.co', external: true },
  { label: 'Mail Admin', href: 'https://mail.getouch.co', external: true },
  { label: 'Open pgAdmin', href: 'https://db.getouch.co', external: true },
  { label: 'Open Grafana', href: 'https://grafana.getouch.co', external: true },
  { label: 'Portal Users', href: '/admin/users' },
];

export const DASHBOARD_SERVICES: ResourceRow[] = [
  {
    name: 'PostgreSQL 16',
    description: 'Primary database engine for auth, users, and platform data.',
    type: 'DATABASE',
    status: 'HEALTHY',
    tone: 'healthy',
  },
  {
    name: 'pgAdmin 4',
    description: 'Database management UI for PostgreSQL administration.',
    type: 'DATABASE',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://db.getouch.co',
  },
  {
    name: 'Coolify',
    description: 'Self-hosted PaaS for deployments, image builds, and release flow.',
    type: 'DEPLOYMENT',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://coolify.getouch.co',
  },
  {
    name: 'Getouch Portal',
    description: 'Primary customer-facing Next.js application and account portal.',
    type: 'APPLICATION',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://getouch.co',
  },
  {
    name: 'Open WebUI',
    description: 'AI chat, RAG, model workflows, and operator tooling.',
    type: 'AI',
    status: 'ACTIVE',
    tone: 'active',
    href: 'https://ai.getouch.co',
  },
  {
    name: 'Cloudflare Tunnel',
    description: 'Public ingress path routing traffic into the VPS securely.',
    type: 'NETWORK',
    status: 'ACTIVE',
    tone: 'active',
  },
  {
    name: 'Caddy Reverse Proxy',
    description: 'TLS termination and routing for main workloads.',
    type: 'PROXY',
    status: 'ACTIVE',
    tone: 'active',
  },
  {
    name: 'Mail Services',
    description: 'Inbound, outbound, and admin mail flows for getouch.co.',
    type: 'MAIL',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://mail.getouch.co',
  },
  {
    name: 'WhatsApp API',
    description: 'WhatsApp gateway and automation endpoint.',
    type: 'MESSAGING',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://wa.getouch.co',
  },
  {
    name: 'SearXNG',
    description: 'Private search backend used by AI and operator workflows.',
    type: 'SEARCH',
    status: 'ACTIVE',
    tone: 'active',
    href: 'https://search.getouch.co',
  },
];

export const DASHBOARD_NETWORK: InfoRow[] = [
  { label: 'Public IP', value: '100.84.14.93 (Tailscale)' },
  { label: 'Domain', value: 'getouch.co' },
  { label: 'SSL', value: "Let's Encrypt VALID" },
  { label: 'Firewall', value: 'ACTIVE' },
];

export const DASHBOARD_ENVIRONMENT: InfoRow[] = [
  { label: 'CPU', value: '12 vCPU' },
  { label: 'Memory', value: '64 GB DDR5' },
  { label: 'Storage', value: '98 GB + 1.5 TB NVMe' },
  { label: 'OS', value: 'Ubuntu 24.04.4 LTS' },
];

export const DASHBOARD_ACTIVITY: string[] = [
  'Admin portal redeployed from Coolify after transient DNS failure.',
  'Production web container is healthy on the latest image.',
  'Infrastructure routing, storage, AI, and messaging services are online.',
];

export const SERVER_CARDS: DetailCard[] = [
  {
    title: 'Primary VPS',
    status: 'ACTIVE',
    tone: 'active',
    rows: [
      { label: 'Address', value: '100.84.14.93' },
      { label: 'Role', value: 'Main app, AI, storage, and admin host' },
      { label: 'Specs', value: '12 vCPU, 64 GB RAM, RTX 5060 Ti, Ubuntu 24.04.4 LTS' },
    ],
  },
  {
    title: 'Ingress Layer',
    status: 'HEALTHY',
    tone: 'healthy',
    rows: [
      { label: 'Public Access', value: 'Cloudflare Tunnel' },
      { label: 'Private Access', value: 'Tailscale tailnet' },
      { label: 'Proxy', value: 'Caddy reverse proxy' },
    ],
  },
  {
    title: 'Runtime',
    status: 'HEALTHY',
    tone: 'healthy',
    rows: [
      { label: 'Orchestrator', value: 'Coolify + Docker' },
      { label: 'Containers', value: '74 running' },
      { label: 'Health', value: '0 unhealthy after hardening' },
    ],
  },
];

export const DATABASE_ROWS: ResourceRow[] = [
  {
    name: 'PostgreSQL 16',
    description: 'Primary relational database for getouch.co.',
    type: 'DATABASE',
    status: 'HEALTHY',
    tone: 'healthy',
  },
  {
    name: 'pgAdmin 4',
    description: 'Querying, schema management, and database administration.',
    type: 'DATABASE ADMIN',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://db.getouch.co',
  },
  {
    name: 'Getouch SSO',
    description: 'Shared authentication service on Supabase.',
    type: 'AUTH',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-sso.getouch.co',
  },
  {
    name: 'Serapod Preprod',
    description: 'Supabase pre-production stack for Serapod validation.',
    type: 'BAAS',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-preprod-serapod.getouch.co',
  },
  {
    name: 'Serapod Development-home',
    description: 'Primary self-hosted Supabase stack for Serapod workloads and data APIs.',
    type: 'BAAS',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-dev-serapod.getouch.co',
  },
];

export const INFRASTRUCTURE_SUMMARY: SummaryCard[] = [
  { label: 'SERVICES', value: '5', icon: '▣' },
  { label: 'DATABASES', value: '3', icon: '▤' },
  { label: 'PROXY', value: 'Caddy', tone: 'active', icon: '◫' },
  { label: 'STORAGE', value: '1.5 TB', icon: '◌' },
];

export const INFRASTRUCTURE_SECTION_LINKS: InfrastructureSectionLink[] = [
  {
    id: 'servers',
    label: 'Servers & Nodes',
    icon: '▣',
    description: 'Primary VPS, ingress path, runtime health',
  },
  {
    id: 'databases',
    label: 'Databases',
    icon: '▤',
    description: 'PostgreSQL, pgAdmin, and Supabase stacks',
  },
  {
    id: 'reverse-proxy',
    label: 'Reverse Proxy',
    icon: '◫',
    description: 'Cloudflare Tunnel, Caddy, TLS, and access path',
  },
  {
    id: 'baas',
    label: 'BaaS',
    icon: '◎',
    description: 'Auth, storage, REST, and realtime modules',
  },
];

export const INFRASTRUCTURE_SERVER_ROWS: InfoRow[] = [
  { label: 'Provider', value: 'Getouch VPS (Ubuntu 24.04)' },
  { label: 'CPU', value: '12 vCPU - GPU node' },
  { label: 'RAM', value: '64 GB DDR5' },
  { label: 'IP', value: '100.84.14.93' },
];

export const INFRASTRUCTURE_PROXY_ROWS: InfoRow[] = [
  { label: 'SSL Provider', value: "Let's Encrypt + Cloudflare" },
  { label: 'Domains', value: 'getouch.co + subdomains' },
  { label: 'Firewall', value: 'ACTIVE' },
  { label: 'Ingress', value: 'Cloudflare Tunnel + Caddy' },
];

export const DATABASE_MODULES: InfrastructureModule[] = [
  {
    eyebrow: 'DATABASE',
    title: 'PostgreSQL 16',
    description: 'Primary database engine for the getouch.co platform, auth state, and operator data.',
    footer: 'Internal network only · localhost:5432',
    status: 'HEALTHY',
    tone: 'healthy',
  },
  {
    eyebrow: 'DATABASE ADMIN',
    title: 'pgAdmin 4',
    description: 'Querying, schema administration, and direct operational access for PostgreSQL workloads.',
    footer: 'db.getouch.co',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://db.getouch.co',
  },
  {
    eyebrow: 'AUTH',
    title: 'Getouch SSO',
    description: 'Shared authentication, Studio, and API entrypoint for the wider getouch ecosystem.',
    footer: 'st-sso.getouch.co',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-sso.getouch.co',
  },
  {
    eyebrow: 'BAAS',
    title: 'Serapod Preprod',
    description: 'Pre-production Supabase stack for Serapod validation and release checks.',
    footer: 'st-preprod-serapod.getouch.co',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-preprod-serapod.getouch.co',
  },
  {
    eyebrow: 'BAAS',
    title: 'Serapod Development-home',
    description: 'Primary self-hosted Supabase workloads for storage, auth, REST, and realtime APIs.',
    footer: 'st-dev-serapod.getouch.co',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-dev-serapod.getouch.co',
  },
];

export const BAAS_ROWS: ResourceRow[] = [
  {
    name: 'Getouch SSO',
    description: 'Shared auth, REST, and Studio endpoints for the getouch ecosystem.',
    type: 'BAAS',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-sso.getouch.co',
  },
  {
    name: 'Serapod Preprod',
    description: 'Pre-production Supabase workloads for Serapod validation.',
    type: 'BAAS',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-preprod-serapod.getouch.co',
  },
  {
    name: 'Serapod Development-home',
    description: 'Primary self-hosted Supabase workloads for storage, auth, and realtime APIs.',
    type: 'BAAS',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-dev-serapod.getouch.co',
  },
];

export const BAAS_MODULES: InfrastructureModule[] = [
  {
    eyebrow: 'BAAS',
    title: 'Getouch SSO',
    description: 'Shared auth, REST, and Studio control plane for getouch and downstream services.',
    footer: 'Shared operator auth stack',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-sso.getouch.co',
  },
  {
    eyebrow: 'BAAS',
    title: 'Serapod Preprod',
    description: 'Pre-production Supabase environment for Serapod validation and release checks.',
    footer: 'Pre-production BaaS',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-preprod-serapod.getouch.co',
  },
  {
    eyebrow: 'BAAS',
    title: 'Serapod Development-home',
    description: 'Primary self-hosted Supabase environment for Serapod APIs, storage, and realtime workflows.',
    footer: 'Primary development-home BaaS',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-dev-serapod.getouch.co',
  },
];

export const PROXY_MODULES: InfrastructureModule[] = [
  {
    eyebrow: 'PROXY',
    title: 'Caddy',
    description: 'TLS termination and edge routing for public getouch.co applications.',
    footer: 'Primary reverse proxy',
    status: 'ACTIVE',
    tone: 'active',
  },
  {
    eyebrow: 'INGRESS',
    title: 'Cloudflare Tunnel',
    description: 'Zero-trust ingress from the public internet into the VPS network.',
    footer: 'Public entry path',
    status: 'ACTIVE',
    tone: 'active',
  },
  {
    eyebrow: 'VPN',
    title: 'Tailscale',
    description: 'Private admin connectivity for maintenance and infrastructure operations.',
    footer: 'Private operator access',
    status: 'ACTIVE',
    tone: 'active',
  },
];

export const REVERSE_PROXY_ROWS: ResourceRow[] = [
  {
    name: 'Caddy',
    description: 'TLS termination and routing for public applications.',
    type: 'PROXY',
    status: 'ACTIVE',
    tone: 'active',
  },
  {
    name: 'Cloudflare Tunnel',
    description: 'Zero-trust ingress from the public internet.',
    type: 'INGRESS',
    status: 'ACTIVE',
    tone: 'active',
  },
  {
    name: 'SSL Automation',
    description: 'Certificate issuance and renewal for getouch.co domains.',
    type: 'TLS',
    status: 'HEALTHY',
    tone: 'healthy',
  },
  {
    name: 'Tailscale',
    description: 'Private admin and maintenance access path.',
    type: 'VPN',
    status: 'ACTIVE',
    tone: 'active',
  },
];

export const DEPLOYMENT_ROWS: ResourceRow[] = [
  {
    name: 'Production',
    description: 'Branch: main. Live Coolify application serving getouch.co.',
    type: 'MAIN',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://coolify.getouch.co',
  },
  {
    name: 'Staging',
    description: 'Branch: staging. Preview environment for validation.',
    type: 'STAGING',
    status: 'ACTIVE',
    tone: 'active',
    href: 'https://coolify.getouch.co',
  },
  {
    name: 'Develop',
    description: 'Branch: develop. Integration branch for ongoing work.',
    type: 'DEVELOP',
    status: 'ACTIVE',
    tone: 'active',
    href: 'https://coolify.getouch.co',
  },
];

export const APP_REGISTRY_ROWS: ResourceRow[] = [
  {
    name: 'Getouch.co',
    description: 'Main Next.js application and admin portal.',
    type: 'WEB',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://getouch.co',
  },
  {
    name: 'Getouch News',
    description: 'News frontend and content stack.',
    type: 'CONTENT',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://news.getouch.co',
  },
  {
    name: 'News CMS',
    description: 'Strapi content management for Getouch News.',
    type: 'CMS',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://cms.news.getouch.co',
  },
  {
    name: 'Portal Users',
    description: 'Admin-managed user access and provisioning.',
    type: 'ADMIN',
    status: 'ACTIVE',
    tone: 'active',
    href: '/admin/users',
  },
];

export const MAIL_ROWS: ResourceRow[] = [
  {
    name: 'SMTP Relay',
    description: 'Transactional email routing for auth and notifications.',
    type: 'SMTP',
    status: 'ACTIVE',
    tone: 'active',
  },
  {
    name: 'Verification Email',
    description: 'Account verification and login-related email delivery.',
    type: 'AUTH MAIL',
    status: 'ACTIVE',
    tone: 'active',
  },
  {
    name: 'Notification Sender',
    description: 'App-level outbound messages from nodemailer integration.',
    type: 'APP MAIL',
    status: 'ACTIVE',
    tone: 'active',
  },
];

export const MESSAGING_ROWS: ResourceRow[] = [
  {
    name: 'WhatsApp API',
    description: 'Gateway for WhatsApp delivery and automation.',
    type: 'WHATSAPP',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://wa.getouch.co',
  },
  {
    name: 'Chatwoot',
    description: 'Customer communication and support workspace.',
    type: 'SUPPORT',
    status: 'ACTIVE',
    tone: 'active',
    href: 'https://chatwoot.getouch.co',
  },
  {
    name: 'OTP via WhatsApp',
    description: 'Phone verification token delivery inside the auth flow.',
    type: 'AUTH FLOW',
    status: 'ACTIVE',
    tone: 'active',
  },
];

export const AI_ROWS: ResourceRow[] = [
  {
    name: 'Dify Receptionist',
    description: 'Portal-managed Dify receptionist control plane for setup, testing, and app orchestration.',
    type: 'ORCHESTRATION',
    status: 'ONLINE',
    tone: 'healthy',
    href: '/admin/dify-api-setup',
    external: false,
  },
  {
    name: 'Open WebUI',
    description: 'Operator and end-user AI interface.',
    type: 'PORTAL',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://ai.getouch.co',
    external: true,
  },
  {
    name: 'Ollama',
    description: 'Model inference service on the local GPU node.',
    type: 'INFERENCE',
    status: 'ACTIVE',
    tone: 'active',
  },
  {
    name: 'SearXNG',
    description: 'Private search stack used by AI workflows.',
    type: 'SEARCH',
    status: 'ACTIVE',
    tone: 'active',
    href: 'https://search.getouch.co',
    external: true,
  },
  {
    name: 'Pipelines',
    description: 'Custom AI automation and orchestration pipelines.',
    type: 'AUTOMATION',
    status: 'ACTIVE',
    tone: 'active',
  },
];

export const SYSTEM_HEALTH_ROWS: ResourceRow[] = [
  {
    name: 'Containers',
    description: '74 running containers, current production web container healthy.',
    type: 'RUNTIME',
    status: 'HEALTHY',
    tone: 'healthy',
  },
  {
    name: 'Deployments',
    description: 'Latest Coolify redeploy completed successfully after retry.',
    type: 'CI/CD',
    status: 'HEALTHY',
    tone: 'healthy',
  },
  {
    name: 'Edge Routing',
    description: 'Cloudflare tunnel, Caddy, and SSL routing are active.',
    type: 'NETWORK',
    status: 'ACTIVE',
    tone: 'active',
  },
  {
    name: 'Storage',
    description: 'Main NVMe and service volumes available.',
    type: 'DISK',
    status: 'ACTIVE',
    tone: 'active',
  },
];

export const QUICK_LINK_GROUPS: QuickLinkGroup[] = [
  {
    title: 'Platform',
    links: [
      { label: 'Coolify', href: 'https://coolify.getouch.co', external: true },
      { label: 'Getouch.co', href: 'https://getouch.co', external: true },
      { label: 'Getouch News', href: 'https://news.getouch.co', external: true },
      { label: 'News CMS', href: 'https://cms.news.getouch.co', external: true },
    ],
  },
  {
    title: 'Operations',
    links: [
      { label: 'pgAdmin', href: 'https://db.getouch.co', external: true },
      { label: 'Grafana', href: 'https://grafana.getouch.co', external: true },
      { label: 'Analytics', href: 'https://analytics.getouch.co', external: true },
    ],
  },
  {
    title: 'AI & Messaging',
    links: [
      { label: 'Open WebUI', href: 'https://ai.getouch.co', external: true },
      { label: 'OpenClaw', href: 'https://openclaw.getouch.co', external: true },
      { label: 'WhatsApp API', href: 'https://wa.getouch.co', external: true },
      { label: 'Search', href: 'https://search.getouch.co', external: true },
    ],
  },
];