import { asc, count, desc, eq } from 'drizzle-orm';
import { db } from './db';
import {
  DEFAULT_ECOSYSTEM_SERVICES,
  getServiceDisplayName,
  normalizeServiceName,
} from './platform-app-access-config';
import {
  platformApps,
  platformAppServiceCapabilities,
  platformAppTenantBindings,
  platformSecretRefs,
  platformServiceIntegrations,
} from './schema';

type JsonRecord = Record<string, unknown>;

const SERVICE_ORDER = new Map<string, number>(
  DEFAULT_ECOSYSTEM_SERVICES.map((service, index) => [service.serviceName, index]),
);

export interface PlatformAccessSummary {
  appCount: number;
  activeTenantBindingCount: number;
  ecosystemCapabilityCount: number;
  serviceIntegrationCount: number;
  secretRefCount: number;
  scopedKeyCount: number;
}

export interface PlatformAppItem {
  id: string;
  appCode: string;
  name: string;
  description: string | null;
  environment: string;
  status: string;
  metadata: JsonRecord;
  createdAt: string;
  updatedAt: string;
  tenantBindingCount: number;
  activeTenantBindingCount: number;
  capabilityCount: number;
  serviceIntegrationCount: number;
  secretRefCount: number;
  ecosystemAccess: 'enabled';
}

