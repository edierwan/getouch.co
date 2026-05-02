import { and, eq } from 'drizzle-orm';
import { db, getDb } from './db';
import {
  APP_ENVIRONMENT_VALUES,
  APP_STATUS_VALUES,
  DEFAULT_ECOSYSTEM_SERVICES,
  SECRET_PROVIDER_VALUES,
  SECRET_SCOPE_VALUES,
  SECRET_STATUS_VALUES,
  SERVICE_LINK_STATUS_VALUES,
  TENANT_ENV_VALUES,
  TENANT_STATUS_VALUES,
  normalizeServiceName,
  slugifyIdentifier,
} from './platform-app-access-config';
import {
  platformApps,
  platformAppServiceCapabilities,
  platformAppTenantBindings,
  platformSecretRefs,
  platformServiceIntegrations,
} from './schema';

type JsonRecord = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVICE_NAME_VALUES: string[] = DEFAULT_ECOSYSTEM_SERVICES.map((service) => service.serviceName);

export class PlatformRegistryError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status: number, code: string, message: string): never {
  throw new PlatformRegistryError(status, code, message);
}

function optionalString(value: unknown, field: string, maxLength = 500): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') fail(400, `${field}_invalid`, `${field} must be a string`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) fail(400, `${field}_too_long`, `${field} exceeds ${maxLength} characters`);
  return normalized;
}

function requiredString(value: unknown, field: string, maxLength = 500): string {
  const normalized = optionalString(value, field, maxLength);
  if (!normalized) fail(400, `${field}_required`, `${field} is required`);
  return normalized;
}

function optionalUuid(value: unknown, field: string): string | null {
  const normalized = optionalString(value, field, 64);
  if (!normalized) return null;
  if (!UUID_RE.test(normalized)) fail(400, `${field}_invalid`, `${field} must be a UUID`);
  return normalized;
}

function parseMetadata(value: unknown): JsonRecord {
  if (value == null || value === '') return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        fail(400, 'metadata_invalid', 'metadata must be a JSON object');
      }
      return parsed as JsonRecord;
    } catch {
      fail(400, 'metadata_invalid', 'metadata must be valid JSON');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(400, 'metadata_invalid', 'metadata must be a JSON object');
  }
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function parseEnum<T extends readonly string[]>(value: unknown, options: T, field: string): T[number] {
  const normalized = requiredString(value, field, 80);
  if (!options.includes(normalized as T[number])) {
    fail(400, `${field}_invalid`, `${field} must be one of ${options.join(', ')}`);
  }
  return normalized as T[number];
}

function parseServiceName(value: unknown, field = 'serviceName'): string {
  const normalized = normalizeServiceName(requiredString(value, field, 120));
  if (!SERVICE_NAME_VALUES.includes(normalized)) {
    fail(400, `${field}_invalid`, `${field} must be one of ${SERVICE_NAME_VALUES.join(', ')}`);
  }
  return normalized;
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505');
}

function cloneMetadata(value: unknown): JsonRecord {
  return parseMetadata(value ?? {});
}

function mergeAppMetadata(metadata: JsonRecord, previousMetadata?: JsonRecord): JsonRecord {
  const next = { ...metadata };
  next.ecosystem_access = 'enabled';
  const previousCreatedFrom = typeof previousMetadata?.created_from === 'string'
    ? previousMetadata.created_from
    : null;
  next.created_from = typeof next.created_from === 'string' && next.created_from.trim()
    ? next.created_from.trim()
    : previousCreatedFrom || 'app_access_control';
  return next;
}

function mergeTenantMetadata(metadata: JsonRecord, description: string | null | undefined): JsonRecord {
  const next = { ...metadata };
  if (description === undefined) return next;
  if (description) next.description = description;
  else delete next.description;
  return next;
}

