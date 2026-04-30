import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const BAILEYS_DB_NAME = process.env.BAILEYS_DB_NAME || 'Baileys';
const DIRECT_BAILEYS_DATABASE_URL = process.env.BAILEYS_DATABASE_URL || '';
const FALLBACK_DATABASE_URL = process.env.DATABASE_URL || '';

const REQUIRED_TABLES = [
  'tenants',
  'sessions',
  'webhooks',
  'templates',
  'messages',
  'events',
  'api_key_cache',
  'send_log',
];

const COMPAT_SQL = `
CREATE TABLE IF NOT EXISTS admin_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let pool = null;
let ready = false;
let cachedUrl = null;

function resolveDatabaseUrl() {
  if (cachedUrl !== null) return cachedUrl;
  if (DIRECT_BAILEYS_DATABASE_URL.trim()) {
    cachedUrl = DIRECT_BAILEYS_DATABASE_URL.trim();
    return cachedUrl;
  }
  if (!FALLBACK_DATABASE_URL.trim()) {
    cachedUrl = '';
    return cachedUrl;
  }

  try {
    const parsed = new URL(FALLBACK_DATABASE_URL);
    parsed.pathname = `/${BAILEYS_DB_NAME}`;
    cachedUrl = parsed.toString();
  } catch {
    cachedUrl = '';
  }

  return cachedUrl;
}

function getPool(logger) {
  if (pool) return pool;
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) return null;

  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err) => logger?.error(err, 'Baileys Postgres pool error'));
  return pool;
}

async function ensureSchema(logger) {
  const db = getPool(logger);
  if (!db) throw new Error('BAILEYS_DATABASE_URL is not configured');

  const client = await db.connect();
  try {
    const tables = await client.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'`,
    );
    const tableNames = new Set(tables.rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((tableName) => !tableNames.has(tableName));
    if (missing.length > 0) {
      throw new Error(`Baileys schema missing required tables: ${missing.join(', ')}`);
    }
    await client.query(COMPAT_SQL);
  } finally {
    client.release();
  }
}

export function hashApiKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

export function isDbReady() {
  return ready;
}

export async function initDb(logger) {
  const db = getPool(logger);
  if (!db) {
    logger?.warn('Baileys database URL not set - database features disabled');
    return false;
  }
  if (ready) return true;

  try {
    await ensureSchema(logger);
    ready = true;
    logger?.info({ database: BAILEYS_DB_NAME }, 'Baileys database ready');
    return true;
  } catch (err) {
    ready = false;
    logger?.error(err, 'Baileys database initialization failed');
    return false;
  }
}

function normalizeDirection(direction) {
  return direction === 'in' || direction === 'inbound' ? 'inbound' : 'outbound';
}

function normalizeMessageStatus(status, direction) {
  if (status) return String(status);
  return normalizeDirection(direction) === 'inbound' ? 'received' : 'sent';
}

function clipPreview(value, limit = 240) {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.slice(0, limit);
}

function extractSessionPrefix(value) {
  if (typeof value !== 'string') return { sessionId: null, eventType: value };
  const match = value.match(/^\[([A-Za-z0-9_-]+)\]\s*(.+)$/);
  if (!match) return { sessionId: null, eventType: value };
  return {
    sessionId: match[1],
    eventType: match[2] || value,
  };
}

function inferEventLevel(type, detail, payload) {
  if (typeof payload?.level === 'string' && payload.level) return payload.level;
  const haystack = `${type || ''} ${detail || ''}`.toLowerCase();
  if (haystack.includes('error') || haystack.includes('failed')) return 'error';
  if (haystack.includes('warn') || haystack.includes('disconnected')) return 'warn';
  return 'info';
}

