import { count, desc, sql } from 'drizzle-orm';
import { getSecretInventory, type SecretInventoryItem } from './api-keys';
import { db } from './db';
import { difyConnections, difyTenantMappings } from './schema';

export type DifyHealthProbe = {
  checkedAt: string;
  ok: boolean;
  statusCode: number | null;
  target: string;
  message: string;
};

export type DifyDashboardStatus = {
  checkedAt: string;
  summary: {
    statusLabel: string;
    statusTone: 'healthy' | 'warning';
    publicEndpoint: string;
    appsCount: number | null;
    workflowsCount: number | null;
    knowledgeBasesCount: number | null;
    workerStatus: string;
    providerStatus: string;
    lastHealthCheck: string;
  };
  serviceInformation: {
    publicUrl: string;
    internalUrl: string | null;
    version: string | null;
    databaseName: string;
    databaseStatus: string | null;
    redisStatus: string | null;
    storageStatus: string | null;
    deploymentMode: string;
    lastHealthCheck: string;
    apiHealthEndpoint: string;
    apiHealthAvailable: boolean;
    appsApiStatus: string;
  };
  runtimeComponents: Array<{
    key: 'database' | 'redis' | 'worker' | 'sandbox' | 'plugin-daemon';
    label: string;
    status: 'healthy' | 'warning';
    detail: string;
    observable: boolean;
  }>;
  quickActions: Array<{ label: string; href: string; external?: boolean }>;
  apiAccess: {
    managerUrl: string;
    secrets: SecretInventoryItem[];
    summary: string;
  };
  tenantMappings: {
    summary: string;
    rows: Array<{
      id: string;
      tenantId: string;
      difyWorkspaceId: string | null;
      difyAppId: string | null;
      difyWorkflowId: string | null;
      status: string;
      assignedBotWorkflow: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  providerPlan: {
    currentStatus: string;
    currentEndpoint: string;
    currentModelAlias: string;
    futureEndpoint: string;
    note: string;
  };
  integrationFlow: string[];
  usage: {
    recentHealthChecks: Array<{
      id: string;
      label: string;
      domain: string;
      status: string;
      message: string | null;
      testedAt: string | null;
    }>;
    recentApiCallsAvailable: boolean;
  };
  managedConnections: {
    total: number;
    active: number;
  };
  currentProbe: DifyHealthProbe;
};

const DIFY_PUBLIC_URL = 'https://dify.getouch.co';
const DIFY_APPS_URL = `${DIFY_PUBLIC_URL}/apps`;
const DIFY_APPS_API_URL = `${DIFY_PUBLIC_URL}/console/api/apps?page=1&limit=1`;
const DIFY_DOCS_URL = 'https://docs.dify.ai/en/self-host/quick-start/docker-compose';

function runtimeComponentStatus(
  detail: string,
  observable: boolean,
): Pick<DifyDashboardStatus['runtimeComponents'][number], 'status' | 'detail' | 'observable'> {
  return {
    status: observable ? 'healthy' : 'warning',
    detail,
    observable,
  };
}

async function probe(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      ...init,
      headers: {
        Accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
        ...(init?.headers || {}),
      },
    });

    return {
      ok: response.ok,
      statusCode: response.status,
    };
  } catch {
    return {
      ok: false,
      statusCode: null,
    };
  }
}

export async function runDifyHealthCheck(): Promise<DifyHealthProbe> {
  const checkedAt = new Date().toISOString();
  const appUi = await probe(DIFY_APPS_URL, { method: 'HEAD' });

  return {
    checkedAt,
    ok: appUi.ok,
    statusCode: appUi.statusCode,
    target: DIFY_APPS_URL,
    message: appUi.ok
      ? 'Native Dify workspace UI is reachable.'
      : 'Native Dify workspace UI did not return a healthy response.',
  };
}