function buildUniqueSlug(baseSlug: string, existingValues: Set<string>): string {
  if (!existingValues.has(baseSlug)) return baseSlug;
  let suffix = 2;
  while (existingValues.has(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}

async function generateUniqueAppCode(name: string): Promise<string> {
  const rows = await db.select({ appCode: platformApps.appCode }).from(platformApps);
  return buildUniqueSlug(slugifyIdentifier(name), new Set(rows.map((row) => row.appCode)));
}

async function generateUniqueTenantKey(appId: string, name: string): Promise<string> {
  const rows = await db
    .select({ appTenantKey: platformAppTenantBindings.appTenantKey })
    .from(platformAppTenantBindings)
    .where(eq(platformAppTenantBindings.appId, appId));

  return buildUniqueSlug(slugifyIdentifier(name), new Set(rows.map((row) => row.appTenantKey)));
}

function defaultCapabilityValues(appId: string) {
  return DEFAULT_ECOSYSTEM_SERVICES.map((service) => ({
    appId,
    serviceName: service.serviceName,
    displayName: service.displayName,
    category: 'ecosystem',
    capabilityStatus: 'available',
    defaultEnabled: true,
    metadata: {},
  }));
}

async function getPlatformAppRow(id: string) {
  const rows = await db.select().from(platformApps).where(eq(platformApps.id, id)).limit(1);
  return rows[0] ?? null;
}

async function getPlatformAppCapabilityRow(appId: string, serviceName: string) {
  const rows = await db
    .select()
    .from(platformAppServiceCapabilities)
    .where(and(
      eq(platformAppServiceCapabilities.appId, appId),
      eq(platformAppServiceCapabilities.serviceName, normalizeServiceName(serviceName)),
    ))
    .limit(1);
  return rows[0] ?? null;
}

async function getPlatformTenantBindingRow(id: string) {
  const rows = await db.select().from(platformAppTenantBindings).where(eq(platformAppTenantBindings.id, id)).limit(1);
  return rows[0] ?? null;
}

async function getPlatformServiceIntegrationRow(id: string) {
  const rows = await db.select().from(platformServiceIntegrations).where(eq(platformServiceIntegrations.id, id)).limit(1);
  return rows[0] ?? null;
}

async function getPlatformSecretRefRow(id: string) {
  const rows = await db.select().from(platformSecretRefs).where(eq(platformSecretRefs.id, id)).limit(1);
  return rows[0] ?? null;
}

async function requireApp(appId: string) {
  const app = await getPlatformAppRow(appId);
  if (!app) fail(404, 'app_not_found', 'App not found');
  return app;
}

async function requireAppCapability(appId: string, serviceName: string) {
  const capability = await getPlatformAppCapabilityRow(appId, serviceName);
  if (!capability) fail(400, 'service_capability_missing', 'Selected app does not expose that ecosystem service');
  return capability;
}

async function requireTenantBinding(bindingId: string) {
  const binding = await getPlatformTenantBindingRow(bindingId);
  if (!binding) fail(404, 'tenant_binding_not_found', 'Tenant binding not found');
  return binding;
}

function normalizeAppValues(input: Record<string, unknown>, partial = false, previousMetadata?: JsonRecord) {
  const values: Record<string, unknown> = {};

  if (!partial || 'name' in input) values.name = requiredString(input.name, 'name', 180);
  if (!partial || 'description' in input) values.description = optionalString(input.description, 'description', 1000);
  if (!partial || 'environment' in input) {
    values.environment = parseEnum(input.environment ?? 'production', APP_ENVIRONMENT_VALUES, 'environment');
  }
  if (!partial || 'status' in input) {
    values.status = parseEnum(input.status ?? 'active', APP_STATUS_VALUES, 'status');
  }
  if (!partial || 'metadata' in input) {
    values.metadata = mergeAppMetadata(parseMetadata(input.metadata), previousMetadata);
  }

  return values;
}

export async function createPlatformApp(input: Record<string, unknown>) {
  const values = normalizeAppValues(input, false, {});
  const appCode = await generateUniqueAppCode(values.name as string);

  try {
    const created = await getDb().transaction(async (tx) => {
      const rows = await tx.insert(platformApps).values({
        appCode,
        name: values.name as string,
        description: values.description as string | null,
        environment: values.environment as string,
        authModel: 'app_owned',
        defaultChannel: null,
        status: 'active',
        metadata: values.metadata as JsonRecord,
      }).returning();

      const app = rows[0];
      if (!app) fail(500, 'app_create_failed', 'App could not be created');

      await tx.insert(platformAppServiceCapabilities)
        .values(defaultCapabilityValues(app.id))
        .onConflictDoNothing();

      return app;
    });

    return created;
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'app_code_conflict', 'A registry app with that generated code already exists');
    throw err;
  }
}

export async function updatePlatformApp(id: string, input: Record<string, unknown>) {
  const app = await requireApp(id);
  const values = normalizeAppValues(input, true, cloneMetadata(app.metadata));
  if (Object.keys(values).length === 0) fail(400, 'no_changes', 'No app changes were provided');

  const rows = await db.update(platformApps).set({
    ...values,
    updatedAt: new Date(),
  }).where(eq(platformApps.id, id)).returning();
  return rows[0] ?? null;
}

export async function deletePlatformApp(id: string, opts: { appCodeConfirmation?: string | null }) {
  const app = await requireApp(id);
  const confirmation = opts.appCodeConfirmation?.trim();
  if (!confirmation || confirmation !== app.appCode) {
    fail(400, 'app_code_confirmation_invalid', 'Type the exact app code to delete this registry app');
  }

  const rows = await db.delete(platformApps).where(eq(platformApps.id, id)).returning();
  return rows[0] ?? null;
}

function normalizeTenantBindingValues(
  input: Record<string, unknown>,
  partial = false,
  previousMetadata?: JsonRecord,
) {
  const values: Record<string, unknown> = {};

  const description = (!partial || 'description' in input)
    ? optionalString(input.description, 'description', 1000)
    : undefined;
  const metadata = (!partial || 'metadata' in input)
    ? parseMetadata(input.metadata)
    : undefined;

  if (!partial || 'name' in input) values.displayName = requiredString(input.name, 'name', 180);
  if (!partial || 'environment' in input) {
    values.environment = parseEnum(input.environment ?? 'production', TENANT_ENV_VALUES, 'environment');
  }
  if (!partial || 'status' in input) {
    values.status = parseEnum(input.status ?? 'active', TENANT_STATUS_VALUES, 'status');
  }
  if (metadata !== undefined || description !== undefined) {
    values.metadata = mergeTenantMetadata(metadata ?? cloneMetadata(previousMetadata), description);
  }

  return values;
}

export async function createPlatformTenantBinding(input: Record<string, unknown>) {
  const appId = optionalUuid(input.appId, 'appId');
  if (!appId) fail(400, 'appId_required', 'appId is required');
  await requireApp(appId);

  const values = normalizeTenantBindingValues(input, false, {});
  const appTenantKey = await generateUniqueTenantKey(appId, values.displayName as string);

  try {
    const rows = await db.insert(platformAppTenantBindings).values({
      appId,
      appTenantKey,
      displayName: values.displayName as string,
      environment: values.environment as string,
      status: 'active',
      metadata: values.metadata as JsonRecord,
    }).returning();
    return rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'tenant_binding_conflict', 'This tenant key is already registered for the selected app');
    throw err;
  }
}