async function ensureTenant(client, tenantId) {
  if (!tenantId) return;
  await client.query(
    `INSERT INTO tenants (tenant_id, display_name, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId, tenantId === 'system' ? 'System / Default' : tenantId],
  );
}

async function getTenantIdForSession(sessionId) {
  if (!ready || !sessionId) return null;
  const result = await pool.query(
    'SELECT tenant_id FROM sessions WHERE id = $1 LIMIT 1',
    [sessionId],
  );
  return result.rows[0]?.tenant_id ?? null;
}

export async function upsertSessionRecord({
  sessionId,
  tenantId = null,
  phone = null,
  purpose = null,
  status = null,
  notes = null,
  lastQrAt = null,
  lastConnectedAt = null,
  lastActivityAt = null,
} = {}) {
  if (!ready || !sessionId) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureTenant(client, tenantId || 'system');
    const result = await client.query(
      `INSERT INTO sessions (
         id,
         tenant_id,
         phone,
         purpose,
         status,
         notes,
         last_qr_at,
         last_connected_at,
         last_activity_at,
         updated_at
       ) VALUES (
         $1,
         COALESCE($2, 'system'),
         $3,
         COALESCE($4, 'tenant'),
         COALESCE($5, 'connecting'),
         $6,
         $7,
         $8,
         $9,
         NOW()
       )
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = COALESCE(EXCLUDED.tenant_id, sessions.tenant_id, 'system'),
         phone = COALESCE(EXCLUDED.phone, sessions.phone),
         purpose = COALESCE(EXCLUDED.purpose, sessions.purpose),
         status = COALESCE(EXCLUDED.status, sessions.status),
         notes = COALESCE(EXCLUDED.notes, sessions.notes),
         last_qr_at = COALESCE(EXCLUDED.last_qr_at, sessions.last_qr_at),
         last_connected_at = COALESCE(EXCLUDED.last_connected_at, sessions.last_connected_at),
         last_activity_at = COALESCE(EXCLUDED.last_activity_at, sessions.last_activity_at),
         updated_at = NOW()
       RETURNING *`,
      [sessionId, tenantId, phone, purpose, status, notes, lastQrAt, lastConnectedAt, lastActivityAt],
    );
    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteSessionRecord(sessionId) {
  if (!ready || !sessionId) return false;
  const result = await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  return result.rowCount > 0;
}

export async function recordSendAttempt({
  tenantId = null,
  sessionId = null,
  apiKeyPrefix = null,
  toNumber = null,
  status = 'accepted',
  detail = null,
} = {}) {
  if (!ready) return;
  const resolvedTenantId = tenantId ?? await getTenantIdForSession(sessionId);
  await pool.query(
    `INSERT INTO send_log (tenant_id, session_id, api_key_prefix, to_number, status, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [resolvedTenantId, sessionId, apiKeyPrefix, toNumber, status, detail],
  );
}

export async function logMessage(logger, {
  direction,
  phone,
  jid,
  messageType = 'text',
  content,
  messageId,
  status = 'sent',
  metadata,
  apiKeyId,
}) {
  if (!ready) return;
  const payload = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
  const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : await getTenantIdForSession(sessionId);
  const normalizedDirection = normalizeDirection(direction);
  const normalizedStatus = normalizeMessageStatus(status, normalizedDirection);

  try {
    await pool.query(
      `INSERT INTO messages (
         tenant_id,
         session_id,
         direction,
         to_number,
         from_number,
         message_type,
         status,
         preview,
         error_code,
         meta
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10::jsonb
       )`,
      [
        tenantId,
        sessionId,
        normalizedDirection,
        normalizedDirection === 'outbound' ? phone : null,
        normalizedDirection === 'inbound' ? phone : null,
        messageType,
        normalizedStatus,
        clipPreview(content),
        payload.errorCode || null,
        JSON.stringify({ ...payload, jid: jid || null, messageId: messageId || null, apiKeyId: apiKeyId || null }),
      ],
    );

    if (sessionId) {
      await upsertSessionRecord({
        sessionId,
        tenantId,
        phone,
        lastActivityAt: new Date().toISOString(),
        status: normalizedDirection === 'inbound' ? 'connected' : null,
      });
    }
  } catch (err) {
    logger?.error(err, 'Failed to log Baileys message');
  }
}

export async function logEvent(logger, type, detail, payload = {}) {
  if (!ready) return;

  const meta = payload && typeof payload === 'object' ? { ...payload } : {};
  const extracted = extractSessionPrefix(type);
  const sessionId = typeof meta.sessionId === 'string' ? meta.sessionId : extracted.sessionId;
  const tenantId = typeof meta.tenantId === 'string' ? meta.tenantId : await getTenantIdForSession(sessionId);
  const eventType = extracted.eventType || type || 'event';
  const level = inferEventLevel(eventType, detail, meta);

  try {
    await pool.query(
      `INSERT INTO events (tenant_id, session_id, event_type, level, detail, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [tenantId, sessionId, eventType, level, detail || null, JSON.stringify(meta)],
    );
  } catch (err) {
    logger?.error(err, 'Failed to log Baileys event');
  }
}

export async function getMessages({ direction, phone, limit = 50, offset = 0 } = {}) {
  if (!ready) return { rows: [], total: 0 };

  const where = [];
  const params = [];
  let idx = 1;

  if (direction) {
    where.push(`direction = $${idx++}`);
    params.push(normalizeDirection(direction));
  }
  if (phone) {
    where.push(`(to_number ILIKE $${idx} OR from_number ILIKE $${idx})`);
    params.push(`%${phone}%`);
    idx += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM messages ${whereSql}`, params);
  const rows = await pool.query(
    `SELECT
       id::text AS id,
       CASE WHEN direction = 'inbound' THEN 'in' ELSE 'out' END AS direction,
       COALESCE(from_number, to_number) AS phone,
       COALESCE(meta->>'jid', NULL) AS jid,
       message_type,
       preview AS content,
       meta->>'messageId' AS message_id,
       status,
       meta AS metadata,
       NULL::int AS api_key_id,
       created_at
     FROM messages
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, Math.min(limit, 200), Math.max(offset, 0)],
  );

  return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
}

export async function getStats(days = 7) {
  if (!ready) return null;

  const summary = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE direction = 'outbound') AS sent,
       COUNT(*) FILTER (WHERE direction = 'inbound') AS received,
       COUNT(*) AS total,
       COUNT(DISTINCT COALESCE(from_number, to_number)) AS unique_contacts,
       MIN(created_at) AS earliest,
       MAX(created_at) AS latest
     FROM messages
     WHERE created_at >= now() - make_interval(days => $1)`,
    [days],
  );

  const daily = await pool.query(
    `SELECT
       date_trunc('day', created_at)::date AS day,
       COUNT(*) FILTER (WHERE direction = 'outbound') AS sent,
       COUNT(*) FILTER (WHERE direction = 'inbound') AS received
     FROM messages
     WHERE created_at >= now() - make_interval(days => $1)
     GROUP BY 1
     ORDER BY 1`,
    [days],
  );

  return {
    summary: summary.rows[0],
    daily: daily.rows,
    byApp: [],
  };
}

export async function getPersistedEvents(limit = 100) {
  if (!ready) return [];
  const result = await pool.query(
    `SELECT
       CONCAT(CASE WHEN session_id IS NOT NULL THEN '[' || session_id || '] ' ELSE '' END, event_type) AS type,
       detail,
       created_at AS ts,
       level,
       session_id,
       tenant_id
     FROM events
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.min(limit, 500)],
  );
  return result.rows;
}

export async function createApiKey(label, scopes) {
  if (!ready) throw new Error('Database not ready');
  const raw = generateApiKey();
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, 8);
  const result = await pool.query(
    `INSERT INTO api_key_cache (id, tenant_id, key_prefix, key_hash, scopes, status, cached_at)
     VALUES ($1, NULL, $2, $3, $4, 'active', NOW())
     RETURNING id, key_prefix, scopes, status, last_used_at, cached_at`,
    [crypto.randomUUID(), prefix, hash, scopes || ['send', 'read']],
  );
  return {
    ...result.rows[0],
    label: label || `Baileys ${prefix}`,
    raw_key: raw,
    app_id: null,
    created_at: result.rows[0]?.cached_at ?? new Date().toISOString(),
  };
}

export async function listApiKeys() {
  if (!ready) return [];
  const result = await pool.query(
    `SELECT
       id,
       key_prefix,
       scopes,
       status,
       last_used_at,
       cached_at AS created_at,
       tenant_id
     FROM api_key_cache
     ORDER BY cached_at DESC`,
  );
  return result.rows.map((row) => ({
    ...row,
    label: `Cache ${row.key_prefix}`,
    app_id: null,
    app_name: null,
    app_domain: null,
    usage_count: 0,
  }));
}

async function updateApiKeyStatus(id, status) {
  const result = await pool.query(
    `UPDATE api_key_cache SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return result.rows[0] || null;
}

export async function revokeApiKey(id) {
  return updateApiKeyStatus(id, 'revoked');
}

export async function disableApiKey(id) {
  return updateApiKeyStatus(id, 'disabled');
}

export async function enableApiKey(id) {
  return updateApiKeyStatus(id, 'active');
}

export async function regenerateApiKey(id) {
  const raw = generateApiKey();
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, 8);
  const result = await pool.query(
    `UPDATE api_key_cache
        SET key_hash = $2,
            key_prefix = $3,
            last_used_at = NULL,
            cached_at = NOW()
      WHERE id = $1 AND status != 'revoked'
      RETURNING *`,
    [id, hash, prefix],
  );
  if (!result.rows[0]) return null;
  return { ...result.rows[0], raw_key: raw };
}

export async function assignKeyToApp() {
  return null;
}

export async function deleteApiKey(id) {
  if (!ready) return;
  await pool.query('DELETE FROM api_key_cache WHERE id = $1', [id]);
}

export async function recordKeyUsage(keyHash) {
  if (!ready) return;
  await pool.query(
    `UPDATE api_key_cache SET last_used_at = NOW() WHERE key_hash = $1`,
    [keyHash],
  );
}

export async function validateApiKey(raw) {
  if (!ready) return null;
  const hash = hashApiKey(raw);
  const result = await pool.query(
    `SELECT *
       FROM api_key_cache
      WHERE key_hash = $1
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [hash],
  );
  return result.rows[0] || null;
}

export async function createApp({ name, domain, description, webhookUrl, settings }) {
  return {
    id: crypto.randomUUID(),
    name,
    domain: domain || null,
    description: description || null,
    status: 'active',
    webhook_url: webhookUrl || null,
    settings: settings || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    api_key_id: null,
  };
}

export async function listApps() {
  return [];
}

export async function getApp() {
  return null;
}

export async function updateApp() {
  return null;
}

export async function deleteApp() {
  return null;
}

export async function toggleAppStatus() {
  return null;
}

export async function getSetting(key) {
  if (!ready) return null;
  const result = await pool.query('SELECT value FROM admin_settings WHERE key = $1', [key]);
  return result.rows[0]?.value ?? null;
}

export async function getSettings() {
  if (!ready) return {};
  const result = await pool.query('SELECT key, value FROM admin_settings ORDER BY key');
  return result.rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

export async function setSetting(key, value) {
  if (!ready) return;
  await pool.query(
    `INSERT INTO admin_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}

export async function getOverviewStats() {
  if (!ready) return null;

  const [messages, apiKeys, sessions, tenants] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE direction = 'outbound') AS sent,
         COUNT(*) FILTER (WHERE direction = 'inbound') AS received,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS last_24h
       FROM messages`,
    ),
    pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'active') AS active
       FROM api_key_cache`,
    ),
    pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'connected') AS active
       FROM sessions`,
    ),
    pool.query('SELECT COUNT(*) AS total FROM tenants'),
  ]);

  return {
    messages: messages.rows[0],
    apiKeys: apiKeys.rows[0],
    apps: { total: '0', active: '0' },
    sessions: sessions.rows[0],
    tenants: tenants.rows[0],
  };
}

export function getDatabaseName() {
  return BAILEYS_DB_NAME;
}