export async function getDifyDashboardStatus(): Promise<DifyDashboardStatus> {
  const checkedAt = new Date().toISOString();
  const [currentProbe, appsApiProbe, dbCounts, recentChecks, tenantMappings] = await Promise.all([
    runDifyHealthCheck(),
    probe(DIFY_APPS_API_URL),
    (async () => {
      try {
        const [row] = await db
          .select({
            total: count(),
            active: sql<number>`count(*) filter (where ${difyConnections.status} = 'active')`,
            apps: sql<number>`count(*) filter (where ${difyConnections.difyAppId} is not null and lower(${difyConnections.difyAppType}) <> 'workflow')`,
            workflows: sql<number>`count(*) filter (where ${difyConnections.difyAppId} is not null and lower(${difyConnections.difyAppType}) = 'workflow')`,
          })
          .from(difyConnections);

        return {
          total: Number(row?.total ?? 0),
          active: Number(row?.active ?? 0),
          apps: Number(row?.apps ?? 0),
          workflows: Number(row?.workflows ?? 0),
        };
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        return await db
          .select({
            id: difyConnections.id,
            label: difyConnections.label,
            domain: difyConnections.domain,
            status: difyConnections.status,
            message: difyConnections.lastTestMessage,
            testedAt: difyConnections.lastTestedAt,
          })
          .from(difyConnections)
          .orderBy(desc(difyConnections.lastTestedAt), desc(difyConnections.updatedAt))
          .limit(8);
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        const rows = await db
          .select({
            id: difyTenantMappings.id,
            tenantId: difyTenantMappings.tenantId,
            difyWorkspaceId: difyTenantMappings.difyWorkspaceId,
            difyAppId: difyTenantMappings.difyAppId,
            difyWorkflowId: difyTenantMappings.difyWorkflowId,
            status: difyTenantMappings.status,
            createdAt: difyTenantMappings.createdAt,
            updatedAt: difyTenantMappings.updatedAt,
          })
          .from(difyTenantMappings)
          .orderBy(desc(difyTenantMappings.updatedAt), desc(difyTenantMappings.createdAt))
          .limit(12);

        return {
          available: true,
          rows: rows.map((row) => ({
            id: row.id,
            tenantId: row.tenantId,
            difyWorkspaceId: row.difyWorkspaceId,
            difyAppId: row.difyAppId,
            difyWorkflowId: row.difyWorkflowId,
            status: row.status,
            assignedBotWorkflow: row.difyWorkflowId
              ? `Workflow ${row.difyWorkflowId}`
              : row.difyAppId
                ? `App ${row.difyAppId}`
                : null,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          })),
        };
      } catch {
        return {
          available: false,
          rows: [],
        };
      }
    })(),
  ]);

  const secrets = getSecretInventory().filter((item) => item.service === 'dify');
  const configuredSecrets = secrets.filter((item) => item.status === 'configured').length;
  const providerStatus = configuredSecrets > 0
    ? `${configuredSecrets} configured`
    : 'No Dify env keys wired in portal runtime';

  return {
    checkedAt,
    summary: {
      statusLabel: currentProbe.ok ? 'Healthy' : 'Degraded',
      statusTone: currentProbe.ok ? 'healthy' : 'warning',
      publicEndpoint: DIFY_PUBLIC_URL,
      appsCount: dbCounts ? dbCounts.apps : null,
      workflowsCount: dbCounts ? dbCounts.workflows : null,
      knowledgeBasesCount: null,
      workerStatus: 'Not exposed by portal runtime',
      providerStatus,
      lastHealthCheck: currentProbe.checkedAt,
    },
    serviceInformation: {
      publicUrl: DIFY_PUBLIC_URL,
      internalUrl: process.env.DIFY_BASE_URL || null,
      version: process.env.DIFY_VERSION || null,
      databaseName: 'dify',
      databaseStatus: 'Dedicated runtime database. Portal cannot verify container health directly.',
      redisStatus: 'Dedicated runtime Redis. Portal cannot verify container health directly.',
      storageStatus: 'Runtime uploads and datasets stay in Dify storage volumes.',
      deploymentMode: 'Docker Compose behind Caddy',
      lastHealthCheck: currentProbe.checkedAt,
      apiHealthEndpoint: '/console/api/apps?page=1&limit=1',
      apiHealthAvailable: appsApiProbe.statusCode === 401,
      appsApiStatus: appsApiProbe.statusCode === 401
        ? 'Console API reachable and auth protected (401)'
        : appsApiProbe.statusCode
          ? `Console API returned ${appsApiProbe.statusCode}`
          : 'Console API probe unavailable',
    },
    runtimeComponents: [
      {
        key: 'database',
        label: 'Database',
        ...runtimeComponentStatus('Dedicated `dify` Postgres database exists, but the portal cannot poll the container directly.', false),
      },
      {
        key: 'redis',
        label: 'Redis',
        ...runtimeComponentStatus('Dify uses a dedicated Redis instance, but the portal cannot poll it directly.', false),
      },
      {
        key: 'worker',
        label: 'Worker',
        ...runtimeComponentStatus('Worker queue health is not exposed by the public endpoint.', false),
      },
      {
        key: 'sandbox',
        label: 'Sandbox',
        ...runtimeComponentStatus('Sandbox health is not exposed by the public endpoint.', false),
      },
      {
        key: 'plugin-daemon',
        label: 'Plugin daemon',
        ...runtimeComponentStatus('Plugin daemon health is not exposed by the public endpoint.', false),
      },
    ],
    quickActions: [
      { label: 'Open Dify', href: DIFY_APPS_URL, external: true },
      { label: 'View Docs', href: DIFY_DOCS_URL, external: true },
      { label: 'View Logs', href: 'https://coolify.getouch.co', external: true },
      { label: 'View Workers', href: 'https://coolify.getouch.co', external: true },
      { label: 'Configure Model Provider', href: DIFY_APPS_URL, external: true },
    ],
    apiAccess: {
      managerUrl: '/admin/api-keys',
      secrets,
      summary: providerStatus,
    },
    tenantMappings: {
      summary: tenantMappings.rows.length > 0
        ? `${tenantMappings.rows.length} Portal tenant mappings assigned to Dify.`
        : tenantMappings.available
          ? 'No Portal tenant mappings have been assigned to Dify yet.'
          : 'Tenant mapping table is not available in this portal runtime yet.',
      rows: tenantMappings.rows,
    },
    providerPlan: {
      currentStatus: 'Pending operator configuration in Dify',
      currentEndpoint: 'https://vllm.getouch.co/v1',
      currentModelAlias: 'getouch-qwen3-14b',
      futureEndpoint: 'https://llm.getouch.co/v1',
      note: 'Use vLLM directly only when the backend is confirmed ready. Keep llm.getouch.co reserved for future LiteLLM routing.',
    },
    integrationFlow: [
      'WhatsApp message -> Baileys or Evolution Gateway',
      'Getouch routing / WAPI layer decides whether Dify is enabled for the tenant',
      'Dify bot or workflow handles AI orchestration when enabled',
      'Chatwoot becomes the human handover surface when escalation is required',
      'Replies route back through the selected WhatsApp provider',
    ],
    usage: {
      recentHealthChecks: recentChecks.map((row) => ({
        id: row.id,
        label: row.label,
        domain: row.domain,
        status: row.status,
        message: row.message,
        testedAt: row.testedAt ? row.testedAt.toISOString() : null,
      })),
      recentApiCallsAvailable: false,
    },
    managedConnections: {
      total: dbCounts?.total ?? 0,
      active: dbCounts?.active ?? 0,
    },
    currentProbe,
  };
}