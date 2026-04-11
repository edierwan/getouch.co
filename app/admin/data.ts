export type StatusTone = 'healthy' | 'active' | 'warning';

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

export const ADMIN_NAV: NavSection[] = [
  {
    label: 'OVERVIEW',
    items: [{ label: 'Dashboard', href: '/admin', icon: '⌘' }],
  },
  {
    label: 'INFRASTRUCTURE',
    items: [
      { label: 'Servers & Nodes', href: '/admin/servers', icon: '▣' },
      { label: 'Databases', href: '/admin/databases', icon: '▤' },
      { label: 'Reverse Proxy', href: '/admin/reverse-proxy', icon: '◫' },
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
    items: [{ label: 'AI Services', href: '/admin/ai-services', icon: '◎' }],
  },
  {
    label: 'MONITORING',
    items: [{ label: 'System Health', href: '/admin/system-health', icon: '∿' }],
  },
  {
    label: 'ACCESS',
    items: [{ label: 'Quick Links', href: '/admin/quick-links', icon: '⊞' }],
  },
];

export const DASHBOARD_SUMMARY: SummaryCard[] = [
  { label: 'TOTAL SERVICES', value: '16', icon: '▤' },
  { label: 'HEALTHY', value: '16', tone: 'healthy', icon: '♡' },
  { label: 'DEGRADED', value: '0', tone: 'warning', icon: '△' },
  { label: 'APPLICATIONS', value: '3', icon: '▣' },
  { label: 'MAIL', value: 'Relay', tone: 'active', icon: '✉' },
  { label: 'AI ENGINE', value: 'Active', tone: 'active', icon: '◎' },
];

export const QUICK_ACTIONS = [
  { label: 'Open Coolify', href: 'https://coolify.getouch.co', external: true },
  { label: 'Open AI', href: 'https://ai.getouch.co', external: true },
  { label: 'Open pgAdmin', href: 'https://db.getouch.co', external: true },
  { label: 'Open Storage', href: 'https://s3.getouch.co', external: true },
  { label: 'Open Grafana', href: 'https://grafana.getouch.co', external: true },
  { label: 'Manage Users', href: '/admin/users' },
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
    description: 'Self-hosted PaaS for deployments and rolling updates.',
    type: 'DEPLOYMENT',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://coolify.getouch.co',
  },
  {
    name: 'Open WebUI',
    description: 'AI chat, RAG, and model management interface.',
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
    name: 'Serapod Staging',
    description: 'Supabase staging stack for Serapod workloads.',
    type: 'BAAS',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-stg-serapod.getouch.co',
  },
  {
    name: 'QRSys Production',
    description: 'Production Supabase stack for QR System.',
    type: 'BAAS',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://st-prd-qrsys.getouch.co',
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
    name: 'Open WebUI',
    description: 'Operator and end-user AI interface.',
    type: 'PORTAL',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://ai.getouch.co',
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
      { label: 'WhatsApp API', href: 'https://wa.getouch.co', external: true },
      { label: 'Search', href: 'https://search.getouch.co', external: true },
    ],
  },
];