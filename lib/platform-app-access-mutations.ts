import { and, eq } from 'drizzle-orm';
import { db } from './db';
import {
  platformApps,
  platformAppTenantBindings,
  platformSecretRefs,
  platformServiceIntegrations,
} from './schema';

type JsonRecord = Record<string, unknown>;

const APP_AUTH_MODE_VALUES = ['app_owned', 'platform_sso', 'service_only'] as const;
const APP_DEFAULT_CHANNEL_VALUES = ['whatsapp', 'web', 'voice', 'internal', 'none'] as const;
const APP_STATUS_VALUES = ['active', 'planned', 'disabled'] as const;
const TENANT_ENV_VALUES = ['production', 'staging', 'sandbox', 'development'] as const;
const TENANT_STATUS_VALUES = ['active', 'sandbox', 'disabled'] as const;
const SERVICE_NAME_VALUES = ['evolution', 'dify', 'qdrant', 'chatwoot', 'litellm', 'langfuse', 'vllm', 'webhook', 'other'] as const;
const SERVICE_STATUS_VALUES = ['linked', 'planned', 'disabled', 'error'] as const;
const SECRET_PROVIDER_VALUES = ['infisical', 'coolify_env', 'manual_ref'] as const;
const SECRET_SCOPE_VALUES = ['platform', 'app', 'tenant', 'service'] as const;
const SECRET_STATUS_VALUES = ['active', 'planned', 'disabled'] as const;

