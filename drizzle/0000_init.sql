-- Getouch Central Auth: initial schema
-- Applies to: getouch.co, getouch.co.dev, getouch.co.stg databases

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'user', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'pending',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_provisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app         VARCHAR(50) NOT NULL,
  external_id TEXT,
  synced_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_provisions_user_app_idx
  ON app_provisions (user_id, app);
