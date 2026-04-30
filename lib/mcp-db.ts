import postgres from 'postgres';

const MCP_DB_NAME = process.env.MCP_DB_NAME || 'mcp';

const REQUIRED_TABLES = [
  'mcp_access_keys',
  'mcp_activity_logs',
  'mcp_clients',
  'mcp_servers',
  'mcp_settings',
  'mcp_tenant_mappings',
  'mcp_tool_calls',
  'mcp_tools',
] as const;

const REQUIRED_INDEXES = [
  'idx_mcp_access_keys_prefix',
  'idx_mcp_access_keys_tenant',
  'idx_mcp_activity_logs_created',
  'idx_mcp_clients_tenant',
  'idx_mcp_servers_health',
  'idx_mcp_tool_calls_created',
  'idx_mcp_tool_calls_tenant_created',
  'idx_mcp_tools_server_enabled',
] as const;

type DbUrlSource = 'env' | 'derived' | 'missing';

let cachedUrl: { url: string | null; source: DbUrlSource } | null = null;
let cachedSql: postgres.Sql | null = null;

function resolveMcpDbUrl() {
  if (cachedUrl) return cachedUrl;

  const direct = process.env.MCP_DATABASE_URL?.trim();
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
    parsed.pathname = `/${MCP_DB_NAME}`;
    cachedUrl = { url: parsed.toString(), source: 'derived' };
  } catch {
    cachedUrl = { url: null, source: 'missing' };
  }

  return cachedUrl;
}

