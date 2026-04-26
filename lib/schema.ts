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