export async function updatePlatformTenantBinding(id: string, input: Record<string, unknown>) {
  const binding = await requireTenantBinding(id);
  const values = normalizeTenantBindingValues(input, true, cloneMetadata(binding.metadata));
  if (Object.keys(values).length === 0) fail(400, 'no_changes', 'No tenant binding changes were provided');

  try {
    const rows = await db.update(platformAppTenantBindings).set({
      ...values,
      updatedAt: new Date(),
    }).where(eq(platformAppTenantBindings.id, id)).returning();
    return rows[0] ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'tenant_binding_conflict', 'This tenant key is already registered for the selected app');
    throw err;
  }
}

export async function deletePlatformTenantBinding(id: string) {
  await requireTenantBinding(id);
  const rows = await db.delete(platformAppTenantBindings).where(eq(platformAppTenantBindings.id, id)).returning();
  return rows[0] ?? null;
}

function normalizeServiceIntegrationValues(input: Record<string, unknown>, partial = false) {
  const values: Record<string, unknown> = {};

  if (!partial || 'serviceName' in input) values.serviceName = parseServiceName(input.serviceName, 'serviceName');
  if (!partial || 'resourceType' in input) values.resourceType = requiredString(input.resourceType, 'resourceType', 160);
  if (!partial || 'resourceId' in input) values.resourceId = requiredString(input.resourceId, 'resourceId', 255);
  if (!partial || 'displayName' in input) values.displayName = optionalString(input.displayName, 'displayName', 180);
  if (!partial || 'baseUrl' in input) values.baseUrl = optionalString(input.baseUrl, 'baseUrl', 2000);
  if (!partial || 'internalBaseUrl' in input) values.internalBaseUrl = optionalString(input.internalBaseUrl, 'internalBaseUrl', 2000);
  if (!partial || 'status' in input) values.status = parseEnum(input.status ?? 'linked', SERVICE_LINK_STATUS_VALUES, 'status');
  if (!partial || 'metadata' in input) values.metadata = parseMetadata(input.metadata);

  return values;
}

