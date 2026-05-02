-- 0012_platform_app_access_control.sql
-- Shared portal-side registry for app access control metadata.
-- Product runtimes keep their own business data and internal state.

CREATE TABLE IF NOT EXISTS "platform_apps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "auth_model" text DEFAULT 'app_owned' NOT NULL,
  "default_channel" text,
  "status" text DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_apps_app_code_idx" ON "platform_apps" ("app_code");
CREATE INDEX IF NOT EXISTS "platform_apps_status_idx" ON "platform_apps" ("status");

CREATE TABLE IF NOT EXISTS "platform_app_tenant_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "platform_apps"("id") ON DELETE CASCADE,
  "app_tenant_key" text NOT NULL,
  "display_name" text,
  "status" text DEFAULT 'active' NOT NULL,
  "environment" text DEFAULT 'production' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_synced_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "platform_app_tenant_bindings_unique" UNIQUE ("app_id", "app_tenant_key")
);

CREATE INDEX IF NOT EXISTS "platform_app_tenant_bindings_app_idx" ON "platform_app_tenant_bindings" ("app_id");
CREATE INDEX IF NOT EXISTS "platform_app_tenant_bindings_status_idx" ON "platform_app_tenant_bindings" ("status");

CREATE TABLE IF NOT EXISTS "platform_service_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "platform_apps"("id") ON DELETE CASCADE,
  "tenant_binding_id" uuid REFERENCES "platform_app_tenant_bindings"("id") ON DELETE CASCADE,
  "service_name" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "display_name" text,
  "base_url" text,
  "internal_base_url" text,
  "status" text DEFAULT 'linked' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "platform_service_integrations_unique" UNIQUE ("app_id", "tenant_binding_id", "service_name", "resource_type", "resource_id")
);

CREATE INDEX IF NOT EXISTS "platform_service_integrations_app_idx" ON "platform_service_integrations" ("app_id");
CREATE INDEX IF NOT EXISTS "platform_service_integrations_tenant_idx" ON "platform_service_integrations" ("tenant_binding_id");
CREATE INDEX IF NOT EXISTS "platform_service_integrations_service_idx" ON "platform_service_integrations" ("service_name");

CREATE TABLE IF NOT EXISTS "platform_secret_refs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "platform_apps"("id") ON DELETE CASCADE,
  "tenant_binding_id" uuid REFERENCES "platform_app_tenant_bindings"("id") ON DELETE CASCADE,
  "service_name" text NOT NULL,
  "ref_provider" text DEFAULT 'infisical' NOT NULL,
  "ref_path" text NOT NULL,
  "ref_key" text,
  "scope" text DEFAULT 'app' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "rotated_at" timestamptz,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "platform_secret_refs_app_idx" ON "platform_secret_refs" ("app_id");
CREATE INDEX IF NOT EXISTS "platform_secret_refs_tenant_idx" ON "platform_secret_refs" ("tenant_binding_id");
CREATE INDEX IF NOT EXISTS "platform_secret_refs_service_idx" ON "platform_secret_refs" ("service_name");
CREATE INDEX IF NOT EXISTS "platform_secret_refs_provider_idx" ON "platform_secret_refs" ("ref_provider");
CREATE UNIQUE INDEX IF NOT EXISTS "platform_secret_refs_unique_idx"
  ON "platform_secret_refs" (
    "app_id",
    coalesce("tenant_binding_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "service_name",
    "ref_provider",
    "ref_path",
    coalesce("ref_key", '')
  );

INSERT INTO "platform_apps" (
  "app_code",
  "name",
  "description",
  "auth_model",
  "default_channel",
  "status",
  "metadata"
)
VALUES (
  'wapi',
  'WAPI',
  'WhatsApp-first multi-tenant communication and AI product app',
  'app_owned',
  'whatsapp',
  'active',
  '{"primary": true, "uses_shared_ai_ecosystem": true, "tenant_model": "multi_tenant"}'::jsonb
)
ON CONFLICT ("app_code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "auth_model" = EXCLUDED."auth_model",
  "default_channel" = EXCLUDED."default_channel",
  "status" = EXCLUDED."status",
  "metadata" = EXCLUDED."metadata",
  "updated_at" = now();