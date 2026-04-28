-- 0008_evolution_multitenant.sql
-- Multi-tenant Evolution WhatsApp gateway control-plane.
-- Idempotent — safe to run multiple times.
--
-- Note: these tables live in the portal control-plane DB (same as central_*).
-- Evolution API's own runtime data (Baileys auth state, QR, etc.) stays inside
-- the Evolution container's own Postgres schema, separate from these.

DO $$ BEGIN
  CREATE TYPE "evolution_instance_status" AS ENUM ('active', 'stopped', 'error', 'maintenance', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "evolution_session_status" AS ENUM ('connected', 'connecting', 'disconnected', 'expired', 'error', 'qr_pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "evolution_webhook_status" AS ENUM ('active', 'paused', 'failing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "evolution_template_status" AS ENUM ('draft', 'pending', 'approved', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "evolution_message_direction" AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "evolution_message_status" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed', 'received');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "evolution_tenant_plan" AS ENUM ('trial', 'starter', 'pro', 'business', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "evolution_tenant_binding_status" AS ENUM ('active', 'suspended', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "evolution_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "internal_url" text NOT NULL,
  "public_url" text,
  "status" "evolution_instance_status" DEFAULT 'unknown' NOT NULL,
  "version" varchar(40),
  "region" varchar(60),
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_health_check_at" timestamptz,
  "last_health_status" varchar(40),
  "last_health_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "evolution_instances_slug_unique" UNIQUE ("slug")
);

CREATE INDEX IF NOT EXISTS "evolution_instances_status_idx" ON "evolution_instances" ("status");

CREATE TABLE IF NOT EXISTS "evolution_tenant_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "tenant_name" varchar(160),
  "tenant_domain" varchar(255),
  "instance_id" uuid REFERENCES "evolution_instances"("id") ON DELETE SET NULL,
  "default_session_id" uuid,
  "plan" "evolution_tenant_plan" DEFAULT 'trial' NOT NULL,
  "status" "evolution_tenant_binding_status" DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "evolution_tenant_bindings_tenant_unique" UNIQUE ("tenant_id")
);

CREATE INDEX IF NOT EXISTS "evolution_tenant_bindings_instance_idx" ON "evolution_tenant_bindings" ("instance_id");
CREATE INDEX IF NOT EXISTS "evolution_tenant_bindings_status_idx" ON "evolution_tenant_bindings" ("status");

CREATE TABLE IF NOT EXISTS "evolution_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "instance_id" uuid REFERENCES "evolution_instances"("id") ON DELETE SET NULL,
  "tenant_id" uuid,
  "session_name" varchar(120) NOT NULL,
  "phone_number" varchar(40),
  "status" "evolution_session_status" DEFAULT 'disconnected' NOT NULL,
  "qr_status" varchar(40),
  "qr_expires_at" timestamptz,
  "evolution_remote_id" varchar(160),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_connected_at" timestamptz,
  "last_disconnected_at" timestamptz,
  "last_message_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "evolution_sessions_instance_name_unique" UNIQUE ("instance_id", "session_name")
);

CREATE INDEX IF NOT EXISTS "evolution_sessions_tenant_idx" ON "evolution_sessions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "evolution_sessions_status_idx" ON "evolution_sessions" ("status");
CREATE INDEX IF NOT EXISTS "evolution_sessions_phone_idx" ON "evolution_sessions" ("phone_number");

CREATE TABLE IF NOT EXISTS "evolution_webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "instance_id" uuid REFERENCES "evolution_instances"("id") ON DELETE SET NULL,
  "session_id" uuid REFERENCES "evolution_sessions"("id") ON DELETE SET NULL,
  "label" varchar(120),
  "url" text NOT NULL,
  "events" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "secret_hash" text,
  "secret_prefix" varchar(16),
  "status" "evolution_webhook_status" DEFAULT 'active' NOT NULL,
  "last_delivery_at" timestamptz,
  "last_delivery_status" integer,
  "last_error" text,
  "delivery_count" integer DEFAULT 0 NOT NULL,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "evolution_webhooks_tenant_idx" ON "evolution_webhooks" ("tenant_id");
CREATE INDEX IF NOT EXISTS "evolution_webhooks_status_idx" ON "evolution_webhooks" ("status");

CREATE TABLE IF NOT EXISTS "evolution_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "name" varchar(160) NOT NULL,
  "category" varchar(60),
  "language" varchar(20) DEFAULT 'en' NOT NULL,
  "status" "evolution_template_status" DEFAULT 'draft' NOT NULL,
  "body" text NOT NULL,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_email" varchar(255),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "evolution_templates_tenant_idx" ON "evolution_templates" ("tenant_id");
CREATE INDEX IF NOT EXISTS "evolution_templates_status_idx" ON "evolution_templates" ("status");

CREATE TABLE IF NOT EXISTS "evolution_message_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "instance_id" uuid REFERENCES "evolution_instances"("id") ON DELETE SET NULL,
  "session_id" uuid REFERENCES "evolution_sessions"("id") ON DELETE SET NULL,
  "direction" "evolution_message_direction" NOT NULL,
  "to_number" varchar(40),
  "from_number" varchar(40),
  "message_type" varchar(40) DEFAULT 'text' NOT NULL,
  "status" "evolution_message_status" NOT NULL,
  "provider_message_id" varchar(160),
  "preview" varchar(280),
  "error_code" varchar(80),
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "evolution_message_logs_tenant_idx" ON "evolution_message_logs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "evolution_message_logs_session_idx" ON "evolution_message_logs" ("session_id");
CREATE INDEX IF NOT EXISTS "evolution_message_logs_created_at_idx" ON "evolution_message_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "evolution_message_logs_status_idx" ON "evolution_message_logs" ("status");

CREATE TABLE IF NOT EXISTS "evolution_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "instance_id" uuid REFERENCES "evolution_instances"("id") ON DELETE SET NULL,
  "session_id" uuid REFERENCES "evolution_sessions"("id") ON DELETE SET NULL,
  "event_type" varchar(80) NOT NULL,
  "severity" varchar(20) DEFAULT 'info' NOT NULL,
  "summary" varchar(255),
  "actor_email" varchar(255),
  "payload_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "evolution_events_created_at_idx" ON "evolution_events" ("created_at");
CREATE INDEX IF NOT EXISTS "evolution_events_event_type_idx" ON "evolution_events" ("event_type");
CREATE INDEX IF NOT EXISTS "evolution_events_tenant_idx" ON "evolution_events" ("tenant_id");

CREATE TABLE IF NOT EXISTS "evolution_settings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "default_webhook_events" jsonb DEFAULT '["message.received","message.sent","session.connected","session.disconnected","qr.updated"]'::jsonb NOT NULL,
  "retry_max_attempts" integer DEFAULT 5 NOT NULL,
  "rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
  "session_limit_per_tenant" integer DEFAULT 5 NOT NULL,
  "tenant_isolation_strict" boolean DEFAULT true NOT NULL,
  "maintenance_mode" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by_email" varchar(255),
  CONSTRAINT "evolution_settings_singleton" CHECK ("id" = 1)
);

INSERT INTO "evolution_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
