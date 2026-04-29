import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/* ─── Enums ─── */
export const userRole = pgEnum('user_role', ['admin', 'user', 'pending']);
export const difySetupStatus = pgEnum('dify_setup_status', ['active', 'inactive', 'draft']);
export const difyTenantMappingStatus = pgEnum('dify_tenant_mapping_status', ['pending', 'active', 'disabled']);
export const scheduledRestartType = pgEnum('scheduled_restart_type', ['one-time', 'daily', 'weekly']);
export const objectStorageTenantStatus = pgEnum('object_storage_tenant_status', [
  'active', 'suspended', 'pending',
]);
export const objectStorageAccessKeyStatus = pgEnum('object_storage_access_key_status', [
  'active', 'revoked', 'rotating', 'expired',
]);
export const objectStorageAccessKeyPermission = pgEnum('object_storage_access_key_permission', [
  'read', 'write', 'read-write', 'presign',
]);

export const apiKeyEnvironment = pgEnum('central_api_key_environment', ['live', 'test']);
export const apiKeyStatusEnum = pgEnum('central_api_key_status', [
  'active',
  'disabled',
  'revoked',
  'rotating',
  'expired',
]);
export const apiKeyValidationSource = pgEnum('central_api_key_validation_source', [
  'central',
  'legacy_wa',
  'env',
  'manual',
  'unknown',
]);
export const apiSecretStatus = pgEnum('central_api_secret_status', ['configured', 'missing', 'unknown']);
export const chatwootTenantMappingStatus = pgEnum('chatwoot_tenant_mapping_status', ['pending', 'active', 'disabled']);

/* ─── Users (central identity master) ─── */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').default('pending').notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  phone: varchar('phone', { length: 20 }),
  phoneVerified: boolean('phone_verified').default(false).notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/* ─── Email verification tokens ─── */
