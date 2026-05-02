import { asc, count, desc, eq } from 'drizzle-orm';
import { db } from './db';
import {
  platformApps,
  platformAppTenantBindings,
  platformSecretRefs,
  platformServiceIntegrations,
} from './schema';

type JsonRecord = Record<string, unknown>;

export interface PlatformAccessSummary {
  appCount: number;
  activeTenantBindingCount: number;
  serviceIntegrationCount: number;
  secretRefCount: number;
  scopedKeyCount: number;
}

export interface PlatformAppItem {
  id: string;
  appCode: string;
  name: string;
  description: string | null;
  authModel: string;
  defaultChannel: string | null;
  status: string;
  metadata: JsonRecord;
  createdAt: string;
  updatedAt: string;
  tenantBindingCount: number;
  activeTenantBindingCount: number;
  serviceIntegrationCount: number;
  secretRefCount: number;
}

export interface PlatformTenantBindingItem {
  id: string;
  appId: string;
  appCode: string;
  appName: string;
  appTenantKey: string;
  displayName: string | null;
  status: string;
  environment: string;
  metadata: JsonRecord;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformServiceIntegrationItem {
  id: string;
  appId: string;
  appCode: string;
  appName: string;
  tenantBindingId: string | null;
  tenantBindingKey: string | null;
  tenantDisplayName: string | null;
  serviceName: string;
  resourceType: string;
  resourceId: string;
  displayName: string | null;
  baseUrl: string | null;
  internalBaseUrl: string | null;
  status: string;
  metadata: JsonRecord;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSecretRefItem {
  id: string;
  appId: string;
  appCode: string;
  appName: string;
  tenantBindingId: string | null;
  tenantBindingKey: string | null;
  tenantDisplayName: string | null;
  serviceName: string;
  refProvider: string;
  refPath: string;
  refKey: string | null;
  scope: string;
  status: string;
  rotatedAt: string | null;
  metadata: JsonRecord;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformAccessSnapshot {
  summary: PlatformAccessSummary;
  apps: PlatformAppItem[];
  selectedAppCode: string | null;
  selectedApp: PlatformAppItem | null;
  tenantBindings: PlatformTenantBindingItem[];
  serviceIntegrations: PlatformServiceIntegrationItem[];
  secretRefs: PlatformSecretRefItem[];
  selectedTenantBindingId: string | null;
  selectedTenantBinding: PlatformTenantBindingItem | null;
  selectedTenantServiceIntegrations: PlatformServiceIntegrationItem[];
  selectedTenantSecretRefs: PlatformSecretRefItem[];
  writeFlows: {
    createApp: 'enabled';
    createTenantBinding: 'enabled';
    createServiceIntegration: 'enabled';
    createSecretRef: 'enabled';
  };
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

export async function getPlatformAccessSummary(): Promise<PlatformAccessSummary> {
  const [appsResult, bindingsResult, integrationsResult, secretRefsResult] = await Promise.all([
    db.select({ count: count() }).from(platformApps),
    db
      .select({ count: count() })
      .from(platformAppTenantBindings)
      .where(eq(platformAppTenantBindings.status, 'active')),
    db.select({ count: count() }).from(platformServiceIntegrations),
    db.select({ count: count() }).from(platformSecretRefs),
  ]);

  const appCount = Number(appsResult[0]?.count ?? 0);
  const activeTenantBindingCount = Number(bindingsResult[0]?.count ?? 0);
  const serviceIntegrationCount = Number(integrationsResult[0]?.count ?? 0);
  const secretRefCount = Number(secretRefsResult[0]?.count ?? 0);

  return {
    appCount,
    activeTenantBindingCount,
    serviceIntegrationCount,
    secretRefCount,
    scopedKeyCount: secretRefCount,
  };
}

async function listPlatformAppsRaw() {
  return db.select().from(platformApps).orderBy(desc(platformApps.createdAt), asc(platformApps.name));
}

async function listPlatformTenantBindingsRaw() {
  return db
    .select()
    .from(platformAppTenantBindings)
    .orderBy(asc(platformAppTenantBindings.appTenantKey), desc(platformAppTenantBindings.createdAt));
}

async function listPlatformServiceIntegrationsRaw() {
  return db
    .select()
    .from(platformServiceIntegrations)
    .orderBy(asc(platformServiceIntegrations.serviceName), asc(platformServiceIntegrations.resourceType));
}

async function listPlatformSecretRefsRaw() {
  return db
    .select()
    .from(platformSecretRefs)
    .orderBy(asc(platformSecretRefs.serviceName), asc(platformSecretRefs.refPath));
}

export async function getPlatformAccessSnapshot(opts?: {
  selectedAppCode?: string | null;
  selectedTenantBindingId?: string | null;
}): Promise<PlatformAccessSnapshot> {
  const [summary, rawApps, rawBindings, rawIntegrations, rawSecretRefs] = await Promise.all([
    getPlatformAccessSummary(),
    listPlatformAppsRaw(),
    listPlatformTenantBindingsRaw(),
    listPlatformServiceIntegrationsRaw(),
    listPlatformSecretRefsRaw(),
  ]);

  const rawAppMap = new Map(rawApps.map((app) => [app.id, app]));
  const rawBindingMap = new Map(rawBindings.map((binding) => [binding.id, binding]));

  const bindingCountByAppId = new Map<string, number>();
  const activeBindingCountByAppId = new Map<string, number>();
  for (const binding of rawBindings) {
    bindingCountByAppId.set(binding.appId, (bindingCountByAppId.get(binding.appId) ?? 0) + 1);
    if (binding.status === 'active') {
      activeBindingCountByAppId.set(binding.appId, (activeBindingCountByAppId.get(binding.appId) ?? 0) + 1);
    }
  }

  const integrationCountByAppId = new Map<string, number>();
  for (const integration of rawIntegrations) {
    integrationCountByAppId.set(integration.appId, (integrationCountByAppId.get(integration.appId) ?? 0) + 1);
  }

  const secretRefCountByAppId = new Map<string, number>();
  for (const secretRef of rawSecretRefs) {
    secretRefCountByAppId.set(secretRef.appId, (secretRefCountByAppId.get(secretRef.appId) ?? 0) + 1);
  }

  const apps: PlatformAppItem[] = rawApps.map((app) => ({
    id: app.id,
    appCode: app.appCode,
    name: app.name,
    description: app.description,
    authModel: app.authModel,
    defaultChannel: app.defaultChannel,
    status: app.status,
    metadata: asRecord(app.metadata),
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    tenantBindingCount: bindingCountByAppId.get(app.id) ?? 0,
    activeTenantBindingCount: activeBindingCountByAppId.get(app.id) ?? 0,
    serviceIntegrationCount: integrationCountByAppId.get(app.id) ?? 0,
    secretRefCount: secretRefCountByAppId.get(app.id) ?? 0,
  }));

  const selectedApp = apps.find((app) => app.appCode === opts?.selectedAppCode)
    ?? apps.find((app) => app.appCode === 'wapi')
    ?? apps[0]
    ?? null;

  const bindings: PlatformTenantBindingItem[] = rawBindings
    .map((binding) => {
      const app = rawAppMap.get(binding.appId);
      if (!app) return null;
      return {
        id: binding.id,
        appId: binding.appId,
        appCode: app.appCode,
        appName: app.name,
        appTenantKey: binding.appTenantKey,
        displayName: binding.displayName,
        status: binding.status,
        environment: binding.environment,
        metadata: asRecord(binding.metadata),
        lastSyncedAt: toIso(binding.lastSyncedAt),
        createdAt: binding.createdAt.toISOString(),
        updatedAt: binding.updatedAt.toISOString(),
      } satisfies PlatformTenantBindingItem;
    })
    .filter((binding): binding is PlatformTenantBindingItem => Boolean(binding));

  const integrations: PlatformServiceIntegrationItem[] = rawIntegrations
    .map((integration) => {
      const app = rawAppMap.get(integration.appId);
      if (!app) return null;
      const binding = integration.tenantBindingId ? rawBindingMap.get(integration.tenantBindingId) ?? null : null;
      return {
        id: integration.id,
        appId: integration.appId,
        appCode: app.appCode,
        appName: app.name,
        tenantBindingId: integration.tenantBindingId,
        tenantBindingKey: binding?.appTenantKey ?? null,
        tenantDisplayName: binding?.displayName ?? null,
        serviceName: integration.serviceName,
        resourceType: integration.resourceType,
        resourceId: integration.resourceId,
        displayName: integration.displayName,
        baseUrl: integration.baseUrl,
        internalBaseUrl: integration.internalBaseUrl,
        status: integration.status,
        metadata: asRecord(integration.metadata),
        createdAt: integration.createdAt.toISOString(),
        updatedAt: integration.updatedAt.toISOString(),
      } satisfies PlatformServiceIntegrationItem;
    })
    .filter((integration): integration is PlatformServiceIntegrationItem => Boolean(integration));

  const secretRefs: PlatformSecretRefItem[] = rawSecretRefs
    .map((secretRef) => {
      const app = rawAppMap.get(secretRef.appId);
      if (!app) return null;
      const binding = secretRef.tenantBindingId ? rawBindingMap.get(secretRef.tenantBindingId) ?? null : null;
      return {
        id: secretRef.id,
        appId: secretRef.appId,
        appCode: app.appCode,
        appName: app.name,
        tenantBindingId: secretRef.tenantBindingId,
        tenantBindingKey: binding?.appTenantKey ?? null,
        tenantDisplayName: binding?.displayName ?? null,
        serviceName: secretRef.serviceName,
        refProvider: secretRef.refProvider,
        refPath: secretRef.refPath,
        refKey: secretRef.refKey,
        scope: secretRef.scope,
        status: secretRef.status,
        rotatedAt: toIso(secretRef.rotatedAt),
        metadata: asRecord(secretRef.metadata),
        createdAt: secretRef.createdAt.toISOString(),
        updatedAt: secretRef.updatedAt.toISOString(),
      } satisfies PlatformSecretRefItem;
    })
    .filter((secretRef): secretRef is PlatformSecretRefItem => Boolean(secretRef));

  const tenantBindings = selectedApp
    ? bindings.filter((binding) => binding.appId === selectedApp.id)
    : [];
  const serviceIntegrations = selectedApp
    ? integrations.filter((integration) => integration.appId === selectedApp.id)
    : [];
  const selectedSecretRefs = selectedApp
    ? secretRefs.filter((secretRef) => secretRef.appId === selectedApp.id)
    : [];

  const selectedTenantBinding = tenantBindings.find((binding) => binding.id === opts?.selectedTenantBindingId)
    ?? tenantBindings.find((binding) => binding.status === 'active')
    ?? tenantBindings[0]
    ?? null;

  const selectedTenantServiceIntegrations = selectedTenantBinding
    ? serviceIntegrations.filter(
        (integration) =>
          integration.tenantBindingId === selectedTenantBinding.id || integration.tenantBindingId === null,
      )
    : serviceIntegrations.filter((integration) => integration.tenantBindingId === null);

  const selectedTenantSecretRefs = selectedTenantBinding
    ? selectedSecretRefs.filter(
        (secretRef) =>
          secretRef.tenantBindingId === selectedTenantBinding.id || secretRef.tenantBindingId === null,
      )
    : selectedSecretRefs.filter((secretRef) => secretRef.tenantBindingId === null);

  return {
    summary,
    apps,
    selectedAppCode: selectedApp?.appCode ?? null,
    selectedApp,
    tenantBindings,
    serviceIntegrations,
    secretRefs: selectedSecretRefs,
    selectedTenantBindingId: selectedTenantBinding?.id ?? null,
    selectedTenantBinding,
    selectedTenantServiceIntegrations,
    selectedTenantSecretRefs,
    writeFlows: {
      createApp: 'enabled',
      createTenantBinding: 'enabled',
      createServiceIntegration: 'enabled',
      createSecretRef: 'enabled',
    },
  };
}