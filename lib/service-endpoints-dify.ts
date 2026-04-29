import { count, desc, sql } from 'drizzle-orm';
import { getSecretInventory, type SecretInventoryItem } from './api-keys';
import { db } from './db';
import { difyConnections } from './schema';

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
    providerStatus: string;
    lastHealthCheck: string;
  };
  serviceInformation: {
    publicUrl: string;
    internalUrl: string | null;
    version: string | null;
    databaseStatus: string | null;
    redisStatus: string | null;
    storageStatus: string | null;
    lastHealthCheck: string;
    apiHealthEndpoint: string;
    apiHealthAvailable: boolean;
    appsApiStatus: string;
  };
  quickActions: Array<{ label: string; href: string; external?: boolean }>;
  apiAccess: {
    managerUrl: string;
    secrets: SecretInventoryItem[];
    summary: string;
  };
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
  const [currentProbe, appsApiProbe, dbCounts, recentChecks] = await Promise.all([
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
      providerStatus,
      lastHealthCheck: currentProbe.checkedAt,
    },
    serviceInformation: {
      publicUrl: DIFY_PUBLIC_URL,
      internalUrl: process.env.DIFY_BASE_URL || null,
      version: process.env.DIFY_VERSION || null,
      databaseStatus: null,
      redisStatus: null,
      storageStatus: null,
      lastHealthCheck: currentProbe.checkedAt,
      apiHealthEndpoint: '/console/api/apps?page=1&limit=1',
      apiHealthAvailable: false,
      appsApiStatus: appsApiProbe.statusCode === 401
        ? 'Console API reachable and auth protected (401)'
        : appsApiProbe.statusCode
          ? `Console API returned ${appsApiProbe.statusCode}`
          : 'Console API probe unavailable',
    },
    quickActions: [
      { label: 'Open Dify', href: DIFY_APPS_URL, external: true },
      { label: 'API Docs', href: 'https://docs.dify.ai/api-reference', external: true },
      { label: 'View Logs', href: 'https://coolify.getouch.co', external: true },
      { label: 'View Apps', href: DIFY_APPS_URL, external: true },
      { label: 'View Workflows', href: DIFY_APPS_URL, external: true },
    ],
    apiAccess: {
      managerUrl: '/admin/api-keys',
      secrets,
      summary: providerStatus,
    },
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