export const verificationTokens = pgTable('verification_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/* ─── WhatsApp OTP tokens ─── */
export const waOtpTokens = pgTable(
  'wa_otp_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    phone: varchar('phone', { length: 20 }).notNull(),
    otp: varchar('otp', { length: 6 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('wa_otp_tokens_phone_idx').on(table.phone),
  ],
);

/* ─── Downstream app provisioning records ─── */
export const appProvisions = pgTable(
  'app_provisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    app: varchar('app', { length: 50 }).notNull(), // 'open_webui' | 'whatsapp' | …
    externalId: text('external_id'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('app_provisions_user_app_idx').on(table.userId, table.app),
  ],
);

/* ─── Dify multi-domain control plane ─── */
export const difyConnections = pgTable(
  'dify_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    label: varchar('label', { length: 160 }).notNull(),
    domain: varchar('domain', { length: 255 }).notNull(),
    environment: varchar('environment', { length: 40 }).notNull(),
    assistantName: varchar('assistant_name', { length: 160 }).notNull(),
    difyAppId: varchar('dify_app_id', { length: 120 }),
    difyAppType: varchar('dify_app_type', { length: 40 }).default('chatbot').notNull(),
    baseUrl: text('base_url').notNull(),
    consoleUrl: text('console_url'),
    apiKey: text('api_key'),
    apiKeyLabel: varchar('api_key_label', { length: 120 }),
    triggerName: varchar('trigger_name', { length: 80 }),
    routingEnabled: boolean('routing_enabled').default(true).notNull(),
    whatsappEnabled: boolean('whatsapp_enabled').default(true).notNull(),
    status: difySetupStatus('status').default('draft').notNull(),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    lastTestOk: boolean('last_test_ok'),
    lastTestStatus: integer('last_test_status'),
    lastTestMessage: text('last_test_message'),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('dify_connections_domain_environment_idx').on(table.domain, table.environment),
    index('dify_connections_status_idx').on(table.status),
  ],
);

export const difyTenantMappings = pgTable(
  'dify_tenant_mappings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().unique(),
    difyWorkspaceId: varchar('dify_workspace_id', { length: 120 }),
    difyAppId: varchar('dify_app_id', { length: 120 }),
    difyWorkflowId: varchar('dify_workflow_id', { length: 120 }),
    status: difyTenantMappingStatus('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('dify_tenant_mappings_status_idx').on(table.status),
  ],
);

/* ─── Chatwoot tenant control plane ─── */
export const chatwootTenantMappings = pgTable(
  'chatwoot_tenant_mappings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().unique(),
    chatwootAccountId: integer('chatwoot_account_id').notNull(),
    chatwootInboxId: integer('chatwoot_inbox_id'),
    status: chatwootTenantMappingStatus('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('chatwoot_tenant_mappings_account_idx').on(table.chatwootAccountId),
    index('chatwoot_tenant_mappings_status_idx').on(table.status),
  ],
);

/* ─── Scheduled server restart control plane ─── */
export const scheduledRestarts = pgTable(
  'scheduled_restarts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    targetHost: varchar('target_host', { length: 160 }).notNull(),
    targetLabel: varchar('target_label', { length: 160 }).notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    scheduleType: scheduledRestartType('schedule_type').default('daily').notNull(),
    timezone: varchar('timezone', { length: 80 }).notNull(),
    oneTimeAt: timestamp('one_time_at', { withTimezone: true }),
    dailyTime: varchar('daily_time', { length: 5 }),
    weeklyDay: integer('weekly_day'),
    weeklyTime: varchar('weekly_time', { length: 5 }),
    note: text('note'),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastAppliedAt: timestamp('last_applied_at', { withTimezone: true }),
    lastAppliedBy: varchar('last_applied_by', { length: 255 }),
    lastRemoteStatus: varchar('last_remote_status', { length: 40 }),
    lastRemoteMessage: text('last_remote_message'),
    lastRemoteSyncAt: timestamp('last_remote_sync_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('scheduled_restarts_target_host_idx').on(table.targetHost),
  ],
);

export const scheduledRestartLogs = pgTable(
  'scheduled_restart_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    restartId: uuid('restart_id').references(() => scheduledRestarts.id, { onDelete: 'cascade' }),
    targetHost: varchar('target_host', { length: 160 }).notNull(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    status: varchar('status', { length: 40 }).notNull(),
    summary: varchar('summary', { length: 255 }).notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
    actorEmail: varchar('actor_email', { length: 255 }),
    source: varchar('source', { length: 40 }).default('portal').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('scheduled_restart_logs_target_host_idx').on(table.targetHost),
    index('scheduled_restart_logs_created_at_idx').on(table.createdAt),
  ],
);

/* ─── Centralized API Key Manager ─────────────────────────────
 * Stored as hash only. Plaintext is shown ONCE at creation and
 * never persisted. Services + scopes are kept as jsonb arrays
 * to keep the foundation small; can be normalized later.
 * ─────────────────────────────────────────────────────────── */
export const apiKeys = pgTable(
  'central_api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id'),
    name: varchar('name', { length: 200 }).notNull(),
    environment: apiKeyEnvironment('environment').default('live').notNull(),
    keyPrefix: varchar('key_prefix', { length: 32 }).notNull().unique(),
    keyHash: text('key_hash').notNull(),
    status: apiKeyStatusEnum('status').default('active').notNull(),
    services: jsonb('services').$type<string[]>().default([]).notNull(),
    scopes: jsonb('scopes').$type<string[]>().default([]).notNull(),
    allowedOrigins: jsonb('allowed_origins').$type<string[]>().default([]).notNull(),
    rateLimitCount: integer('rate_limit_count'),
    rateLimitWindowSeconds: integer('rate_limit_window_seconds'),
    burstLimit: integer('burst_limit'),
    validationSource: apiKeyValidationSource('validation_source').default('central').notNull(),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdByEmail: varchar('created_by_email', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastUsedIp: varchar('last_used_ip', { length: 64 }),
    lastUsedService: varchar('last_used_service', { length: 64 }),
    rotatedFromId: uuid('rotated_from_id'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByEmail: varchar('revoked_by_email', { length: 255 }),
    // Pepper metadata — see drizzle/0007_central_api_keys_pepper_metadata.sql.
    // Records the hash algorithm + pepper version used at mint time so we can
    // rotate CENTRAL_API_KEY_PEPPER safely in future without ambiguity.
    hashAlgorithm: varchar('hash_algorithm', { length: 32 }).default('hmac-sha256').notNull(),
    hashVersion: integer('hash_version').default(1).notNull(),
    pepperVersion: integer('pepper_version').default(1).notNull(),
  },
  (table) => [
    index('central_api_keys_status_idx').on(table.status),
    index('central_api_keys_tenant_idx').on(table.tenantId),
    index('central_api_keys_created_at_idx').on(table.createdAt),
    index('central_api_keys_pepper_version_idx').on(table.pepperVersion),
  ],
);

export const apiKeyUsageLogs = pgTable(
  'central_api_key_usage_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'cascade' }),
    keyPrefix: varchar('key_prefix', { length: 32 }),
    service: varchar('service', { length: 64 }),
    route: varchar('route', { length: 255 }),
    statusCode: integer('status_code'),
    requestId: varchar('request_id', { length: 80 }),
    ipHash: varchar('ip_hash', { length: 80 }),
    userAgentHash: varchar('user_agent_hash', { length: 80 }),
    latencyMs: integer('latency_ms'),
    errorCode: varchar('error_code', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('central_api_key_usage_logs_key_idx').on(table.apiKeyId),
    index('central_api_key_usage_logs_created_at_idx').on(table.createdAt),
  ],
);

export const apiKeyAuditLogs = pgTable(
  'central_api_key_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    keyPrefix: varchar('key_prefix', { length: 32 }),
    action: varchar('action', { length: 40 }).notNull(),
    actorEmail: varchar('actor_email', { length: 255 }),
    summary: varchar('summary', { length: 255 }),
    details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('central_api_key_audit_logs_key_idx').on(table.apiKeyId),
    index('central_api_key_audit_logs_created_at_idx').on(table.createdAt),
  ],
);

