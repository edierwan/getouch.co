export type AdminStatus = 'HEALTHY' | 'ONLINE' | 'ACTIVE' | 'DEGRADED';

export interface AdminService {
  name: string;
  type: string;
  category: string;
  description: string;
  url?: string;
  healthUrl?: string;
}

export interface AdminServiceWithStatus extends AdminService {
  status: AdminStatus;
}

export const ADMIN_SERVICES: AdminService[] = [
  {
    name: 'Caddy',
    type: 'Reverse Proxy',
    category: 'Infrastructure',
    description: 'HTTPS edge proxy for getouch.co services.',
    url: 'https://getouch.co',
    healthUrl: 'https://getouch.co',
  },
  {
    name: 'PostgreSQL 16',
    type: 'Database',
    category: 'Infrastructure',
    description: 'Primary relational database for auth, admin, and platform workloads.',
  },
  {
    name: 'pgAdmin 4',
    type: 'Database Admin',
    category: 'Infrastructure',
    description: 'PostgreSQL management console.',
    url: 'https://db.getouch.co',
    healthUrl: 'https://db.getouch.co',
  },
  {
    name: 'Cloudflare Tunnel',
    type: 'Ingress',
    category: 'Infrastructure',
    description: 'Cloudflare edge tunnel for public ingress routing.',
  },
  {
    name: 'Coolify',
    type: 'Deployment',
    category: 'Platform',
    description: 'Self-hosted application deployment platform.',
    url: 'https://coolify.getouch.co',
    healthUrl: 'https://coolify.getouch.co',
  },
  {
    name: 'Getouch.co Production',
    type: 'Application',
    category: 'Platform',
    description: 'Primary production Next.js application.',
    url: 'https://getouch.co',
    healthUrl: 'https://getouch.co',
  },
  {
    name: 'Getouch News',
    type: 'Application',
    category: 'Platform',
    description: 'News portal and content surface.',
    url: 'https://news.getouch.co',
    healthUrl: 'https://news.getouch.co',
  },
  {
    name: 'Open WebUI',
    type: 'AI Service',
    category: 'AI & Automation',
    description: 'AI portal and chat interface.',
    url: 'https://ai.getouch.co',
    healthUrl: 'https://ai.getouch.co',
  },
  {
    name: 'Ollama',
    type: 'AI Engine',
    category: 'AI & Automation',
    description: 'GPU-backed LLM inference runtime.',
  },
  {
    name: 'SearXNG',
    type: 'Search',
    category: 'AI & Automation',
    description: 'Private search aggregation layer.',
    url: 'https://search.getouch.co',
    healthUrl: 'https://search.getouch.co',
  },
  {
    name: 'Getouch SSO',
    type: 'Auth / Supabase',
    category: 'Identity',
    description: 'Shared authentication and identity services.',
    url: 'https://st-sso.getouch.co',
    healthUrl: 'https://st-sso.getouch.co',
  },
  {
    name: 'Serapod Staging',
    type: 'Supabase',
    category: 'Identity',
    description: 'Serapod staging stack and APIs.',
    url: 'https://st-stg-serapod.getouch.co',
    healthUrl: 'https://st-stg-serapod.getouch.co',
  },
  {
    name: 'QRSys Dev',
    type: 'Supabase',
    category: 'Identity',
    description: 'QR system development stack.',
    url: 'https://st-dev-qrsys.getouch.co',
    healthUrl: 'https://st-dev-qrsys.getouch.co',
  },
  {
    name: 'QRSys Prod',
    type: 'Supabase',
    category: 'Identity',
    description: 'QR system production stack.',
    url: 'https://st-prd-qrsys.getouch.co',
    healthUrl: 'https://st-prd-qrsys.getouch.co',
  },
  {
    name: 'WhatsApp API',
    type: 'Messaging',
    category: 'Communication',
    description: 'WhatsApp gateway and automation endpoint.',
    url: 'https://wa.getouch.co',
    healthUrl: 'https://wa.getouch.co/healthz',
  },
  {
    name: 'Chatwoot',
    type: 'Support',
    category: 'Communication',
    description: 'Customer support workspace.',
  },
  {
    name: 'SeaweedFS',
    type: 'Object Storage',
    category: 'Storage',
    description: 'S3-compatible object storage backend.',
    url: 'https://s3api.getouch.co',
  },
  {
    name: 'Filestash',
    type: 'File Browser',
    category: 'Storage',
    description: 'Browser-based file access for storage volumes.',
    url: 'https://s3.getouch.co',
    healthUrl: 'https://s3.getouch.co',
  },
  {
    name: 'Grafana',
    type: 'Monitoring',
    category: 'Monitoring',
    description: 'Metrics and dashboards.',
    url: 'https://grafana.getouch.co',
    healthUrl: 'https://grafana.getouch.co',
  },
  {
    name: 'Umami Analytics',
    type: 'Analytics',
    category: 'Monitoring',
    description: 'Self-hosted web analytics.',
    url: 'https://analytics.getouch.co',
    healthUrl: 'https://analytics.getouch.co',
  },
];

