import postgres from 'postgres';

const BAILEYS_DB_NAME = process.env.BAILEYS_DB_NAME || 'baileys';

const REQUIRED_TABLES = [
  'sessions',
  'tenants',
  'webhooks',
  'templates',
  'messages',
  'events',
  'api_key_cache',
  'send_log',
] as const;

const REQUIRED_INDEXES = [
  'idx_sessions_tenant',
  'idx_sessions_status',
  'idx_webhooks_tenant',
  'idx_webhooks_session',
  'idx_messages_tenant_created',
  'idx_messages_session',
  'idx_messages_status',
  'idx_events_created',
  'idx_events_tenant_created',
  'idx_api_key_cache_prefix',
  'idx_send_log_created',
] as const;

type DbUrlSource = 'env' | 'derived' | 'missing';

let cachedUrl: { url: string | null; source: DbUrlSource } | null = null;
let cachedSql: postgres.Sql | null = null;

function resolveBaileysDbUrl() {
  if (cachedUrl) return cachedUrl;

  const direct = process.env.BAILEYS_DATABASE_URL?.trim();
  if (direct) {
    cachedUrl = { url: direct, source: 'env' };
    return cachedUrl;
  }

  const main = process.env.DATABASE_URL?.trim();
  if (!main) {
    cachedUrl = { url: null, source: 'missing' };
    return cachedUrl;
  }

  try {
    const parsed = new URL(main);
    parsed.pathname = `/${BAILEYS_DB_NAME}`;
    cachedUrl = { url: parsed.toString(), source: 'derived' };
  } catch {
    cachedUrl = { url: null, source: 'missing' };
  }

  return cachedUrl;
}

function getBaileysSql() {
  const resolved = resolveBaileysDbUrl();
  if (!resolved.url) return null;

  if (!cachedSql) {
    cachedSql = postgres(resolved.url, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 5,
    });
  }

  return cachedSql;
}

function errMessage(err: unknown) {
  return err instanceof Error ? err.message : 'unknown_error';
}

export interface BaileysDbStatus {
  configured: boolean;
  connected: boolean;
  database: string;
  urlSource: DbUrlSource;
  schemaApplied: boolean;
  tableCount: number;
  tables: string[];
  missingTables: string[];
  indexes: string[];
  missingIndexes: string[];
  constraints: Array<{ tableName: string; constraintName: string; constraintType: string }>;
  defaultTenantPresent: boolean;
  error: string | null;
}