export const apiSecretInventory = pgTable(
  'central_api_secret_inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceName: varchar('service_name', { length: 120 }).notNull(),
    envName: varchar('env_name', { length: 200 }).notNull(),
    secretType: varchar('secret_type', { length: 80 }),
    status: apiSecretStatus('status').default('unknown').notNull(),
    managedBy: varchar('managed_by', { length: 40 }).default('coolify').notNull(),
    notes: text('notes'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('central_api_secret_inventory_service_env_idx').on(table.serviceName, table.envName),
  ],
);

/* ─── Evolution WhatsApp Gateway (multi-tenant) ───────────
 * Control-plane metadata for the Evolution API backend.
 * Lives alongside central_* in the portal DB. Evolution's own
 * runtime state (Baileys auth, QR cache, etc.) lives inside the
 * Evolution container's own database, independent of these tables.
 * ─────────────────────────────────────────────────────────── */

export const evolutionInstanceStatus = pgEnum('evolution_instance_status', [
  'active', 'stopped', 'error', 'maintenance', 'unknown',
]);

export const evolutionSessionStatus = pgEnum('evolution_session_status', [
  'connected', 'connecting', 'disconnected', 'expired', 'error', 'qr_pending',
]);

export const evolutionWebhookStatus = pgEnum('evolution_webhook_status', [
  'active', 'paused', 'failing',
]);

export const evolutionTemplateStatus = pgEnum('evolution_template_status', [
  'draft', 'pending', 'approved', 'rejected', 'archived',
]);

export const evolutionMessageDirection = pgEnum('evolution_message_direction', [
  'inbound', 'outbound',
]);

export const evolutionMessageStatus = pgEnum('evolution_message_status', [
  'queued', 'sent', 'delivered', 'read', 'failed', 'received',
]);

export const evolutionTenantPlan = pgEnum('evolution_tenant_plan', [
  'trial', 'starter', 'pro', 'business', 'enterprise',
]);

export const evolutionTenantBindingStatus = pgEnum('evolution_tenant_binding_status', [
  'active', 'suspended', 'pending',
]);

export const evolutionInstances = pgTable(
  'evolution_instances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull().unique(),
    internalUrl: text('internal_url').notNull(),
    publicUrl: text('public_url'),
    status: evolutionInstanceStatus('status').default('unknown').notNull(),
    version: varchar('version', { length: 40 }),
    region: varchar('region', { length: 60 }),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
    lastHealthStatus: varchar('last_health_status', { length: 40 }),
    lastHealthMessage: text('last_health_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('evolution_instances_status_idx').on(table.status),
  ],
);

