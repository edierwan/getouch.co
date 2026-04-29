-- 0011_object_storage.sql
-- Portal control-plane metadata for the Object Storage Gateway.
-- Real bucket / object data lives in SeaweedFS; this DB only stores
-- portal-managed mappings, access-key metadata (NEVER raw secrets),
-- and an audit trail of admin-initiated actions.

DO $$ BEGIN
  CREATE TYPE "object_storage_tenant_status" AS ENUM ('active', 'suspended', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "object_storage_access_key_status" AS ENUM ('active', 'revoked', 'rotating', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "object_storage_access_key_permission" AS ENUM ('read', 'write', 'read-write', 'presign');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "object_storage_tenant_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(120) NOT NULL,
  "tenant_name" varchar(255),
  "bucket" varchar(120) NOT NULL,
  "prefix" varchar(255) NOT NULL,
  "services" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "quota_bytes" bigint,
  "policy" varchar(40) DEFAULT 'read-write' NOT NULL,
  "retention_days" integer,
  "status" "object_storage_tenant_status" DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "object_storage_tenant_unique" UNIQUE ("tenant_id", "bucket", "prefix")
);

CREATE INDEX IF NOT EXISTS "object_storage_tenant_status_idx" ON "object_storage_tenant_mappings" ("status");
CREATE INDEX IF NOT EXISTS "object_storage_tenant_bucket_idx" ON "object_storage_tenant_mappings" ("bucket");

CREATE TABLE IF NOT EXISTS "object_storage_access_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "label" varchar(160) NOT NULL,
  "tenant_id" varchar(120),
  "bucket" varchar(120),
  "prefix" varchar(255),
  "permission" "object_storage_access_key_permission" DEFAULT 'read-write' NOT NULL,
  "key_prefix" varchar(40) NOT NULL,
  "secret_hash" text,
  "service" varchar(60),
  "ip_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamptz,
  "last_used_at" timestamptz,
  "status" "object_storage_access_key_status" DEFAULT 'active' NOT NULL,
  "created_by" varchar(255),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "object_storage_access_keys_status_idx" ON "object_storage_access_keys" ("status");
CREATE INDEX IF NOT EXISTS "object_storage_access_keys_tenant_idx" ON "object_storage_access_keys" ("tenant_id");

CREATE TABLE IF NOT EXISTS "object_storage_activity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type" varchar(80) NOT NULL,
  "tenant_id" varchar(120),
  "bucket" varchar(120),
  "object_key" text,
  "actor" varchar(255),
  "actor_key_prefix" varchar(40),
  "source_ip" varchar(64),
  "status" varchar(40) DEFAULT 'ok' NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "object_storage_activity_event_idx" ON "object_storage_activity" ("event_type");
CREATE INDEX IF NOT EXISTS "object_storage_activity_tenant_idx" ON "object_storage_activity" ("tenant_id");
CREATE INDEX IF NOT EXISTS "object_storage_activity_created_idx" ON "object_storage_activity" ("created_at" DESC);
