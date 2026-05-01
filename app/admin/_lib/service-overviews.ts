import type { DescribeProbeOptions } from '@/lib/platform-service-shared';

export type ServiceOverviewConfig = {
  category: string;
  title: string;
  subtitle: string;
  probeKey: string;
  apiBaseUrl?: string;
  purpose: string;
  role: string;
  dependencies: string[];
  readinessNotes: string[];
  multiTenantNotes?: string[];
  externalOpenUrl?: string | null;
  publicUrlLabel?: string;
  internalUrlLabel?: string;
  runtimeSourceHint?: string;
  healthCheck?: string;
  securityStatus?: string;
  setupStatus?: string;
  statusOptions?: DescribeProbeOptions;
};

export const SERVICE_OVERVIEW_CONFIGS: Record<string, ServiceOverviewConfig> = {
  authentik: {
    category: 'System Orchestration',
    title: 'Authentik',
    subtitle: 'Central SSO / identity provider for the GetTouch operator stack and future tenant-aware admin access.',
    probeKey: 'authentik',
    purpose: 'Secure central login, SSO federation, and policy-based access control.',
    role: 'Identity boundary between operators, internal tools, and tenant-aware admin surfaces.',
    dependencies: ['PostgreSQL database: authentik', 'Redis / Valkey', 'Secure bootstrap credentials'],
    readinessNotes: [
      'Primary subdomain target is sso.getouch.co while authentik.getouch.co is not published in DNS.',
      'Runtime is installed through Coolify and currently redirects correctly on sso.getouch.co.',
      'Keep the admin bootstrap flow behind secure credentials before onboarding operators.',
    ],
    multiTenantNotes: [
      'Use Authentik as the future control-plane identity provider for tenant-aware admin tooling.',
      'Map tenants to groups, roles, and application claims rather than sharing global operator sessions.',
    ],
    externalOpenUrl: 'https://sso.getouch.co',
    healthCheck: 'Public login redirect on sso.getouch.co returns 302/200.',
    securityStatus: 'Authentication is enforced by the Authentik login flow and policy engine.',
    setupStatus: 'Admin bootstrap and SSO integration onboarding are still pending.',
    statusOptions: {
      requirePublicRoute: true,
      missingDetail: 'No Authentik runtime or healthy public route is live yet.',
      onlineDetail: 'Authentik is installed and redirects correctly on sso.getouch.co. Admin onboarding is still required.',
    },
  },
  litellm: {
    category: 'AI Engine & Cognition',
    title: 'LiteLLM Gateway',
    subtitle: 'OpenAI-compatible model router and policy layer for provider failover, access control, and tenant-aware AI routing.',
    probeKey: 'litellm',
    purpose: 'Expose a controlled AI gateway for upstream providers and internal model runtimes.',
    role: 'Shared routing and policy layer between platform applications and provider credentials.',
    dependencies: ['PostgreSQL database: litellm', 'Gateway auth / master key', 'Provider credentials'],
    readinessNotes: [
      'LiteLLM is installed through Coolify and healthy at the origin.',
      'Provider configuration is still pending before it can route production model traffic.',
      'Public edge verification currently differs from origin health and must be rechecked before cutover.',
    ],
    multiTenantNotes: [
      'Attach tenant metadata to every routed request before provider dispatch.',
      'Keep provider keys in internal secrets storage, not tenant-facing key management.',
    ],
    externalOpenUrl: 'https://litellm.getouch.co',
    apiBaseUrl: 'https://litellm.getouch.co/v1',
    healthCheck: 'GET /health/liveliness returns 200 and GET /v1/models returns 401 without credentials.',
    securityStatus: 'Gateway auth is enabled; anonymous model access is rejected.',
    setupStatus: 'Provider configuration is still pending.',
    statusOptions: {
      requirePublicRoute: true,
      missingDetail: 'No LiteLLM runtime or healthy public route is live yet.',
      installedDetail: 'LiteLLM is installed, but public route verification is still pending.',
      degradedDetail: 'LiteLLM is healthy at the origin, but the public hostname is still not serving the gateway route.',
      onlineDetail: 'LiteLLM is online. Provider configuration is still required before production model traffic.',
    },
  },
  qdrant: {
    category: 'AI Engine & Cognition',
    title: 'Qdrant',
    subtitle: 'Vector database for RAG, semantic search, AI memory retrieval, and tenant-aware vector collections.',
    probeKey: 'qdrant',
    purpose: 'Persist embeddings and enable semantic retrieval across AI workflows.',
    role: 'Shared vector substrate for RAG, memory, and semantic document search.',
    dependencies: ['Persistent volume / storage', 'API key or auth guard', 'Embedding producer pipeline'],
    readinessNotes: [
      'Qdrant is installed through Coolify and responds on the protected health endpoint.',
      'Qdrant must not be exposed anonymously.',
      'Collections should be isolated by tenant or namespace before customer traffic is onboarded.',
    ],
    multiTenantNotes: [
      'Use tenant-scoped collection names or payload filters from the start.',
      'Store tenant metadata with points to support retention and purge workflows.',
    ],
    externalOpenUrl: 'https://qdrant.getouch.co',
    healthCheck: 'GET /healthz returns 200 on the public route.',
    securityStatus: 'GET /collections returns 401 without credentials; API auth remains enforced.',
    setupStatus: 'Tenant collection and namespace policy are still pending.',
    statusOptions: {
      requirePublicRoute: true,
      missingDetail: 'No Qdrant runtime is detected and the public route is not yet served.',
      onlineDetail: 'Qdrant is installed and the protected public route responds as expected.',
    },
  },
  airbyte: {
    category: 'Automation & Data Flow',
    title: 'Airbyte',
    subtitle: 'Data ingestion / ELT runtime for syncing external data into the AI ecosystem.',
    probeKey: 'airbyte',
    purpose: 'Move structured and semi-structured data from external systems into the platform.',
    role: 'Data synchronization layer feeding analytics, AI context, and workflow inputs.',
    dependencies: ['PostgreSQL database: airbyte', 'Destination connectors', 'Worker runtime'],
    readinessNotes: [
      'Airbyte is still not deployed on the host.',
      'This Coolify version does not include a built-in production Airbyte template, so installation remains blocked pending a vetted custom stack.',
      'Connector credentials should stay in a secrets manager, not in Git or client-side code.',
    ],
    multiTenantNotes: [
      'Partition source connections by tenant or business unit.',
      'Tag jobs and destination tables with tenant metadata to support lineage and revocation.',
    ],
    externalOpenUrl: 'https://airbyte.getouch.co',
    healthCheck: 'No live runtime is deployed yet.',
    securityStatus: 'Not applicable until a vetted Airbyte stack exists.',
    setupStatus: 'Blocked pending a vetted custom Coolify-compatible stack review.',
    statusOptions: {
      requirePublicRoute: true,
      missingLabel: 'BLOCKED',
      missingTone: 'warning',
      missingDetail: 'Airbyte is still blocked. This Coolify version has no built-in production template and no vetted custom stack is deployed.',
    },
  },
  infisical: {
    category: 'Access & Security',
    title: 'Infisical',
    subtitle: 'Centralized internal secrets vault for infrastructure and application runtime secrets.',
    probeKey: 'infisical',
    purpose: 'Manage internal secrets separately from tenant/client API keys.',
    role: 'Internal secret authority for apps, workers, webhooks, and future environment sync.',
    dependencies: ['PostgreSQL database: infisical', 'Secure bootstrap credentials', 'Operator access policy'],
    readinessNotes: [
      'Infisical is distinct from the portal API Key Manager.',
      'Infisical is installed through Coolify and serves its public status endpoint.',
      'Initial admin setup must be secured before exposing any public login or vault URL.',
    ],
    multiTenantNotes: [
      'Keep tenant-issued API keys in the portal API Key Manager, not in Infisical.',
      'Use Infisical for infrastructure and application secrets only.',
    ],
    externalOpenUrl: 'https://infisical.getouch.co',
    healthCheck: 'GET /api/status returns 200 on the public route.',
    securityStatus: 'Admin access and operator vault policies must remain restricted.',
    setupStatus: 'Admin onboarding and access policy configuration are still pending.',
    statusOptions: {
      requirePublicRoute: true,
      missingDetail: 'No Infisical runtime or healthy public route is live yet.',
      onlineDetail: 'Infisical is installed and serving the public status endpoint. Admin onboarding is still required.',
    },
  },
  coolify: {
    category: 'Infra & Persistence',
    title: 'Coolify',
    subtitle: 'Deployment control plane for portal builds and self-hosted service lifecycle management.',
    probeKey: 'coolify',
    purpose: 'Build, deploy, and supervise platform applications.',
    role: 'Canonical deployment plane for the portal and future AI ecosystem services.',
    dependencies: ['Coolify app controller', 'Coolify PostgreSQL', 'Coolify Redis', 'Cloudflare Access guard'],
    readinessNotes: [
      'Portal deployments must continue through Coolify only.',
      'The current live path remains Cloudflare -> Caddy -> getouch-coolify-app -> Coolify app container.',
    ],
    multiTenantNotes: [
      'Use isolated projects or environments per tenant-facing workload where needed.',
      'Do not bypass the Coolify deployment path for the portal.',
    ],
    externalOpenUrl: 'https://coolify.getouch.co',
    statusOptions: {
      requirePublicRoute: true,
      onlineDetail: 'Coolify runtime is healthy and the public route is protected by Cloudflare Access.',
      publicOnlyDetail: 'Coolify is reachable through a protected public route.',
    },
  },
  grafana: {
    category: 'Observability & Tracing',
    title: 'Grafana',
    subtitle: 'Platform monitoring dashboards for infrastructure and service health.',
    probeKey: 'grafana',
    purpose: 'Visualize system metrics, service health, and operational dashboards.',
    role: 'Operational observability surface for infrastructure and runtime monitoring.',
    dependencies: ['Grafana runtime', 'Prometheus / datasource config', 'Operator authentication'],
    readinessNotes: [
      'Grafana currently returns a login redirect, which is expected for a protected UI.',
      'Use Langfuse for AI traces; use Grafana for platform-level monitoring.',
    ],
    multiTenantNotes: [
      'Keep tenant-sensitive dashboards behind authenticated org boundaries.',
      'Avoid exposing raw infrastructure metrics anonymously.',
    ],
    externalOpenUrl: 'https://grafana.getouch.co',
    statusOptions: {
      requirePublicRoute: true,
      onlineDetail: 'Grafana runtime is healthy and the protected route responds as expected.',
    },
  },
  'open-webui': {
    category: 'Communication Hubs',
    title: 'Open WebUI',
    subtitle: 'Operator and end-user AI interaction surface for chat, retrieval, and workflow-assisted operations.',
    probeKey: 'open-webui',
    purpose: 'Provide a human-facing AI workspace without embedding the external UI into the portal.',
    role: 'Primary conversational workspace across models, documents, and pipelines.',
    dependencies: ['Open WebUI runtime', 'Model gateway endpoint', 'Optional pipelines runtime'],
    readinessNotes: [
      'The portal should link out to Open WebUI rather than clone its interface.',
      'Keep model credentials and internal secrets on the server side only.',
    ],
    multiTenantNotes: [
      'Tenant context should flow into model requests and downstream observability metadata.',
      'Separate shared workspaces from tenant-specific chats and documents.',
    ],
    externalOpenUrl: 'https://ai.getouch.co',
    runtimeSourceHint: 'Existing public app on the primary VPS.',
    healthCheck: 'Public route responds 200/302.',
    securityStatus: 'Authentication and workspace controls are handled inside Open WebUI.',
    setupStatus: 'Model and pipeline integration configuration remain outside the portal.',
    statusOptions: {
      requirePublicRoute: true,
      onlineDetail: 'Open WebUI is online and reachable through the public route.',
    },
  },
};