export const evolutionTenantBindings = pgTable(
  'evolution_tenant_bindings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().unique(),
    tenantName: varchar('tenant_name', { length: 160 }),
    tenantDomain: varchar('tenant_domain', { length: 255 }),
    instanceId: uuid('instance_id').references(() => evolutionInstances.id, { onDelete: 'set null' }),
    defaultSessionId: uuid('default_session_id'),
    plan: evolutionTenantPlan('plan').default('trial').notNull(),
    status: evolutionTenantBindingStatus('status').default('active').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('evolution_tenant_bindings_instance_idx').on(table.instanceId),
    index('evolution_tenant_bindings_status_idx').on(table.status),
  ],
);

export const evolutionSessions = pgTable(
  'evolution_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    instanceId: uuid('instance_id').references(() => evolutionInstances.id, { onDelete: 'set null' }),
    tenantId: uuid('tenant_id'),
    sessionName: varchar('session_name', { length: 120 }).notNull(),
    phoneNumber: varchar('phone_number', { length: 40 }),
    status: evolutionSessionStatus('status').default('disconnected').notNull(),
    qrStatus: varchar('qr_status', { length: 40 }),
    qrExpiresAt: timestamp('qr_expires_at', { withTimezone: true }),
    evolutionRemoteId: varchar('evolution_remote_id', { length: 160 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
    lastDisconnectedAt: timestamp('last_disconnected_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('evolution_sessions_instance_name_unique').on(table.instanceId, table.sessionName),
    index('evolution_sessions_tenant_idx').on(table.tenantId),
    index('evolution_sessions_status_idx').on(table.status),
    index('evolution_sessions_phone_idx').on(table.phoneNumber),
  ],
);

export const evolutionWebhooks = pgTable(
  'evolution_webhooks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id'),
    instanceId: uuid('instance_id').references(() => evolutionInstances.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => evolutionSessions.id, { onDelete: 'set null' }),
    label: varchar('label', { length: 120 }),
    url: text('url').notNull(),
    events: jsonb('events').$type<string[]>().default([]).notNull(),
    secretHash: text('secret_hash'),
    secretPrefix: varchar('secret_prefix', { length: 16 }),
    status: evolutionWebhookStatus('status').default('active').notNull(),
    lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
    lastDeliveryStatus: integer('last_delivery_status'),
    lastError: text('last_error'),
    deliveryCount: integer('delivery_count').default(0).notNull(),
    failureCount: integer('failure_count').default(0).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('evolution_webhooks_tenant_idx').on(table.tenantId),
    index('evolution_webhooks_status_idx').on(table.status),
  ],
);

export const evolutionTemplates = pgTable(
  'evolution_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id'),
    name: varchar('name', { length: 160 }).notNull(),
    category: varchar('category', { length: 60 }),
    language: varchar('language', { length: 20 }).default('en').notNull(),
    status: evolutionTemplateStatus('status').default('draft').notNull(),
    body: text('body').notNull(),
    variables: jsonb('variables').$type<string[]>().default([]).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdByEmail: varchar('created_by_email', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('evolution_templates_tenant_idx').on(table.tenantId),
    index('evolution_templates_status_idx').on(table.status),
  ],
);

export const evolutionMessageLogs = pgTable(
  'evolution_message_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id'),
    instanceId: uuid('instance_id').references(() => evolutionInstances.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => evolutionSessions.id, { onDelete: 'set null' }),
    direction: evolutionMessageDirection('direction').notNull(),
    toNumber: varchar('to_number', { length: 40 }),
    fromNumber: varchar('from_number', { length: 40 }),
    messageType: varchar('message_type', { length: 40 }).default('text').notNull(),
    status: evolutionMessageStatus('status').notNull(),
    providerMessageId: varchar('provider_message_id', { length: 160 }),
    preview: varchar('preview', { length: 280 }),
    errorCode: varchar('error_code', { length: 80 }),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('evolution_message_logs_tenant_idx').on(table.tenantId),
    index('evolution_message_logs_session_idx').on(table.sessionId),
    index('evolution_message_logs_created_at_idx').on(table.createdAt),
    index('evolution_message_logs_status_idx').on(table.status),
  ],
);