export interface PlatformAppServiceCapabilityItem {
  id: string;
  appId: string;
  serviceName: string;
  displayName: string;
  category: string;
  capabilityStatus: string;
  defaultEnabled: boolean;
  metadata: JsonRecord;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantBindingItem {
  id: string;
  appId: string;
  appCode: string;
  appName: string;
  appTenantKey: string;
  displayName: string | null;
  description: string | null;
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
  serviceDisplayName: string;
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
  serviceDisplayName: string;
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

export interface PlatformTenantServiceStatusItem {
  serviceName: string;
  displayName: string;
  capabilityStatus: string;
  status: 'available' | 'not_linked' | 'linked' | 'disabled' | 'error';
  integrationId: string | null;
  linkScope: 'app' | 'tenant' | null;
  resourceType: string | null;
  resourceId: string | null;
  integrationDisplayName: string | null;
  baseUrl: string | null;
  internalBaseUrl: string | null;
}

export interface PlatformAccessSnapshot {
  summary: PlatformAccessSummary;
  apps: PlatformAppItem[];
  selectedAppCode: string | null;
  selectedApp: PlatformAppItem | null;
  appCapabilities: PlatformAppServiceCapabilityItem[];
  tenantBindings: PlatformTenantBindingItem[];
  serviceIntegrations: PlatformServiceIntegrationItem[];
  secretRefs: PlatformSecretRefItem[];
  selectedTenantBindingId: string | null;
  selectedTenantBinding: PlatformTenantBindingItem | null;
  selectedTenantServiceIntegrations: PlatformServiceIntegrationItem[];
  selectedTenantServiceStatuses: PlatformTenantServiceStatusItem[];
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

function metadataString(metadata: JsonRecord, key: string): string | null {
  return typeof metadata[key] === 'string' && String(metadata[key]).trim()
    ? String(metadata[key]).trim()
    : null;
}

function compareServiceOrder(left: string, right: string): number {
  const leftIndex = SERVICE_ORDER.get(normalizeServiceName(left)) ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = SERVICE_ORDER.get(normalizeServiceName(right)) ?? Number.MAX_SAFE_INTEGER;
  return leftIndex - rightIndex || left.localeCompare(right);
}

function rankIntegration(integration: PlatformServiceIntegrationItem, selectedTenantBindingId: string | null): number {
  const tenantScopeScore = selectedTenantBindingId && integration.tenantBindingId === selectedTenantBindingId ? 10 : 0;
  const appScopeScore = integration.tenantBindingId === null ? 4 : 0;
  const statusScore = integration.status === 'linked'
    ? 5
    : integration.status === 'error'
      ? 3
      : integration.status === 'disabled'
        ? 1
        : 0;
  return tenantScopeScore + appScopeScore + statusScore;
}

function resolveTenantServiceStatus(
  capability: PlatformAppServiceCapabilityItem,
  integrations: PlatformServiceIntegrationItem[],
  selectedTenantBindingId: string | null,
): PlatformTenantServiceStatusItem {
  const normalizedServiceName = normalizeServiceName(capability.serviceName);
  const matchingIntegrations = integrations
    .filter((integration) => normalizeServiceName(integration.serviceName) === normalizedServiceName)
    .sort((left, right) => rankIntegration(right, selectedTenantBindingId) - rankIntegration(left, selectedTenantBindingId));

  const primaryIntegration = matchingIntegrations[0] ?? null;

  let status: PlatformTenantServiceStatusItem['status'] = selectedTenantBindingId ? 'not_linked' : 'available';
  if (capability.capabilityStatus === 'disabled') status = 'disabled';
  else if (capability.capabilityStatus === 'error') status = 'error';
  else if (primaryIntegration?.status === 'linked') status = 'linked';
  else if (primaryIntegration?.status === 'disabled') status = 'disabled';
  else if (primaryIntegration?.status === 'error') status = 'error';

  return {
    serviceName: normalizedServiceName,
    displayName: capability.displayName,
    capabilityStatus: capability.capabilityStatus,
    status,
    integrationId: primaryIntegration?.id ?? null,
    linkScope: primaryIntegration
      ? primaryIntegration.tenantBindingId === null ? 'app' : 'tenant'
      : null,
    resourceType: primaryIntegration?.resourceType ?? null,
    resourceId: primaryIntegration?.resourceId ?? null,
    integrationDisplayName: primaryIntegration?.displayName ?? null,
    baseUrl: primaryIntegration?.baseUrl ?? null,
    internalBaseUrl: primaryIntegration?.internalBaseUrl ?? null,
  };
}

export async function getPlatformAccessSummary(): Promise<PlatformAccessSummary> {
  const [appsResult, bindingsResult, capabilitiesResult, integrationsResult, secretRefsResult] = await Promise.all([
    db.select({ count: count() }).from(platformApps),
    db
      .select({ count: count() })
      .from(platformAppTenantBindings)
      .where(eq(platformAppTenantBindings.status, 'active')),
    db.select({ count: count() }).from(platformAppServiceCapabilities),
    db.select({ count: count() }).from(platformServiceIntegrations),
    db.select({ count: count() }).from(platformSecretRefs),
  ]);

  const appCount = Number(appsResult[0]?.count ?? 0);
  const activeTenantBindingCount = Number(bindingsResult[0]?.count ?? 0);
  const ecosystemCapabilityCount = Number(capabilitiesResult[0]?.count ?? 0);
  const serviceIntegrationCount = Number(integrationsResult[0]?.count ?? 0);
  const secretRefCount = Number(secretRefsResult[0]?.count ?? 0);

  return {
    appCount,
    activeTenantBindingCount,
    ecosystemCapabilityCount,
    serviceIntegrationCount,
    secretRefCount,
    scopedKeyCount: secretRefCount,
  };
}

async function listPlatformAppsRaw() {
  return db.select().from(platformApps).orderBy(desc(platformApps.createdAt), asc(platformApps.name));
}

async function listPlatformAppCapabilitiesRaw() {
  return db
    .select()
    .from(platformAppServiceCapabilities)
    .orderBy(asc(platformAppServiceCapabilities.appId), asc(platformAppServiceCapabilities.serviceName));
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
  const [summary, rawApps, rawCapabilities, rawBindings, rawIntegrations, rawSecretRefs] = await Promise.all([
    getPlatformAccessSummary(),
    listPlatformAppsRaw(),
    listPlatformAppCapabilitiesRaw(),
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

  const capabilityCountByAppId = new Map<string, number>();
  for (const capability of rawCapabilities) {
    capabilityCountByAppId.set(capability.appId, (capabilityCountByAppId.get(capability.appId) ?? 0) + 1);
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
    environment: app.environment,
    status: app.status,
    metadata: asRecord(app.metadata),
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    tenantBindingCount: bindingCountByAppId.get(app.id) ?? 0,
    activeTenantBindingCount: activeBindingCountByAppId.get(app.id) ?? 0,
    capabilityCount: capabilityCountByAppId.get(app.id) ?? 0,
    serviceIntegrationCount: integrationCountByAppId.get(app.id) ?? 0,
    secretRefCount: secretRefCountByAppId.get(app.id) ?? 0,
    ecosystemAccess: 'enabled',
  }));

  const selectedApp = apps.find((app) => app.appCode === opts?.selectedAppCode)
    ?? apps.find((app) => app.appCode === 'wapi')
    ?? apps[0]
    ?? null;

  const capabilities: PlatformAppServiceCapabilityItem[] = rawCapabilities
    .map((capability) => ({
      id: capability.id,
      appId: capability.appId,
      serviceName: normalizeServiceName(capability.serviceName),
      displayName: capability.displayName || getServiceDisplayName(capability.serviceName),
      category: capability.category,
      capabilityStatus: capability.capabilityStatus,
      defaultEnabled: capability.defaultEnabled,
      metadata: asRecord(capability.metadata),
      createdAt: capability.createdAt.toISOString(),
      updatedAt: capability.updatedAt.toISOString(),
    }))
    .sort((left, right) => compareServiceOrder(left.serviceName, right.serviceName));

  const bindings: PlatformTenantBindingItem[] = rawBindings
    .map((binding) => {
      const app = rawAppMap.get(binding.appId);
      if (!app) return null;
      const metadata = asRecord(binding.metadata);
      return {
        id: binding.id,
        appId: binding.appId,
        appCode: app.appCode,
        appName: app.name,
        appTenantKey: binding.appTenantKey,
        displayName: binding.displayName,
        description: metadataString(metadata, 'description'),
        status: binding.status,
        environment: binding.environment,
        metadata,
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
      const serviceName = normalizeServiceName(integration.serviceName);
      return {
        id: integration.id,
        appId: integration.appId,
        appCode: app.appCode,
        appName: app.name,
        tenantBindingId: integration.tenantBindingId,
        tenantBindingKey: binding?.appTenantKey ?? null,
        tenantDisplayName: binding?.displayName ?? null,
        serviceName,
        serviceDisplayName: getServiceDisplayName(serviceName),
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
    .filter((integration): integration is PlatformServiceIntegrationItem => Boolean(integration))
    .sort((left, right) => compareServiceOrder(left.serviceName, right.serviceName));

  const secretRefs: PlatformSecretRefItem[] = rawSecretRefs
    .map((secretRef) => {
      const app = rawAppMap.get(secretRef.appId);
      if (!app) return null;
      const binding = secretRef.tenantBindingId ? rawBindingMap.get(secretRef.tenantBindingId) ?? null : null;
      const serviceName = normalizeServiceName(secretRef.serviceName);
      return {
        id: secretRef.id,
        appId: secretRef.appId,
        appCode: app.appCode,
        appName: app.name,
        tenantBindingId: secretRef.tenantBindingId,
        tenantBindingKey: binding?.appTenantKey ?? null,
        tenantDisplayName: binding?.displayName ?? null,
        serviceName,
        serviceDisplayName: getServiceDisplayName(serviceName),
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
    .filter((secretRef): secretRef is PlatformSecretRefItem => Boolean(secretRef))
    .sort((left, right) => compareServiceOrder(left.serviceName, right.serviceName));

  const appCapabilities = selectedApp
    ? capabilities.filter((capability) => capability.appId === selectedApp.id)
    : [];
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

  const selectedTenantServiceStatuses = appCapabilities.map((capability) => resolveTenantServiceStatus(
    capability,
    selectedTenantServiceIntegrations,
    selectedTenantBinding?.id ?? null,
  ));

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
    appCapabilities,
    tenantBindings,
    serviceIntegrations,
    secretRefs: selectedSecretRefs,
    selectedTenantBindingId: selectedTenantBinding?.id ?? null,
    selectedTenantBinding,
    selectedTenantServiceIntegrations,
    selectedTenantServiceStatuses,
    selectedTenantSecretRefs,
    writeFlows: {
      createApp: 'enabled',
      createTenantBinding: 'enabled',
      createServiceIntegration: 'enabled',
      createSecretRef: 'enabled',
    },
  };
}