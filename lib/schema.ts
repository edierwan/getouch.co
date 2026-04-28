import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/* ─── Enums ─── */
export const userRole = pgEnum('user_role', ['admin', 'user', 'pending']);
export const difySetupStatus = pgEnum('dify_setup_status', ['active', 'inactive', 'draft']);
export const scheduledRestartType = pgEnum('scheduled_restart_type', ['one-time', 'daily', 'weekly']);
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
