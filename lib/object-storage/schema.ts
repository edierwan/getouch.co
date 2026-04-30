import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const objectStorageTenantStatus = pgEnum('object_storage_tenant_status', [
  'active',
  'suspended',
  'pending',
]);

export const objectStorageAccessKeyStatus = pgEnum('object_storage_access_key_status', [
  'active',
  'revoked',
  'rotating',
  'expired',
]);

export const objectStorageAccessKeyPermission = pgEnum('object_storage_access_key_permission', [
  'read',
  'write',
  'read-write',
  'presign',
]);

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