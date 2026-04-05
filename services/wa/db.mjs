/**
 * Getouch WA – PostgreSQL database layer
 *
 * Provides:
 *  - Connection pool via pg
 *  - Auto-migration (creates tables on first connect)
 *  - Message logging (insert + query)
 *  - Stats aggregation
 */

import pg from 'pg';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Pool singleton
// ---------------------------------------------------------------------------
let pool = null;
let ready = false;

const DATABASE_URL = process.env.DATABASE_URL;

/** Initialise pool and run migrations. Safe to call multiple times. */
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

  pool.on('error', (err) => {
    logger?.error(err, 'Postgres pool error');
  });

  try {
    await migrate(logger);
    ready = true;
    logger?.info('Database ready');
    return true;
  } catch (err) {
    logger?.error(err, 'Database migration failed — DB features disabled');
    pool = null;
    ready = false;
    return false;
  }
}

export function isDbReady() {
  return ready;
}

// ---------------------------------------------------------------------------
// Schema migration
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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msglog_phone      ON message_log (phone);
CREATE INDEX IF NOT EXISTS idx_msglog_created     ON message_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msglog_direction   ON message_log (direction);

CREATE TABLE IF NOT EXISTS event_log (
  id         BIGSERIAL PRIMARY KEY,
  type       TEXT NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evtlog_created ON event_log (created_at DESC);
`;

async function migrate(logger) {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_SQL);
    logger?.info('Database schema verified');
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Message logging
// ---------------------------------------------------------------------------

/**
 * Log a message (outgoing or incoming).
 * Non-blocking — errors are swallowed and logged.
 */
export async function logMessage(logger, {
  direction,
  phone,
  jid,
  messageType = 'text',
  content,
  messageId,
  status = 'sent',
  metadata,
}) {
  if (!ready) return;
  try {
    await pool.query(
      `INSERT INTO message_log (direction, phone, jid, message_type, content, message_id, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [direction, phone, jid || null, messageType, content || null, messageId || null, status, metadata ? JSON.stringify(metadata) : null],
    );
  } catch (err) {
    logger?.error(err, 'Failed to log message');
  }
}

/**
 * Persist an event to the database (supplements in-memory ring buffer).
 */
export async function logEvent(logger, type, detail) {
  if (!ready) return;
  try {
    await pool.query(
      'INSERT INTO event_log (type, detail) VALUES ($1, $2)',
      [type, detail],
    );
  } catch (err) {
    logger?.error(err, 'Failed to log event');
  }
}

// ---------------------------------------------------------------------------
// Admin queries
// ---------------------------------------------------------------------------

/**
 * Get paginated message history.
 * @param {Object} opts - { direction?, phone?, limit, offset }
 */
export async function getMessages({ direction, phone, limit = 50, offset = 0 } = {}) {
  if (!ready) return { rows: [], total: 0 };

  const conditions = [];
  const params = [];
  let idx = 1;

  if (direction) {
    conditions.push(`direction = $${idx++}`);
    params.push(direction);
  }
  if (phone) {
    conditions.push(`phone LIKE $${idx++}`);
    params.push(`%${phone}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM message_log ${where}`,
    params,
  );

  const dataParams = [...params, Math.min(limit, 200), Math.max(offset, 0)];
  const dataResult = await pool.query(
    `SELECT * FROM message_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    dataParams,
  );

  return {
    rows: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}

/**
 * Get message stats for the last N days.
 */
export async function getStats(days = 7) {
  if (!ready) return null;

  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE direction = 'out') AS sent,
      COUNT(*) FILTER (WHERE direction = 'in')  AS received,
      COUNT(*)                                    AS total,
      COUNT(DISTINCT phone)                       AS unique_contacts,
      MIN(created_at)                             AS earliest,
      MAX(created_at)                             AS latest
    FROM message_log
    WHERE created_at >= now() - make_interval(days => $1)
  `, [days]);

  const daily = await pool.query(`
    SELECT
      date_trunc('day', created_at)::date AS day,
      COUNT(*) FILTER (WHERE direction = 'out') AS sent,
      COUNT(*) FILTER (WHERE direction = 'in')  AS received
    FROM message_log
    WHERE created_at >= now() - make_interval(days => $1)
    GROUP BY 1
    ORDER BY 1
  `, [days]);

  return {
    summary: result.rows[0],
    daily: daily.rows,
  };
}

/**
 * Get persisted events (supplements in-memory ring buffer for historical view).
 */
export async function getPersistedEvents(limit = 100) {
  if (!ready) return [];
  const result = await pool.query(
    'SELECT type, detail, created_at AS ts FROM event_log ORDER BY created_at DESC LIMIT $1',
    [Math.min(limit, 500)],
  );
  return result.rows;
}