export interface BaileysDbTenant {
  tenantId: string;
  displayName: string | null;
  status: string;
  maxSessions: number;
  messageRate: number;
  webhookEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BaileysDbSession {
  id: string;
  tenantId: string | null;
  phone: string | null;
  purpose: string;
  status: string;
  notes: string | null;
  lastConnectedAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BaileysDbWebhook {
  id: string;
  tenantId: string | null;
  sessionId: string | null;
  label: string | null;
  url: string;
  events: string[];
  secretPrefix: string | null;
  status: string;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  deliveryCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BaileysDbTemplate {
  id: string;
  tenantId: string | null;
  name: string;
  language: string;
  status: string;
  body: string;
  variables: string[];
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BaileysDbMessage {
  id: string;
  tenantId: string | null;
  sessionId: string | null;
  direction: string;
  toNumber: string | null;
  fromNumber: string | null;
  messageType: string;
  status: string;
  preview: string | null;
  errorCode: string | null;
  createdAt: string;
}

export interface BaileysDbEvent {
  id: string;
  tenantId: string | null;
  sessionId: string | null;
  eventType: string;
  level: string;
  detail: string | null;
  createdAt: string;
}

export interface BaileysDbSendLog {
  id: string;
  tenantId: string | null;
  sessionId: string | null;
  apiKeyPrefix: string | null;
  toNumber: string | null;
  status: string;
  detail: string | null;
  createdAt: string;
}

export interface BaileysDbCounts {
  tenants: number;
  sessions: number;
  webhooks: number;
  templates: number;
  messages: number;
  events: number;
  sendLogs: number;
  messages24h: number;
}

export interface BaileysDbPortalData {
  status: BaileysDbStatus;
  counts: BaileysDbCounts;
  tenants: BaileysDbTenant[];
  sessions: BaileysDbSession[];
  webhooks: BaileysDbWebhook[];
  templates: BaileysDbTemplate[];
  messages: BaileysDbMessage[];
  events: BaileysDbEvent[];
  sendLogs: BaileysDbSendLog[];
}

async function getStatus(): Promise<BaileysDbStatus> {
  const resolved = resolveBaileysDbUrl();
  const base: BaileysDbStatus = {
    configured: Boolean(resolved.url),
    connected: false,
    database: BAILEYS_DB_NAME,
    urlSource: resolved.source,
    schemaApplied: false,
    tableCount: 0,
    tables: [],
    missingTables: [...REQUIRED_TABLES],
    indexes: [],
    missingIndexes: [...REQUIRED_INDEXES],
    constraints: [],
    defaultTenantPresent: false,
    error: null,
  };

  const sql = getBaileysSql();
  if (!sql) return base;

  try {
    const [tables, indexes, constraints] = await Promise.all([
      sql<{ tableName: string }[]>`
        SELECT table_name AS "tableName"
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `,
      sql<{ indexName: string }[]>`
        SELECT indexname AS "indexName"
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY indexname
      `,
      sql<{ tableName: string; constraintName: string; constraintType: string }[]>`
        SELECT table_name AS "tableName",
               constraint_name AS "constraintName",
               constraint_type AS "constraintType"
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        ORDER BY table_name, constraint_name
      `,
    ]);

    const tableNames = tables.map((row) => row.tableName);
    const indexNames = indexes.map((row) => row.indexName);
    const missingTables = REQUIRED_TABLES.filter((name) => !tableNames.includes(name));
    const missingIndexes = REQUIRED_INDEXES.filter((name) => !indexNames.includes(name));

    let defaultTenantPresent = false;
    if (tableNames.includes('tenants')) {
      const tenantRows = await sql<{ exists: boolean }[]>`
        SELECT EXISTS(SELECT 1 FROM tenants WHERE tenant_id = 'system') AS exists
      `;
      defaultTenantPresent = Boolean(tenantRows[0]?.exists);
    }

    return {
      ...base,
      connected: true,
      schemaApplied: missingTables.length === 0,
      tableCount: tableNames.length,
      tables: tableNames,
      missingTables,
      indexes: indexNames,
      missingIndexes,
      constraints,
      defaultTenantPresent,
    };
  } catch (err) {
    return {
      ...base,
      error: errMessage(err),
    };
  }
}

function emptyCounts(): BaileysDbCounts {
  return {
    tenants: 0,
    sessions: 0,
    webhooks: 0,
    templates: 0,
    messages: 0,
    events: 0,
    sendLogs: 0,
    messages24h: 0,
  };
}

export async function getBaileysDbPortalData(): Promise<BaileysDbPortalData> {
  const status = await getStatus();
  if (!status.connected || !status.schemaApplied) {
    return {
      status,
      counts: emptyCounts(),
      tenants: [],
      sessions: [],
      webhooks: [],
      templates: [],
      messages: [],
      events: [],
      sendLogs: [],
    };
  }

  const sql = getBaileysSql();
  if (!sql) {
    return {
      status: { ...status, connected: false, error: 'missing_sql_client' },
      counts: emptyCounts(),
      tenants: [],
      sessions: [],
      webhooks: [],
      templates: [],
      messages: [],
      events: [],
      sendLogs: [],
    };
  }

  const [countsRows, tenants, sessions, webhooks, templates, messages, events, sendLogs] = await Promise.all([
    sql<BaileysDbCounts[]>`
      SELECT
        (SELECT COUNT(*)::int FROM tenants) AS tenants,
        (SELECT COUNT(*)::int FROM sessions) AS sessions,
        (SELECT COUNT(*)::int FROM webhooks) AS webhooks,
        (SELECT COUNT(*)::int FROM templates) AS templates,
        (SELECT COUNT(*)::int FROM messages) AS messages,
        (SELECT COUNT(*)::int FROM events) AS events,
        (SELECT COUNT(*)::int FROM send_log) AS "sendLogs",
        (SELECT COUNT(*)::int FROM messages WHERE created_at >= NOW() - INTERVAL '24 hours') AS "messages24h"
    `,
    sql<BaileysDbTenant[]>`
      SELECT tenant_id AS "tenantId",
             display_name AS "displayName",
             status,
             max_sessions AS "maxSessions",
             message_rate AS "messageRate",
             webhook_enabled AS "webhookEnabled",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM tenants
      ORDER BY CASE WHEN tenant_id = 'system' THEN 0 ELSE 1 END, tenant_id
      LIMIT 100
    `,
    sql<BaileysDbSession[]>`
      SELECT id,
             tenant_id AS "tenantId",
             phone,
             purpose,
             status,
             notes,
             last_connected_at AS "lastConnectedAt",
             last_activity_at AS "lastActivityAt",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM sessions
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 100
    `,
    sql<BaileysDbWebhook[]>`
      SELECT id::text AS id,
             tenant_id AS "tenantId",
             session_id AS "sessionId",
             label,
             url,
             events,
             secret_prefix AS "secretPrefix",
             status,
             last_delivery_at AS "lastDeliveryAt",
             last_status AS "lastStatus",
             last_error AS "lastError",
             delivery_count::int AS "deliveryCount",
             failure_count::int AS "failureCount",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM webhooks
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 100
    `,
    sql<BaileysDbTemplate[]>`
      SELECT id::text AS id,
             tenant_id AS "tenantId",
             name,
             language,
             status,
             body,
             variables,
             created_by_email AS "createdByEmail",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM templates
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 100
    `,
    sql<BaileysDbMessage[]>`
      SELECT id::text AS id,
             tenant_id AS "tenantId",
             session_id AS "sessionId",
             direction,
             to_number AS "toNumber",
             from_number AS "fromNumber",
             message_type AS "messageType",
             status,
             preview,
             error_code AS "errorCode",
             created_at AS "createdAt"
      FROM messages
      ORDER BY created_at DESC
      LIMIT 100
    `,
    sql<BaileysDbEvent[]>`
      SELECT id::text AS id,
             tenant_id AS "tenantId",
             session_id AS "sessionId",
             event_type AS "eventType",
             level,
             detail,
             created_at AS "createdAt"
      FROM events
      ORDER BY created_at DESC
      LIMIT 100
    `,
    sql<BaileysDbSendLog[]>`
      SELECT id::text AS id,
             tenant_id AS "tenantId",
             session_id AS "sessionId",
             api_key_prefix AS "apiKeyPrefix",
             to_number AS "toNumber",
             status,
             detail,
             created_at AS "createdAt"
      FROM send_log
      ORDER BY created_at DESC
      LIMIT 100
    `,
  ]);

  return {
    status,
    counts: countsRows[0] ?? emptyCounts(),
    tenants,
    sessions,
    webhooks,
    templates,
    messages,
    events,
    sendLogs,
  };
}