function getMcpSql() {
  const resolved = resolveMcpDbUrl();
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

function toIso(value: string | Date | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function toObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface McpDbStatus {
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
  platformTenantPresent: boolean;
  error: string | null;
}

export interface McpServerRow {
  id: string;
  slug: string;
  displayName: string;
  transport: string;
  endpointPath: string;
  originType: string;
  status: string;
  healthStatus: string;
  description: string | null;
  runtimeTarget: string | null;
  authMode: string;
  tenantMode: string;
  lastHeartbeatAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface McpToolRow {
  id: string;
  serverId: string;
  serverSlug: string;
  serverName: string;
  name: string;
  displayName: string;
  description: string;
  enabled: boolean;
  safeDefault: boolean;
  availability: string;
  inputSchema: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface McpClientRow {
  id: string;
  name: string;
  clientType: string;
  tenantId: string | null;
  apiKeyId: string | null;
  keyPrefix: string | null;
  status: string;
  scopes: string[];
  metadata: Record<string, unknown>;
  lastSeenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface McpAccessKeyRow {
  id: string;
  apiKeyId: string;
  clientId: string | null;
  clientName: string;
  keyPrefix: string;
  tenantId: string | null;
  status: string;
  scopes: string[];
  services: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface McpActivityRow {
  id: string;
  level: string;
  eventType: string;
  summary: string;
  clientId: string | null;
  apiKeyId: string | null;
  keyPrefix: string | null;
  tenantId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
}

export interface McpToolCallRow {
  id: string;
  serverId: string | null;
  toolName: string;
  clientId: string | null;
  apiKeyId: string | null;
  keyPrefix: string | null;
  tenantId: string | null;
  status: string;
  errorCode: string | null;
  latencyMs: number | null;
  args: Record<string, unknown>;
  resultPreview: string | null;
  createdAt: string | null;
}

export interface McpTenantRow {
  tenantId: string;
  displayName: string | null;
  status: string;
  metadata: Record<string, unknown>;
  clientCount: number;
  keyCount: number;
  toolCalls24h: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface McpSettingRow {
  settingKey: string;
  settingValue: unknown;
  updatedAt: string | null;
}

export interface McpPortalCounts {
  servers: number;
  enabledServers: number;
  healthyServers: number;
  tools: number;
  enabledTools: number;
  clients: number;
  accessKeys: number;
  activeKeys: number;
  toolCalls24h: number;
  activity24h: number;
  tenants: number;
}

export interface McpPortalData {
  status: McpDbStatus;
  counts: McpPortalCounts;
  servers: McpServerRow[];
  tools: McpToolRow[];
  clients: McpClientRow[];
  accessKeys: McpAccessKeyRow[];
  activity: McpActivityRow[];
  toolCalls: McpToolCallRow[];
  tenants: McpTenantRow[];
  settings: McpSettingRow[];
}

async function getStatus(): Promise<McpDbStatus> {
  const resolved = resolveMcpDbUrl();
  const base: McpDbStatus = {
    configured: Boolean(resolved.url),
    connected: false,
    database: MCP_DB_NAME,
    urlSource: resolved.source,
    schemaApplied: false,
    tableCount: 0,
    tables: [],
    missingTables: [...REQUIRED_TABLES],
    indexes: [],
    missingIndexes: [...REQUIRED_INDEXES],
    platformTenantPresent: false,
    error: null,
  };

  const sql = getMcpSql();
  if (!sql) return base;

  try {
    const [tables, indexes] = await Promise.all([
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
    ]);

    const tableNames = tables.map((row) => row.tableName);
    const indexNames = indexes.map((row) => row.indexName);
    const missingTables = REQUIRED_TABLES.filter((name) => !tableNames.includes(name));
    const missingIndexes = REQUIRED_INDEXES.filter((name) => !indexNames.includes(name));

    let platformTenantPresent = false;
    if (missingTables.length === 0) {
      const tenants = await sql<{ tenantId: string }[]>`
        SELECT tenant_id AS "tenantId"
        FROM mcp_tenant_mappings
        WHERE tenant_id = 'platform'
        LIMIT 1
      `;
      platformTenantPresent = tenants.length > 0;
    }

    return {
      configured: base.configured,
      connected: true,
      database: base.database,
      urlSource: base.urlSource,
      schemaApplied: missingTables.length === 0,
      tableCount: tableNames.length,
      tables: tableNames,
      missingTables,
      indexes: indexNames,
      missingIndexes,
      platformTenantPresent,
      error: null,
    };
  } catch (err) {
    return { ...base, error: errMessage(err) };
  }
}

function mapServerRow(row: Record<string, unknown>): McpServerRow {
  return {
    id: String(row.id),
    slug: String(row.slug),
    displayName: String(row.displayName),
    transport: String(row.transport),
    endpointPath: String(row.endpointPath),
    originType: String(row.originType),
    status: String(row.status),
    healthStatus: String(row.healthStatus),
    description: row.description ? String(row.description) : null,
    runtimeTarget: row.runtimeTarget ? String(row.runtimeTarget) : null,
    authMode: String(row.authMode),
    tenantMode: String(row.tenantMode),
    lastHeartbeatAt: toIso(row.lastHeartbeatAt as string | Date | null | undefined),
    metadata: toObject(row.metadata),
    createdAt: toIso(row.createdAt as string | Date | null | undefined),
    updatedAt: toIso(row.updatedAt as string | Date | null | undefined),
  };
}

function mapToolRow(row: Record<string, unknown>): McpToolRow {
  return {
    id: String(row.id),
    serverId: String(row.serverId),
    serverSlug: String(row.serverSlug),
    serverName: String(row.serverName),
    name: String(row.name),
    displayName: String(row.displayName),
    description: String(row.description),
    enabled: Boolean(row.enabled),
    safeDefault: Boolean(row.safeDefault),
    availability: String(row.availability),
    inputSchema: toObject(row.inputSchema),
    metadata: toObject(row.metadata),
    createdAt: toIso(row.createdAt as string | Date | null | undefined),
    updatedAt: toIso(row.updatedAt as string | Date | null | undefined),
  };
}

function mapClientRow(row: Record<string, unknown>): McpClientRow {
  return {
    id: String(row.id),
    name: String(row.name),
    clientType: String(row.clientType),
    tenantId: row.tenantId ? String(row.tenantId) : null,
    apiKeyId: row.apiKeyId ? String(row.apiKeyId) : null,
    keyPrefix: row.keyPrefix ? String(row.keyPrefix) : null,
    status: String(row.status),
    scopes: toStringArray(row.scopes),
    metadata: toObject(row.metadata),
    lastSeenAt: toIso(row.lastSeenAt as string | Date | null | undefined),
    createdAt: toIso(row.createdAt as string | Date | null | undefined),
    updatedAt: toIso(row.updatedAt as string | Date | null | undefined),
  };
}

function mapAccessKeyRow(row: Record<string, unknown>): McpAccessKeyRow {
  return {
    id: String(row.id),
    apiKeyId: String(row.apiKeyId),
    clientId: row.clientId ? String(row.clientId) : null,
    clientName: String(row.clientName),
    keyPrefix: String(row.keyPrefix),
    tenantId: row.tenantId ? String(row.tenantId) : null,
    status: String(row.status),
    scopes: toStringArray(row.scopes),
    services: toStringArray(row.services),
    expiresAt: toIso(row.expiresAt as string | Date | null | undefined),
    lastUsedAt: toIso(row.lastUsedAt as string | Date | null | undefined),
    lastUsedIp: row.lastUsedIp ? String(row.lastUsedIp) : null,
    createdAt: toIso(row.createdAt as string | Date | null | undefined),
    updatedAt: toIso(row.updatedAt as string | Date | null | undefined),
  };
}

function mapActivityRow(row: Record<string, unknown>): McpActivityRow {
  return {
    id: String(row.id),
    level: String(row.level),
    eventType: String(row.eventType),
    summary: String(row.summary),
    clientId: row.clientId ? String(row.clientId) : null,
    apiKeyId: row.apiKeyId ? String(row.apiKeyId) : null,
    keyPrefix: row.keyPrefix ? String(row.keyPrefix) : null,
    tenantId: row.tenantId ? String(row.tenantId) : null,
    metadata: toObject(row.metadata),
    createdAt: toIso(row.createdAt as string | Date | null | undefined),
  };
}

function mapToolCallRow(row: Record<string, unknown>): McpToolCallRow {
  return {
    id: String(row.id),
    serverId: row.serverId ? String(row.serverId) : null,
    toolName: String(row.toolName),
    clientId: row.clientId ? String(row.clientId) : null,
    apiKeyId: row.apiKeyId ? String(row.apiKeyId) : null,
    keyPrefix: row.keyPrefix ? String(row.keyPrefix) : null,
    tenantId: row.tenantId ? String(row.tenantId) : null,
    status: String(row.status),
    errorCode: row.errorCode ? String(row.errorCode) : null,
    latencyMs: typeof row.latencyMs === 'number' ? row.latencyMs : row.latencyMs ? Number(row.latencyMs) : null,
    args: toObject(row.args),
    resultPreview: row.resultPreview ? String(row.resultPreview) : null,
    createdAt: toIso(row.createdAt as string | Date | null | undefined),
  };
}

function mapTenantRow(row: Record<string, unknown>): McpTenantRow {
  return {
    tenantId: String(row.tenantId),
    displayName: row.displayName ? String(row.displayName) : null,
    status: String(row.status),
    metadata: toObject(row.metadata),
    clientCount: typeof row.clientCount === 'number' ? row.clientCount : Number(row.clientCount ?? 0),
    keyCount: typeof row.keyCount === 'number' ? row.keyCount : Number(row.keyCount ?? 0),
    toolCalls24h: typeof row.toolCalls24h === 'number' ? row.toolCalls24h : Number(row.toolCalls24h ?? 0),
    createdAt: toIso(row.createdAt as string | Date | null | undefined),
    updatedAt: toIso(row.updatedAt as string | Date | null | undefined),
  };
}

function mapSettingRow(row: Record<string, unknown>): McpSettingRow {
  return {
    settingKey: String(row.settingKey),
    settingValue: row.settingValue,
    updatedAt: toIso(row.updatedAt as string | Date | null | undefined),
  };
}

export async function getMcpDbStatus() {
  return getStatus();
}

export async function listMcpServers() {
  const sql = getMcpSql();
  if (!sql) return [];

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      id,
      slug,
      display_name AS "displayName",
      transport,
      endpoint_path AS "endpointPath",
      origin_type AS "originType",
      status,
      health_status AS "healthStatus",
      description,
      runtime_target AS "runtimeTarget",
      auth_mode AS "authMode",
      tenant_mode AS "tenantMode",
      last_heartbeat_at AS "lastHeartbeatAt",
      metadata,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM mcp_servers
    ORDER BY CASE WHEN slug = 'getouch-core' THEN 0 ELSE 1 END, display_name
  `;

  return rows.map(mapServerRow);
}

export async function listMcpTools() {
  const sql = getMcpSql();
  if (!sql) return [];

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      t.id,
      t.server_id AS "serverId",
      s.slug AS "serverSlug",
      s.display_name AS "serverName",
      t.name,
      t.display_name AS "displayName",
      t.description,
      t.enabled,
      t.safe_default AS "safeDefault",
      t.availability,
      t.input_schema AS "inputSchema",
      t.metadata,
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt"
    FROM mcp_tools t
    INNER JOIN mcp_servers s ON s.id = t.server_id
    ORDER BY s.display_name, t.display_name
  `;

  return rows.map(mapToolRow);
}

export async function listRuntimeMcpTools() {
  const tools = await listMcpTools();
  return tools.filter((tool) => tool.enabled && tool.availability === 'enabled');
}

export async function listMcpClients(limit = 100) {
  const sql = getMcpSql();
  if (!sql) return [];

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      id,
      name,
      client_type AS "clientType",
      tenant_id AS "tenantId",
      api_key_id AS "apiKeyId",
      key_prefix AS "keyPrefix",
      status,
      scopes,
      metadata,
      last_seen_at AS "lastSeenAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM mcp_clients
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map(mapClientRow);
}

export async function listMcpAccessKeys(limit = 100) {
  const sql = getMcpSql();
  if (!sql) return [];

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      id,
      api_key_id AS "apiKeyId",
      client_id AS "clientId",
      client_name AS "clientName",
      key_prefix AS "keyPrefix",
      tenant_id AS "tenantId",
      status,
      scopes,
      services,
      expires_at AS "expiresAt",
      last_used_at AS "lastUsedAt",
      last_used_ip AS "lastUsedIp",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM mcp_access_keys
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map(mapAccessKeyRow);
}

export async function listMcpActivity(limit = 120) {
  const sql = getMcpSql();
  if (!sql) return [];

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      id,
      level,
      event_type AS "eventType",
      summary,
      client_id AS "clientId",
      api_key_id AS "apiKeyId",
      key_prefix AS "keyPrefix",
      tenant_id AS "tenantId",
      metadata,
      created_at AS "createdAt"
    FROM mcp_activity_logs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map(mapActivityRow);
}

export async function listMcpToolCalls(limit = 60) {
  const sql = getMcpSql();
  if (!sql) return [];

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      id,
      server_id AS "serverId",
      tool_name AS "toolName",
      client_id AS "clientId",
      api_key_id AS "apiKeyId",
      key_prefix AS "keyPrefix",
      tenant_id AS "tenantId",
      status,
      error_code AS "errorCode",
      latency_ms AS "latencyMs",
      args,
      result_preview AS "resultPreview",
      created_at AS "createdAt"
    FROM mcp_tool_calls
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map(mapToolCallRow);
}

export async function listMcpTenants() {
  const sql = getMcpSql();
  if (!sql) return [];

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      t.tenant_id AS "tenantId",
      t.display_name AS "displayName",
      t.status,
      t.metadata,
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt",
      (
        SELECT count(*)::int
        FROM mcp_clients c
        WHERE c.tenant_id = t.tenant_id
      ) AS "clientCount",
      (
        SELECT count(*)::int
        FROM mcp_access_keys k
        WHERE k.tenant_id = t.tenant_id AND k.status = 'active'
      ) AS "keyCount",
      (
        SELECT count(*)::int
        FROM mcp_tool_calls tc
        WHERE tc.tenant_id = t.tenant_id
          AND tc.created_at > now() - interval '1 day'
      ) AS "toolCalls24h"
    FROM mcp_tenant_mappings t
    ORDER BY CASE WHEN t.tenant_id = 'platform' THEN 0 ELSE 1 END, t.tenant_id
  `;

  return rows.map(mapTenantRow);
}

export async function getMcpTenantMapping(tenantId: string | null | undefined) {
  if (!tenantId) return null;

  const sql = getMcpSql();
  if (!sql) return null;

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      t.tenant_id AS "tenantId",
      t.display_name AS "displayName",
      t.status,
      t.metadata,
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt",
      (
        SELECT count(*)::int
        FROM mcp_clients c
        WHERE c.tenant_id = t.tenant_id
      ) AS "clientCount",
      (
        SELECT count(*)::int
        FROM mcp_access_keys k
        WHERE k.tenant_id = t.tenant_id AND k.status = 'active'
      ) AS "keyCount",
      (
        SELECT count(*)::int
        FROM mcp_tool_calls tc
        WHERE tc.tenant_id = t.tenant_id
          AND tc.created_at > now() - interval '1 day'
      ) AS "toolCalls24h"
    FROM mcp_tenant_mappings t
    WHERE t.tenant_id = ${tenantId}
    LIMIT 1
  `;

  return rows[0] ? mapTenantRow(rows[0]) : null;
}

export async function listMcpSettings() {
  const sql = getMcpSql();
  if (!sql) return [];

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      setting_key AS "settingKey",
      setting_value AS "settingValue",
      updated_at AS "updatedAt"
    FROM mcp_settings
    ORDER BY setting_key
  `;

  return rows.map(mapSettingRow);
}

export async function getMcpPortalData(): Promise<McpPortalData> {
  const status = await getStatus();
  const emptyCounts: McpPortalCounts = {
    servers: 0,
    enabledServers: 0,
    healthyServers: 0,
    tools: 0,
    enabledTools: 0,
    clients: 0,
    accessKeys: 0,
    activeKeys: 0,
    toolCalls24h: 0,
    activity24h: 0,
    tenants: 0,
  };

  if (!status.connected || !status.schemaApplied) {
    return {
      status,
      counts: emptyCounts,
      servers: [],
      tools: [],
      clients: [],
      accessKeys: [],
      activity: [],
      toolCalls: [],
      tenants: [],
      settings: [],
    };
  }

  const sql = getMcpSql();
  if (!sql) {
    return {
      status,
      counts: emptyCounts,
      servers: [],
      tools: [],
      clients: [],
      accessKeys: [],
      activity: [],
      toolCalls: [],
      tenants: [],
      settings: [],
    };
  }

  const [countsRows, servers, tools, clients, accessKeys, activity, toolCalls, tenants, settings] = await Promise.all([
    sql<Record<string, unknown>[]>`
      SELECT
        (SELECT count(*)::int FROM mcp_servers) AS servers,
        (SELECT count(*)::int FROM mcp_servers WHERE status = 'enabled') AS "enabledServers",
        (SELECT count(*)::int FROM mcp_servers WHERE health_status = 'healthy') AS "healthyServers",
        (SELECT count(*)::int FROM mcp_tools) AS tools,
        (SELECT count(*)::int FROM mcp_tools WHERE enabled = true) AS "enabledTools",
        (SELECT count(*)::int FROM mcp_clients) AS clients,
        (SELECT count(*)::int FROM mcp_access_keys) AS "accessKeys",
        (SELECT count(*)::int FROM mcp_access_keys WHERE status = 'active') AS "activeKeys",
        (
          SELECT count(*)::int
          FROM mcp_tool_calls
          WHERE created_at > now() - interval '1 day'
        ) AS "toolCalls24h",
        (
          SELECT count(*)::int
          FROM mcp_activity_logs
          WHERE created_at > now() - interval '1 day'
        ) AS "activity24h",
        (SELECT count(*)::int FROM mcp_tenant_mappings) AS tenants
    `,
    listMcpServers(),
    listMcpTools(),
    listMcpClients(),
    listMcpAccessKeys(),
    listMcpActivity(),
    listMcpToolCalls(),
    listMcpTenants(),
    listMcpSettings(),
  ]);

  const countsRow = countsRows[0] ?? {};
  const counts: McpPortalCounts = {
    servers: Number(countsRow.servers ?? 0),
    enabledServers: Number(countsRow.enabledServers ?? 0),
    healthyServers: Number(countsRow.healthyServers ?? 0),
    tools: Number(countsRow.tools ?? 0),
    enabledTools: Number(countsRow.enabledTools ?? 0),
    clients: Number(countsRow.clients ?? 0),
    accessKeys: Number(countsRow.accessKeys ?? 0),
    activeKeys: Number(countsRow.activeKeys ?? 0),
    toolCalls24h: Number(countsRow.toolCalls24h ?? 0),
    activity24h: Number(countsRow.activity24h ?? 0),
    tenants: Number(countsRow.tenants ?? 0),
  };

  return { status, counts, servers, tools, clients, accessKeys, activity, toolCalls, tenants, settings };
}

export async function ensureMcpTenantMapping(input: {
  tenantId: string | null | undefined;
  displayName?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!input.tenantId) return;

  const sql = getMcpSql();
  if (!sql) return;

  await sql`
    INSERT INTO mcp_tenant_mappings (
      tenant_id,
      display_name,
      status,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      ${input.tenantId},
      ${input.displayName ?? null},
      'active',
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, mcp_tenant_mappings.display_name),
      metadata = CASE
        WHEN EXCLUDED.metadata = '{}'::jsonb THEN mcp_tenant_mappings.metadata
        ELSE EXCLUDED.metadata
      END,
      updated_at = now()
  `;
}

export async function createMcpClient(input: {
  name: string;
  clientType: string;
  tenantId?: string | null;
  apiKeyId?: string | null;
  keyPrefix?: string | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}) {
  const sql = getMcpSql();
  if (!sql) return null;

  await ensureMcpTenantMapping({ tenantId: input.tenantId ?? null });

  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO mcp_clients (
      name,
      client_type,
      tenant_id,
      api_key_id,
      key_prefix,
      status,
      scopes,
      metadata,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (
      ${input.name},
      ${input.clientType},
      ${input.tenantId ?? null},
      ${input.apiKeyId ?? null},
      ${input.keyPrefix ?? null},
      'active',
      ${JSON.stringify(input.scopes ?? [])}::jsonb,
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      null,
      now(),
      now()
    )
    RETURNING
      id,
      name,
      client_type AS "clientType",
      tenant_id AS "tenantId",
      api_key_id AS "apiKeyId",
      key_prefix AS "keyPrefix",
      status,
      scopes,
      metadata,
      last_seen_at AS "lastSeenAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  return rows[0] ? mapClientRow(rows[0]) : null;
}

export async function registerMcpServer(input: {
  slug: string;
  displayName: string;
  description?: string | null;
  originType?: string;
  runtimeTarget?: string | null;
  endpointPath?: string;
  transport?: string;
  authMode?: string;
  tenantMode?: string;
  metadata?: Record<string, unknown>;
}) {
  const sql = getMcpSql();
  if (!sql) return null;

  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO mcp_servers (
      slug,
      display_name,
      transport,
      endpoint_path,
      origin_type,
      status,
      health_status,
      description,
      runtime_target,
      auth_mode,
      tenant_mode,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      ${input.slug},
      ${input.displayName},
      ${input.transport ?? 'streamable_http'},
      ${input.endpointPath ?? '/mcp'},
      ${input.originType ?? 'manual'},
      'enabled',
      'unknown',
      ${input.description ?? null},
      ${input.runtimeTarget ?? null},
      ${input.authMode ?? 'bearer'},
      ${input.tenantMode ?? 'shared'},
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (slug)
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      runtime_target = EXCLUDED.runtime_target,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING
      id,
      slug,
      display_name AS "displayName",
      transport,
      endpoint_path AS "endpointPath",
      origin_type AS "originType",
      status,
      health_status AS "healthStatus",
      description,
      runtime_target AS "runtimeTarget",
      auth_mode AS "authMode",
      tenant_mode AS "tenantMode",
      last_heartbeat_at AS "lastHeartbeatAt",
      metadata,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  return rows[0] ? mapServerRow(rows[0]) : null;
}

async function findMcpClientForKey(apiKeyId: string, keyPrefix: string) {
  const sql = getMcpSql();
  if (!sql) return null;

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      id,
      name,
      client_type AS "clientType",
      tenant_id AS "tenantId",
      api_key_id AS "apiKeyId",
      key_prefix AS "keyPrefix",
      status,
      scopes,
      metadata,
      last_seen_at AS "lastSeenAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM mcp_clients
    WHERE api_key_id = ${apiKeyId}
       OR key_prefix = ${keyPrefix}
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  return rows[0] ? mapClientRow(rows[0]) : null;
}

export async function syncMcpAccessKeyCache(input: {
  apiKeyId: string;
  keyPrefix: string;
  clientName: string;
  clientType?: string;
  clientId?: string | null;
  tenantId?: string | null;
  status?: string;
  scopes?: string[];
  services?: string[];
  expiresAt?: string | Date | null;
  lastUsedAt?: string | Date | null;
  lastUsedIp?: string | null;
}) {
  const sql = getMcpSql();
  if (!sql) return null;

  await ensureMcpTenantMapping({ tenantId: input.tenantId ?? null });

  let clientId = input.clientId ?? null;
  if (!clientId) {
    const existingClient = await findMcpClientForKey(input.apiKeyId, input.keyPrefix);
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const created = await createMcpClient({
        name: input.clientName,
        clientType: input.clientType ?? 'external',
        tenantId: input.tenantId ?? null,
        apiKeyId: input.apiKeyId,
        keyPrefix: input.keyPrefix,
        scopes: input.scopes ?? [],
      });
      clientId = created?.id ?? null;
    }
  }

  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO mcp_access_keys (
      api_key_id,
      client_id,
      client_name,
      key_prefix,
      tenant_id,
      status,
      scopes,
      services,
      expires_at,
      last_used_at,
      last_used_ip,
      created_at,
      updated_at
    )
    VALUES (
      ${input.apiKeyId},
      ${clientId},
      ${input.clientName},
      ${input.keyPrefix},
      ${input.tenantId ?? null},
      ${input.status ?? 'active'},
      ${JSON.stringify(input.scopes ?? [])}::jsonb,
      ${JSON.stringify(input.services ?? ['mcp'])}::jsonb,
      ${input.expiresAt ?? null},
      ${input.lastUsedAt ?? null},
      ${input.lastUsedIp ?? null},
      now(),
      now()
    )
    ON CONFLICT (api_key_id)
    DO UPDATE SET
      client_id = COALESCE(EXCLUDED.client_id, mcp_access_keys.client_id),
      client_name = EXCLUDED.client_name,
      key_prefix = EXCLUDED.key_prefix,
      tenant_id = EXCLUDED.tenant_id,
      status = EXCLUDED.status,
      scopes = EXCLUDED.scopes,
      services = EXCLUDED.services,
      expires_at = EXCLUDED.expires_at,
      last_used_at = COALESCE(EXCLUDED.last_used_at, mcp_access_keys.last_used_at),
      last_used_ip = COALESCE(EXCLUDED.last_used_ip, mcp_access_keys.last_used_ip),
      updated_at = now()
    RETURNING
      id,
      api_key_id AS "apiKeyId",
      client_id AS "clientId",
      client_name AS "clientName",
      key_prefix AS "keyPrefix",
      tenant_id AS "tenantId",
      status,
      scopes,
      services,
      expires_at AS "expiresAt",
      last_used_at AS "lastUsedAt",
      last_used_ip AS "lastUsedIp",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  if (clientId) {
    await sql`
      UPDATE mcp_clients
      SET
        api_key_id = ${input.apiKeyId},
        key_prefix = ${input.keyPrefix},
        tenant_id = ${input.tenantId ?? null},
        scopes = ${JSON.stringify(input.scopes ?? [])}::jsonb,
        last_seen_at = COALESCE(${input.lastUsedAt ?? null}, last_seen_at),
        updated_at = now()
      WHERE id = ${clientId}
    `;
  }

  return rows[0] ? mapAccessKeyRow(rows[0]) : null;
}

export async function touchMcpUsage(input: {
  apiKeyId: string;
  keyPrefix: string;
  tenantId?: string | null;
  lastUsedIp?: string | null;
  seenAt?: string | Date | null;
}) {
  const sql = getMcpSql();
  if (!sql) return;

  const seenAt = input.seenAt ?? new Date();

  await sql`
    UPDATE mcp_access_keys
    SET
      last_used_at = ${seenAt},
      last_used_ip = ${input.lastUsedIp ?? null},
      updated_at = now()
    WHERE api_key_id = ${input.apiKeyId}
  `;

  await sql`
    UPDATE mcp_clients
    SET
      last_seen_at = ${seenAt},
      updated_at = now()
    WHERE api_key_id = ${input.apiKeyId}
       OR key_prefix = ${input.keyPrefix}
  `;

  await ensureMcpTenantMapping({ tenantId: input.tenantId ?? null });
}

export async function updateMcpServerHeartbeat(input: {
  slug: string;
  healthStatus: string;
  status?: string;
}) {
  const sql = getMcpSql();
  if (!sql) return;

  await sql`
    UPDATE mcp_servers
    SET
      health_status = ${input.healthStatus},
      status = COALESCE(${input.status ?? null}, status),
      last_heartbeat_at = now(),
      updated_at = now()
    WHERE slug = ${input.slug}
  `;
}

export async function recordMcpActivity(input: {
  level?: string;
  eventType: string;
  summary: string;
  clientId?: string | null;
  apiKeyId?: string | null;
  keyPrefix?: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const sql = getMcpSql();
    if (!sql) return;

    await ensureMcpTenantMapping({ tenantId: input.tenantId ?? null });

    await sql`
      INSERT INTO mcp_activity_logs (
        level,
        event_type,
        summary,
        client_id,
        api_key_id,
        key_prefix,
        tenant_id,
        metadata,
        created_at
      )
      VALUES (
        ${input.level ?? 'info'},
        ${input.eventType},
        ${input.summary},
        ${input.clientId ?? null},
        ${input.apiKeyId ?? null},
        ${input.keyPrefix ?? null},
        ${input.tenantId ?? null},
        ${JSON.stringify(input.metadata ?? {})}::jsonb,
        now()
      )
    `;
  } catch (err) {
    console.error('[mcp-db] failed to record activity:', err);
  }
}

export async function recordMcpToolCall(input: {
  serverId?: string | null;
  toolName: string;
  clientId?: string | null;
  apiKeyId?: string | null;
  keyPrefix?: string | null;
  tenantId?: string | null;
  status: string;
  errorCode?: string | null;
  latencyMs?: number | null;
  args?: Record<string, unknown>;
  resultPreview?: string | null;
}) {
  try {
    const sql = getMcpSql();
    if (!sql) return;

    await ensureMcpTenantMapping({ tenantId: input.tenantId ?? null });

    await sql`
      INSERT INTO mcp_tool_calls (
        server_id,
        tool_name,
        client_id,
        api_key_id,
        key_prefix,
        tenant_id,
        status,
        error_code,
        latency_ms,
        args,
        result_preview,
        created_at
      )
      VALUES (
        ${input.serverId ?? null},
        ${input.toolName},
        ${input.clientId ?? null},
        ${input.apiKeyId ?? null},
        ${input.keyPrefix ?? null},
        ${input.tenantId ?? null},
        ${input.status},
        ${input.errorCode ?? null},
        ${input.latencyMs ?? null},
        ${JSON.stringify(input.args ?? {})}::jsonb,
        ${input.resultPreview ?? null},
        now()
      )
    `;
  } catch (err) {
    console.error('[mcp-db] failed to record tool call:', err);
  }
}