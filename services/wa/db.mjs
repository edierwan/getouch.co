/**
 * Getouch WA – PostgreSQL database layer (v2)
 *
 * Tables: message_log, event_log, api_keys, connected_apps, admin_settings
 * Provides full CRUD for admin console.
 */

import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

let pool = null;
let ready = false;
const DATABASE_URL = process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------
export function hashApiKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateApiKey() {
  return crypto.randomBytes(24).toString('hex'); // 48-char hex
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
export async function initDb(logger) {
  if (!DATABASE_URL) {
    logger?.warn('DATABASE_URL not set — database features disabled');
    return false;
  }
  if (pool && ready) return true;

  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err) => logger?.error(err, 'Postgres pool error'));

  try {
    await migrate(logger);
    ready = true;
    logger?.info('Database ready');
    return true;
  } catch (err) {
    logger?.error(err, 'Database migration failed');
    pool = null;
    ready = false;
    return false;
  }
}

export function isDbReady() { return ready; }

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS message_log (
  id            BIGSERIAL PRIMARY KEY,
  direction     TEXT NOT NULL CHECK (direction IN ('in','out')),
  phone         TEXT NOT NULL,
  jid           TEXT,
  message_type  TEXT NOT NULL DEFAULT 'text',
  content       TEXT,
  message_id    TEXT,
  status        TEXT NOT NULL DEFAULT 'sent',
  metadata      JSONB,
  api_key_id    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msglog_phone    ON message_log (phone);
CREATE INDEX IF NOT EXISTS idx_msglog_created  ON message_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msglog_direction ON message_log (direction);

CREATE TABLE IF NOT EXISTS event_log (
  id         BIGSERIAL PRIMARY KEY,
  type       TEXT NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evtlog_created ON event_log (created_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  id          SERIAL PRIMARY KEY,
  key_hash    TEXT NOT NULL UNIQUE,
  key_prefix  TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT 'Unnamed Key',
  scopes      JSONB NOT NULL DEFAULT '["send","read"]',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','revoked')),
  app_id      INTEGER,
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connected_apps (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  domain      TEXT,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  api_key_id  INTEGER REFERENCES api_keys(id),
  webhook_url TEXT,
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function migrate(logger) {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_SQL);
    // v3 migrations: add columns/constraints if missing
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS app_id INTEGER;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    await client.query(`
      ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_status_check;
      ALTER TABLE api_keys ADD CONSTRAINT api_keys_status_check CHECK (status IN ('active','disabled','revoked'));
    `).catch(() => {});
    logger?.info('Database schema verified (v3)');
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Message logging
// ---------------------------------------------------------------------------
export async function logMessage(logger, {
  direction, phone, jid, messageType = 'text',
  content, messageId, status = 'sent', metadata, apiKeyId,
}) {
  if (!ready) return;
  try {
    await pool.query(
      `INSERT INTO message_log (direction,phone,jid,message_type,content,message_id,status,metadata,api_key_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [direction, phone, jid || null, messageType, content || null,
       messageId || null, status, metadata ? JSON.stringify(metadata) : null, apiKeyId || null],
    );
  } catch (err) {
    logger?.error(err, 'Failed to log message');
  }
}

export async function logEvent(logger, type, detail) {
  if (!ready) return;
  try {
    await pool.query('INSERT INTO event_log (type,detail) VALUES ($1,$2)', [type, detail]);
  } catch (err) {
    logger?.error(err, 'Failed to log event');
  }
}

// ---------------------------------------------------------------------------
// Messages / Events queries
// ---------------------------------------------------------------------------
export async function getMessages({ direction, phone, limit = 50, offset = 0 } = {}) {
  if (!ready) return { rows: [], total: 0 };
  const conds = []; const params = []; let idx = 1;
  if (direction) { conds.push(`direction = $${idx++}`); params.push(direction); }
  if (phone) { conds.push(`phone LIKE $${idx++}`); params.push(`%${phone}%`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const cnt = await pool.query(`SELECT COUNT(*) AS total FROM message_log ${where}`, params);
  const dataP = [...params, Math.min(limit, 200), Math.max(offset, 0)];
  const rows = await pool.query(
    `SELECT * FROM message_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, dataP);
  return { rows: rows.rows, total: parseInt(cnt.rows[0].total, 10) };
}

export async function getStats(days = 7) {
  if (!ready) return null;
  const r = await pool.query(`
    SELECT COUNT(*) FILTER (WHERE direction='out') AS sent,
           COUNT(*) FILTER (WHERE direction='in')  AS received,
           COUNT(*) AS total, COUNT(DISTINCT phone) AS unique_contacts,
           MIN(created_at) AS earliest, MAX(created_at) AS latest
    FROM message_log WHERE created_at >= now() - make_interval(days => $1)`, [days]);
  const daily = await pool.query(`
    SELECT date_trunc('day',created_at)::date AS day,
           COUNT(*) FILTER (WHERE direction='out') AS sent,
           COUNT(*) FILTER (WHERE direction='in')  AS received
    FROM message_log WHERE created_at >= now() - make_interval(days => $1)
    GROUP BY 1 ORDER BY 1`, [days]);
  return { summary: r.rows[0], daily: daily.rows };
}

export async function getPersistedEvents(limit = 100) {
  if (!ready) return [];
  const r = await pool.query(
    'SELECT type,detail,created_at AS ts FROM event_log ORDER BY created_at DESC LIMIT $1',
    [Math.min(limit, 500)]);
  return r.rows;
}

// ---------------------------------------------------------------------------
// API Keys CRUD
// ---------------------------------------------------------------------------
export async function createApiKey(label, scopes, appId) {
  const raw = generateApiKey();
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, 8);
  const sc = JSON.stringify(scopes || ['send', 'read']);
  const r = await pool.query(
    `INSERT INTO api_keys (key_hash,key_prefix,label,scopes,app_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [hash, prefix, label || 'Unnamed Key', sc, appId || null]);
  return { ...r.rows[0], raw_key: raw };
}

export async function listApiKeys() {
  const r = await pool.query(`
    SELECT k.id, k.key_prefix, k.label, k.scopes, k.status, k.app_id,
           k.last_used_at, k.usage_count, k.created_at,
           a.name AS app_name, a.domain AS app_domain
    FROM api_keys k LEFT JOIN connected_apps a ON k.app_id = a.id
    ORDER BY k.created_at DESC`);
  return r.rows;
}

export async function revokeApiKey(id) {
  const r = await pool.query(
    `UPDATE api_keys SET status='revoked' WHERE id=$1 RETURNING *`, [id]);
  return r.rows[0] || null;
}

export async function disableApiKey(id) {
  const r = await pool.query(
    `UPDATE api_keys SET status='disabled' WHERE id=$1 AND status='active' RETURNING *`, [id]);
  return r.rows[0] || null;
}

export async function enableApiKey(id) {
  const r = await pool.query(
    `UPDATE api_keys SET status='active' WHERE id=$1 AND status='disabled' RETURNING *`, [id]);
  return r.rows[0] || null;
}

export async function regenerateApiKey(id) {
  const raw = generateApiKey();
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, 8);
  const r = await pool.query(
    `UPDATE api_keys SET key_hash=$1, key_prefix=$2, usage_count=0, last_used_at=NULL WHERE id=$3 AND status != 'revoked' RETURNING *`,
    [hash, prefix, id]);
  if (!r.rows[0]) return null;
  return { ...r.rows[0], raw_key: raw };
}

export async function assignKeyToApp(keyId, appId) {
  const r = await pool.query(
    `UPDATE api_keys SET app_id=$1 WHERE id=$2 RETURNING *`, [appId || null, keyId]);
  return r.rows[0] || null;
}

export async function deleteApiKey(id) {
  await pool.query('DELETE FROM api_keys WHERE id=$1', [id]);
}

export async function recordKeyUsage(keyHash) {
  await pool.query(
    `UPDATE api_keys SET last_used_at=now(), usage_count=usage_count+1 WHERE key_hash=$1`, [keyHash]);
}

export async function validateApiKey(raw) {
  if (!ready) return null;
  const hash = hashApiKey(raw);
  const r = await pool.query(
    `SELECT * FROM api_keys WHERE key_hash=$1 AND status='active'`, [hash]);
  return r.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Connected Apps CRUD
// ---------------------------------------------------------------------------
export async function createApp({ name, domain, description, apiKeyId, webhookUrl, settings }) {
  const r = await pool.query(
    `INSERT INTO connected_apps (name,domain,description,api_key_id,webhook_url,settings)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, domain || null, description || null, apiKeyId || null, webhookUrl || null,
     JSON.stringify(settings || {})]);
  return r.rows[0];
}

export async function listApps() {
  const r = await pool.query(`
    SELECT a.*, k.label AS key_label, k.key_prefix, k.status AS key_status
    FROM connected_apps a LEFT JOIN api_keys k ON a.api_key_id = k.id
    ORDER BY a.created_at DESC`);
  return r.rows;
}

export async function toggleAppStatus(id) {
  const r = await pool.query(
    `UPDATE connected_apps SET status = CASE WHEN status='active' THEN 'inactive' ELSE 'active' END, updated_at=now() WHERE id=$1 RETURNING *`, [id]);
  return r.rows[0] || null;
}

export async function getApp(id) {
  const r = await pool.query('SELECT * FROM connected_apps WHERE id=$1', [id]);
  return r.rows[0] || null;
}

export async function updateApp(id, fields) {
  const sets = []; const params = []; let idx = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (['name','domain','description','status','api_key_id','webhook_url','settings'].includes(k)) {
      sets.push(`${k} = $${idx++}`);
      params.push(k === 'settings' ? JSON.stringify(v) : v);
    }
  }
  if (!sets.length) return null;
  sets.push(`updated_at = now()`);
  params.push(id);
  const r = await pool.query(
    `UPDATE connected_apps SET ${sets.join(',')} WHERE id=$${idx} RETURNING *`, params);
  return r.rows[0] || null;
}

export async function deleteApp(id) {
  await pool.query('DELETE FROM connected_apps WHERE id=$1', [id]);
}

// ---------------------------------------------------------------------------
// Admin settings
// ---------------------------------------------------------------------------
export async function getSetting(key) {
  if (!ready) return null;
  const r = await pool.query('SELECT value FROM admin_settings WHERE key=$1', [key]);
  return r.rows[0]?.value ?? null;
}

export async function getSettings() {
  if (!ready) return {};
  const r = await pool.query('SELECT key,value FROM admin_settings ORDER BY key');
  const out = {};
  for (const row of r.rows) out[row.key] = row.value;
  return out;
}

export async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO admin_settings (key,value,updated_at) VALUES ($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()`,
    [key, JSON.stringify(value)]);
}

// ---------------------------------------------------------------------------
// Overview stats
// ---------------------------------------------------------------------------
export async function getOverviewStats() {
  if (!ready) return null;
  const msgs = await pool.query(`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE direction='out') AS sent,
           COUNT(*) FILTER (WHERE direction='in') AS received,
           COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS last_24h
    FROM message_log`);
  const keys = await pool.query(`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status='active') AS active
    FROM api_keys`);
  const apps = await pool.query(`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status='active') AS active
    FROM connected_apps`);
  return {
    messages: msgs.rows[0],
    apiKeys: keys.rows[0],
    apps: apps.rows[0],
  };
}