export const evolutionEvents = pgTable(
  'evolution_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id'),
    instanceId: uuid('instance_id').references(() => evolutionInstances.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => evolutionSessions.id, { onDelete: 'set null' }),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    severity: varchar('severity', { length: 20 }).default('info').notNull(),
    summary: varchar('summary', { length: 255 }),
    actorEmail: varchar('actor_email', { length: 255 }),
    payloadSummary: jsonb('payload_summary').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('evolution_events_created_at_idx').on(table.createdAt),
    index('evolution_events_event_type_idx').on(table.eventType),
    index('evolution_events_tenant_idx').on(table.tenantId),
  ],
);

export const evolutionSettings = pgTable('evolution_settings', {
  id: integer('id').primaryKey().default(1),
  defaultWebhookEvents: jsonb('default_webhook_events').$type<string[]>()
    .default(['message.received', 'message.sent', 'session.connected', 'session.disconnected', 'qr.updated'])
    .notNull(),
  retryMaxAttempts: integer('retry_max_attempts').default(5).notNull(),
  rateLimitPerMinute: integer('rate_limit_per_minute').default(60).notNull(),
  sessionLimitPerTenant: integer('session_limit_per_tenant').default(5).notNull(),
  tenantIsolationStrict: boolean('tenant_isolation_strict').default(true).notNull(),
  maintenanceMode: boolean('maintenance_mode').default(false).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedByEmail: varchar('updated_by_email', { length: 255 }),
});

/* ─── Object Storage Gateway control plane ───────────────────
 * Portal-side metadata only. Real bucket/object data lives in
 * SeaweedFS (/srv/archive/seaweedfs on host). Secrets are NEVER
 * persisted here — only key prefixes and an optional secret hash.
 * ─────────────────────────────────────────────────────────── */
export const objectStorageTenantMappings = pgTable(
  'object_storage_tenant_mappings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 }).notNull(),
    tenantName: varchar('tenant_name', { length: 255 }),
    bucket: varchar('bucket', { length: 120 }).notNull(),
    prefix: varchar('prefix', { length: 255 }).notNull(),
    services: jsonb('services').$type<string[]>().default([]).notNull(),
    quotaBytes: bigint('quota_bytes', { mode: 'number' }),
    policy: varchar('policy', { length: 40 }).default('read-write').notNull(),
    retentionDays: integer('retention_days'),
    status: objectStorageTenantStatus('status').default('active').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('object_storage_tenant_unique').on(table.tenantId, table.bucket, table.prefix),
    index('object_storage_tenant_status_idx').on(table.status),
    index('object_storage_tenant_bucket_idx').on(table.bucket),
  ],
);

export const objectStorageAccessKeys = pgTable(
  'object_storage_access_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    label: varchar('label', { length: 160 }).notNull(),
    tenantId: varchar('tenant_id', { length: 120 }),
    bucket: varchar('bucket', { length: 120 }),
    prefix: varchar('prefix', { length: 255 }),
    permission: objectStorageAccessKeyPermission('permission').default('read-write').notNull(),
    keyPrefix: varchar('key_prefix', { length: 40 }).notNull(),
    secretHash: text('secret_hash'),
    service: varchar('service', { length: 60 }),
    ipAllowlist: jsonb('ip_allowlist').$type<string[]>().default([]).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    status: objectStorageAccessKeyStatus('status').default('active').notNull(),
    createdBy: varchar('created_by', { length: 255 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('object_storage_access_keys_status_idx').on(table.status),
    index('object_storage_access_keys_tenant_idx').on(table.tenantId),
  ],
);

export const objectStorageActivity = pgTable(
  'object_storage_activity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    tenantId: varchar('tenant_id', { length: 120 }),
    bucket: varchar('bucket', { length: 120 }),
    objectKey: text('object_key'),
    actor: varchar('actor', { length: 255 }),
    actorKeyPrefix: varchar('actor_key_prefix', { length: 40 }),
    sourceIp: varchar('source_ip', { length: 64 }),
    status: varchar('status', { length: 40 }).default('ok').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('object_storage_activity_event_idx').on(table.eventType),
    index('object_storage_activity_tenant_idx').on(table.tenantId),
    index('object_storage_activity_created_idx').on(table.createdAt),
  ],
);