function normalizeSecretRefValues(input: Record<string, unknown>, partial = false) {
  const values: Record<string, unknown> = {};

  if (!partial || 'serviceName' in input) values.serviceName = parseServiceName(input.serviceName, 'serviceName');
  if (!partial || 'refProvider' in input) values.refProvider = parseEnum(input.refProvider ?? 'infisical', SECRET_PROVIDER_VALUES, 'refProvider');
  if (!partial || 'refPath' in input) values.refPath = requiredString(input.refPath, 'refPath', 400);
  if (!partial || 'refKey' in input) values.refKey = optionalString(input.refKey, 'refKey', 200);
  if (!partial || 'scope' in input) values.scope = parseEnum(input.scope ?? 'app', SECRET_SCOPE_VALUES, 'scope');
  if (!partial || 'status' in input) values.status = parseEnum(input.status ?? 'active', SECRET_STATUS_VALUES, 'status');
  if (!partial || 'metadata' in input) values.metadata = parseMetadata(input.metadata);

  return values;
}

async function resolveTenantBindingForApp(appId: string, bindingId: string | null) {
  if (!bindingId) return null;
  const binding = await requireTenantBinding(bindingId);
  if (binding.appId !== appId) {
    fail(400, 'tenant_binding_app_mismatch', 'Selected tenant binding does not belong to the selected app');
  }
  return binding;
}

export async function createPlatformServiceIntegration(input: Record<string, unknown>) {
  const appId = optionalUuid(input.appId, 'appId');
  if (!appId) fail(400, 'appId_required', 'appId is required');
  await requireApp(appId);
  const tenantBindingId = optionalUuid(input.tenantBindingId, 'tenantBindingId');
  await resolveTenantBindingForApp(appId, tenantBindingId);

  const values = normalizeServiceIntegrationValues(input);
  await requireAppCapability(appId, values.serviceName as string);

  try {
    const rows = await db.insert(platformServiceIntegrations).values({
      appId,
      tenantBindingId,
      serviceName: values.serviceName as string,
      resourceType: values.resourceType as string,
      resourceId: values.resourceId as string,
      displayName: values.displayName as string | null,
      baseUrl: values.baseUrl as string | null,
      internalBaseUrl: values.internalBaseUrl as string | null,
      status: values.status as string,
      metadata: values.metadata as JsonRecord,
    }).returning();
    return rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'service_integration_conflict', 'This service link is already registered');
    throw err;
  }
}

export async function updatePlatformServiceIntegration(id: string, input: Record<string, unknown>) {
  const integration = await getPlatformServiceIntegrationRow(id);
  if (!integration) fail(404, 'service_integration_not_found', 'Service link not found');

  const values = normalizeServiceIntegrationValues(input, true);
  let tenantBindingId = integration.tenantBindingId;
  if ('tenantBindingId' in input) {
    tenantBindingId = optionalUuid(input.tenantBindingId, 'tenantBindingId');
    await resolveTenantBindingForApp(integration.appId, tenantBindingId);
    values.tenantBindingId = tenantBindingId;
  }

  const effectiveServiceName = typeof values.serviceName === 'string'
    ? values.serviceName
    : normalizeServiceName(integration.serviceName);
  await requireAppCapability(integration.appId, effectiveServiceName);
  if (effectiveServiceName !== integration.serviceName) values.serviceName = effectiveServiceName;

  if (Object.keys(values).length === 0) fail(400, 'no_changes', 'No service link changes were provided');

  try {
    const rows = await db.update(platformServiceIntegrations).set({
      ...values,
      updatedAt: new Date(),
    }).where(eq(platformServiceIntegrations.id, id)).returning();
    return rows[0] ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'service_integration_conflict', 'This service link is already registered');
    throw err;
  }
}