const APP_CODE_RE = /^[a-z0-9_-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function parseOptionalEnum<T extends readonly string[]>(value: unknown, options: T, field: string): T[number] | null {
  const normalized = optionalString(value, field, 80);
  if (!normalized) return null;
  if (!options.includes(normalized as T[number])) {
    fail(400, `${field}_invalid`, `${field} must be one of ${options.join(', ')}`);
  }
  return normalized as T[number];
}

function parseAppCode(value: unknown): string {
  const appCode = requiredString(value, 'app_code', 120);
  if (!APP_CODE_RE.test(appCode)) {
    fail(400, 'app_code_invalid', 'app_code must use lowercase letters, numbers, underscore, or hyphen only');
  }
  return appCode;
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505');
}

async function getPlatformAppRow(id: string) {
  const rows = await db.select().from(platformApps).where(eq(platformApps.id, id)).limit(1);
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

async function requireTenantBinding(bindingId: string) {
  const binding = await getPlatformTenantBindingRow(bindingId);
  if (!binding) fail(404, 'tenant_binding_not_found', 'Tenant binding not found');
  return binding;
}

function normalizeAppValues(input: Record<string, unknown>, partial = false) {
  const values: Record<string, unknown> = {};

  if (!partial || 'name' in input) values.name = requiredString(input.name, 'name', 180);
  if (!partial || 'description' in input) values.description = optionalString(input.description, 'description', 1000);
  if (!partial || 'authModel' in input) values.authModel = parseEnum(input.authModel, APP_AUTH_MODE_VALUES, 'authModel');
  if (!partial || 'defaultChannel' in input) {
    const channel = parseEnum(input.defaultChannel ?? 'none', APP_DEFAULT_CHANNEL_VALUES, 'defaultChannel');
    values.defaultChannel = channel === 'none' ? null : channel;
  }
  if (!partial || 'status' in input) values.status = parseEnum(input.status, APP_STATUS_VALUES, 'status');
  if (!partial || 'metadata' in input) values.metadata = parseMetadata(input.metadata);

  return values;
}

export async function createPlatformApp(input: Record<string, unknown>) {
  const appCode = parseAppCode(input.appCode);
  const values = normalizeAppValues(input);

  try {
    const rows = await db.insert(platformApps).values({
      appCode,
      name: values.name as string,
      description: values.description as string | null,
      authModel: values.authModel as string,
      defaultChannel: values.defaultChannel as string | null,
      status: values.status as string,
      metadata: values.metadata as JsonRecord,
    }).returning();
    return rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'app_code_conflict', 'app_code is already registered');
    throw err;
  }
}

export async function updatePlatformApp(id: string, input: Record<string, unknown>) {
  await requireApp(id);
  const values = normalizeAppValues(input, true);
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

function normalizeTenantBindingValues(input: Record<string, unknown>, partial = false) {
  const values: Record<string, unknown> = {};

  if (!partial || 'appTenantKey' in input) values.appTenantKey = requiredString(input.appTenantKey, 'appTenantKey', 160);
  if (!partial || 'displayName' in input) values.displayName = optionalString(input.displayName, 'displayName', 180);
  if (!partial || 'environment' in input) values.environment = parseEnum(input.environment, TENANT_ENV_VALUES, 'environment');
  if (!partial || 'status' in input) values.status = parseEnum(input.status, TENANT_STATUS_VALUES, 'status');
  if (!partial || 'metadata' in input) values.metadata = parseMetadata(input.metadata);

  return values;
}

export async function createPlatformTenantBinding(input: Record<string, unknown>) {
  const appId = optionalUuid(input.appId, 'appId');
  if (!appId) fail(400, 'appId_required', 'appId is required');
  await requireApp(appId);
  const values = normalizeTenantBindingValues(input);

  try {
    const rows = await db.insert(platformAppTenantBindings).values({
      appId,
      appTenantKey: values.appTenantKey as string,
      displayName: values.displayName as string | null,
      environment: values.environment as string,
      status: values.status as string,
      metadata: values.metadata as JsonRecord,
    }).returning();
    return rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'tenant_binding_conflict', 'This tenant key is already registered for the selected app');
    throw err;
  }
}

export async function updatePlatformTenantBinding(id: string, input: Record<string, unknown>) {
  await requireTenantBinding(id);
  const values = normalizeTenantBindingValues(input, true);
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

  if (!partial || 'serviceName' in input) values.serviceName = parseEnum(input.serviceName, SERVICE_NAME_VALUES, 'serviceName');
  if (!partial || 'resourceType' in input) values.resourceType = requiredString(input.resourceType, 'resourceType', 160);
  if (!partial || 'resourceId' in input) values.resourceId = requiredString(input.resourceId, 'resourceId', 255);
  if (!partial || 'displayName' in input) values.displayName = optionalString(input.displayName, 'displayName', 180);
  if (!partial || 'baseUrl' in input) values.baseUrl = optionalString(input.baseUrl, 'baseUrl', 2000);
  if (!partial || 'internalBaseUrl' in input) values.internalBaseUrl = optionalString(input.internalBaseUrl, 'internalBaseUrl', 2000);
  if (!partial || 'status' in input) values.status = parseEnum(input.status, SERVICE_STATUS_VALUES, 'status');
  if (!partial || 'metadata' in input) values.metadata = parseMetadata(input.metadata);

  return values;
}

function normalizeSecretRefValues(input: Record<string, unknown>, partial = false) {
  const values: Record<string, unknown> = {};

  if (!partial || 'serviceName' in input) values.serviceName = requiredString(input.serviceName, 'serviceName', 120);
  if (!partial || 'refProvider' in input) values.refProvider = parseEnum(input.refProvider, SECRET_PROVIDER_VALUES, 'refProvider');
  if (!partial || 'refPath' in input) values.refPath = requiredString(input.refPath, 'refPath', 400);
  if (!partial || 'refKey' in input) values.refKey = optionalString(input.refKey, 'refKey', 200);
  if (!partial || 'scope' in input) values.scope = parseEnum(input.scope, SECRET_SCOPE_VALUES, 'scope');
  if (!partial || 'status' in input) values.status = parseEnum(input.status, SECRET_STATUS_VALUES, 'status');
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
    if (isUniqueViolation(err)) fail(409, 'service_integration_conflict', 'This service integration is already registered');
    throw err;
  }
}

export async function updatePlatformServiceIntegration(id: string, input: Record<string, unknown>) {
  const integration = await getPlatformServiceIntegrationRow(id);
  if (!integration) fail(404, 'service_integration_not_found', 'Service integration not found');
  const values = normalizeServiceIntegrationValues(input, true);
  let tenantBindingId = integration.tenantBindingId;
  if ('tenantBindingId' in input) {
    tenantBindingId = optionalUuid(input.tenantBindingId, 'tenantBindingId');
    await resolveTenantBindingForApp(integration.appId, tenantBindingId);
    values.tenantBindingId = tenantBindingId;
  }
  if (Object.keys(values).length === 0) fail(400, 'no_changes', 'No service integration changes were provided');

  try {
    const rows = await db.update(platformServiceIntegrations).set({
      ...values,
      updatedAt: new Date(),
    }).where(eq(platformServiceIntegrations.id, id)).returning();
    return rows[0] ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'service_integration_conflict', 'This service integration is already registered');
    throw err;
  }
}

export async function deletePlatformServiceIntegration(id: string) {
  const integration = await getPlatformServiceIntegrationRow(id);
  if (!integration) fail(404, 'service_integration_not_found', 'Service integration not found');
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