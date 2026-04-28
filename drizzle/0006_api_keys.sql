-- 0006_api_keys.sql
-- Centralized API Key Manager foundation
-- Adds tables: api_keys, api_key_usage_logs, api_key_audit_logs, api_secret_inventory

DO $$ BEGIN
  CREATE TYPE "api_key_environment" AS ENUM ('live', 'test');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "api_key_status" AS ENUM ('active', 'disabled', 'revoked', 'rotating', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "api_key_validation_source" AS ENUM ('central', 'legacy_wa', 'env', 'manual', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "api_secret_status" AS ENUM ('configured', 'missing', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "name" varchar(200) NOT NULL,
  "environment" "api_key_environment" DEFAULT 'live' NOT NULL,
  "key_prefix" varchar(32) NOT NULL,
  "key_hash" text NOT NULL,
  "status" "api_key_status" DEFAULT 'active' NOT NULL,
  "services" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rate_limit_count" integer,
  "rate_limit_window_seconds" integer,
  "burst_limit" integer,
  "validation_source" "api_key_validation_source" DEFAULT 'central' NOT NULL,
  "notes" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by_email" varchar(255),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz,
  "last_used_at" timestamptz,
  "last_used_ip" varchar(64),
  "last_used_service" varchar(64),
  "rotated_from_id" uuid,
  "revoked_at" timestamptz,
  "revoked_by_email" varchar(255),
  CONSTRAINT "api_keys_key_prefix_unique" UNIQUE ("key_prefix")
);

CREATE INDEX IF NOT EXISTS "api_keys_status_idx" ON "api_keys" ("status");
CREATE INDEX IF NOT EXISTS "api_keys_tenant_idx" ON "api_keys" ("tenant_id");
CREATE INDEX IF NOT EXISTS "api_keys_created_at_idx" ON "api_keys" ("created_at");

CREATE TABLE IF NOT EXISTS "api_key_usage_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "api_key_id" uuid REFERENCES "api_keys"("id") ON DELETE CASCADE,
  "key_prefix" varchar(32),
  "service" varchar(64),
  "route" varchar(255),
  "status_code" integer,
  "request_id" varchar(80),
  "ip_hash" varchar(80),
  "user_agent_hash" varchar(80),
  "latency_ms" integer,
  "error_code" varchar(64),
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "api_key_usage_logs_key_idx" ON "api_key_usage_logs" ("api_key_id");
CREATE INDEX IF NOT EXISTS "api_key_usage_logs_created_at_idx" ON "api_key_usage_logs" ("created_at");

CREATE TABLE IF NOT EXISTS "api_key_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "api_key_id" uuid REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "key_prefix" varchar(32),
  "action" varchar(40) NOT NULL,
  "actor_email" varchar(255),
  "summary" varchar(255),
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "api_key_audit_logs_key_idx" ON "api_key_audit_logs" ("api_key_id");
CREATE INDEX IF NOT EXISTS "api_key_audit_logs_created_at_idx" ON "api_key_audit_logs" ("created_at");

CREATE TABLE IF NOT EXISTS "api_secret_inventory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "service_name" varchar(120) NOT NULL,
  "env_name" varchar(200) NOT NULL,
  "secret_type" varchar(80),
  "status" "api_secret_status" DEFAULT 'unknown' NOT NULL,
  "managed_by" varchar(40) DEFAULT 'coolify' NOT NULL,
  "notes" text,
  "last_checked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "api_secret_inventory_service_env_idx" UNIQUE ("service_name", "env_name")
);
