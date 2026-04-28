-- =============================================================
-- Baileys Gateway — initial schema for the dedicated `Baileys` DB
-- =============================================================
--
-- IMPORTANT — STAGED ONLY (not auto-applied):
--   This file lives in /drizzle but is targeted at a SEPARATE
--   database called `Baileys`, not the main `getouch.co` DB.
--   It will NOT be picked up by the standard drizzle migrator
--   that runs against `${APP_DB_NAME}`.
--
--   To apply on the VPS once approved:
--     docker exec -i getouch-postgres psql -U <admin> -d Baileys \
--       < drizzle/0009_baileys_init.sql
--
-- All FK references to the global tenant catalogue are kept as
-- plain TEXT (not FK) because tenants live in the `getouch.co`
-- database and are the source of truth.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Tenants (mirror of portal tenants, key reference only) ──
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id        TEXT PRIMARY KEY,
  display_name     TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  max_sessions     INTEGER NOT NULL DEFAULT 5,
  message_rate     INTEGER NOT NULL DEFAULT 60,        -- per minute
  webhook_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,                    -- lowercase slug
  tenant_id        TEXT REFERENCES tenants(tenant_id) ON DELETE SET NULL,
  phone            TEXT,
  purpose          TEXT NOT NULL DEFAULT 'tenant',      -- primary|secondary|tenant|testing
  status           TEXT NOT NULL DEFAULT 'pending_qr',  -- connected|connecting|pending_qr|disconnected|error
  notes            TEXT,
  last_qr_at       TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- ── Webhooks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  session_id       TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  label            TEXT,
  url              TEXT NOT NULL,
  events           TEXT[] NOT NULL DEFAULT '{}',
  secret_hash      TEXT,                                 -- HMAC pepper applied at runtime
  secret_prefix    TEXT,
  status           TEXT NOT NULL DEFAULT 'active',       -- active|paused|failing
  last_delivery_at TIMESTAMPTZ,
  last_status      INTEGER,
  last_error       TEXT,
  delivery_count   BIGINT NOT NULL DEFAULT 0,
  failure_count    BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_session ON webhooks(session_id);

-- ── Templates ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  language         TEXT NOT NULL DEFAULT 'en',
  status           TEXT NOT NULL DEFAULT 'active',       -- active|draft|archived
  body             TEXT NOT NULL,
  variables        TEXT[] NOT NULL DEFAULT '{}',
  created_by_email TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

-- ── Messages (send / receive log) ────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  session_id       TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  direction        TEXT NOT NULL,                        -- inbound|outbound
  to_number        TEXT,
  from_number      TEXT,
  message_type     TEXT NOT NULL DEFAULT 'text',
  status           TEXT NOT NULL DEFAULT 'queued',       -- queued|sent|delivered|read|failed|received
  preview          TEXT,                                 -- truncated body, sanitised
  error_code       TEXT,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_created ON messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- ── Events (dispatcher / runtime audit) ──────────────────────
CREATE TABLE IF NOT EXISTS events (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        TEXT,
  session_id       TEXT,
  event_type       TEXT NOT NULL,                        -- messages.upsert, connection.update, ...
  level            TEXT NOT NULL DEFAULT 'info',         -- info|warn|error
  detail           TEXT,
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_tenant_created ON events(tenant_id, created_at DESC);

-- ── API key cache (mirror of central api keys for fast auth) ─
-- Authoritative source remains `central_api_keys` in the portal DB.
-- This cache stores: prefix, hashed key, scopes, tenant_id, status.
CREATE TABLE IF NOT EXISTS api_key_cache (
  id               UUID PRIMARY KEY,
  tenant_id        TEXT,
  key_prefix       TEXT NOT NULL,
  key_hash         TEXT NOT NULL,                        -- HMAC-SHA256 of plaintext
  scopes           TEXT[] NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'active',
  expires_at       TIMESTAMPTZ,
  last_used_at     TIMESTAMPTZ,
  cached_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_key_cache_prefix ON api_key_cache(key_prefix);

-- ── Send-attempt log (rate limit / quota) ────────────────────
CREATE TABLE IF NOT EXISTS send_log (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        TEXT,
  session_id       TEXT,
  api_key_prefix   TEXT,
  to_number        TEXT,
  status           TEXT NOT NULL,                        -- accepted|rate_limited|failed
  detail           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_send_log_created ON send_log(created_at DESC);

-- Default system tenant so fresh installs have somewhere for sessions to bind.
INSERT INTO tenants (tenant_id, display_name, status)
VALUES ('system', 'System / Default', 'active')
ON CONFLICT (tenant_id) DO NOTHING;