export async function deletePlatformServiceIntegration(id: string) {
  const integration = await getPlatformServiceIntegrationRow(id);
  if (!integration) fail(404, 'service_integration_not_found', 'Service link not found');
  const rows = await db.delete(platformServiceIntegrations).where(eq(platformServiceIntegrations.id, id)).returning();
  return rows[0] ?? null;
}

export async function createPlatformSecretRef(input: Record<string, unknown>) {
  const appId = optionalUuid(input.appId, 'appId');
  if (!appId) fail(400, 'appId_required', 'appId is required');
  await requireApp(appId);
  const tenantBindingId = optionalUuid(input.tenantBindingId, 'tenantBindingId');
  await resolveTenantBindingForApp(appId, tenantBindingId);

  const values = normalizeSecretRefValues(input);
  await requireAppCapability(appId, values.serviceName as string);

  try {
    const rows = await db.insert(platformSecretRefs).values({
      appId,
      tenantBindingId,
      serviceName: values.serviceName as string,
      refProvider: values.refProvider as string,
      refPath: values.refPath as string,
      refKey: values.refKey as string | null,
      scope: values.scope as string,
      status: values.status as string,
      metadata: values.metadata as JsonRecord,
    }).returning();
    return rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'secret_ref_conflict', 'This secret reference is already registered');
    throw err;
  }
}

export async function updatePlatformSecretRef(id: string, input: Record<string, unknown>) {
  const secretRef = await getPlatformSecretRefRow(id);
  if (!secretRef) fail(404, 'secret_ref_not_found', 'Secret reference not found');

  const values = normalizeSecretRefValues(input, true);
  let tenantBindingId = secretRef.tenantBindingId;
  if ('tenantBindingId' in input) {
    tenantBindingId = optionalUuid(input.tenantBindingId, 'tenantBindingId');
    await resolveTenantBindingForApp(secretRef.appId, tenantBindingId);
    values.tenantBindingId = tenantBindingId;
  }

  const effectiveServiceName = typeof values.serviceName === 'string'
    ? values.serviceName
    : normalizeServiceName(secretRef.serviceName);
  await requireAppCapability(secretRef.appId, effectiveServiceName);
  if (effectiveServiceName !== secretRef.serviceName) values.serviceName = effectiveServiceName;

  if (Object.keys(values).length === 0) fail(400, 'no_changes', 'No secret reference changes were provided');

  try {
    const rows = await db.update(platformSecretRefs).set({
      ...values,
      updatedAt: new Date(),
    }).where(eq(platformSecretRefs.id, id)).returning();
    return rows[0] ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'secret_ref_conflict', 'This secret reference is already registered');
    throw err;
  }
}

export async function deletePlatformSecretRef(id: string) {
  const secretRef = await getPlatformSecretRefRow(id);
  if (!secretRef) fail(404, 'secret_ref_not_found', 'Secret reference not found');
  const rows = await db.delete(platformSecretRefs).where(eq(platformSecretRefs.id, id)).returning();
  return rows[0] ?? null;
}

export async function disablePlatformApp(id: string) {
  return updatePlatformApp(id, { status: 'disabled' });
}

export async function disablePlatformTenantBinding(id: string) {
  return updatePlatformTenantBinding(id, { status: 'disabled' });
}

export async function disablePlatformServiceIntegration(id: string) {
  return updatePlatformServiceIntegration(id, { status: 'disabled' });
}

export async function disablePlatformSecretRef(id: string) {
  return updatePlatformSecretRef(id, { status: 'disabled' });
}