export const QUICK_ACTIONS = [
  { label: 'Open Coolify', url: 'https://coolify.getouch.co' },
  { label: 'Open AI', url: 'https://ai.getouch.co' },
  { label: 'Open pgAdmin', url: 'https://db.getouch.co' },
  { label: 'Open Grafana', url: 'https://grafana.getouch.co' },
  { label: 'Open Storage', url: 'https://s3.getouch.co' },
  { label: 'Open Analytics', url: 'https://analytics.getouch.co' },
];

export const NETWORK_INFO = [
  { label: 'Public Access', value: 'Cloudflare Tunnel + Caddy' },
  { label: 'Domain', value: 'getouch.co' },
  { label: 'SSL', value: "Let's Encrypt VALID" },
  { label: 'Firewall', value: 'UFW + DOCKER-USER ACTIVE' },
  { label: 'VPN', value: 'Tailscale 100.84.14.93' },
];

export const ENVIRONMENT_INFO = [
  { label: 'CPU', value: '12 vCPU' },
  { label: 'Memory', value: '64 GB DDR5' },
  { label: 'GPU', value: 'RTX 5060 Ti 16GB' },
  { label: 'Storage', value: '98 GB OS + 1.5 TB NVMe' },
  { label: 'OS', value: 'Ubuntu 24.04.4 LTS' },
  { label: 'Containers', value: '74 running' },
];

export const SERVER_NODES = [
  {
    name: 'Primary VPS',
    address: '100.84.14.93',
    role: 'Main application and AI host',
    specs: '12 vCPU, 64 GB RAM, RTX 5060 Ti, Ubuntu 24.04.4 LTS',
    status: 'ACTIVE',
  },
  {
    name: 'Edge Access',
    address: 'Cloudflare Tunnel + Tailscale',
    role: 'Ingress, zero-trust access, private ops path',
    specs: 'Public ingress via tunnel, private admin via tailnet',
    status: 'ACTIVE',
  },
  {
    name: 'Runtime',
    address: 'Coolify + Docker',
    role: 'Application and service orchestration',
    specs: '74 running containers, 0 unhealthy after April hardening',
    status: 'HEALTHY',
  },
];

async function probeUrl(url: string): Promise<AdminStatus> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    if (response.ok) return 'HEALTHY';
    if (response.status === 405 || response.status === 403) {
      const fallback = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      });
      return fallback.ok ? 'ONLINE' : 'DEGRADED';
    }
    return 'DEGRADED';
  } catch {
    return 'DEGRADED';
  }
}

export async function getServicesWithStatus(): Promise<AdminServiceWithStatus[]> {
  return Promise.all(
    ADMIN_SERVICES.map(async (service) => {
      if (!service.healthUrl) {
        return { ...service, status: 'ACTIVE' };
      }
      return { ...service, status: await probeUrl(service.healthUrl) };
    })
  );
}