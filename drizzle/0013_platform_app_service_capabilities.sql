-- 0013_platform_app_service_capabilities.sql
-- Simplify app setup by auto-enabling shared ecosystem capabilities per app.

ALTER TABLE "platform_apps"
  ADD COLUMN IF NOT EXISTS "environment" text;

UPDATE "platform_apps"
SET "environment" = 'production'
WHERE "environment" IS NULL OR btrim("environment") = '';

ALTER TABLE "platform_apps"
  ALTER COLUMN "environment" SET DEFAULT 'production';

ALTER TABLE "platform_apps"
  ALTER COLUMN "environment" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "platform_app_service_capabilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "platform_apps"("id") ON DELETE CASCADE,
  "service_name" text NOT NULL,
  "display_name" text NOT NULL,
  "category" text DEFAULT 'ecosystem' NOT NULL,
  "capability_status" text DEFAULT 'available' NOT NULL,
  "default_enabled" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "platform_app_service_capabilities_unique" UNIQUE ("app_id", "service_name")
);

CREATE INDEX IF NOT EXISTS "platform_app_service_capabilities_app_idx"
  ON "platform_app_service_capabilities" ("app_id");
CREATE INDEX IF NOT EXISTS "platform_app_service_capabilities_status_idx"
  ON "platform_app_service_capabilities" ("capability_status");

WITH defaults (service_name, display_name) AS (
  VALUES
    ('evolution', 'Evolution'),
    ('baileys', 'Baileys'),
    ('dify', 'Dify'),
    ('litellm', 'LiteLLM'),
    ('vllm', 'vLLM'),
    ('qdrant', 'Qdrant'),
    ('chatwoot', 'Chatwoot'),
    ('langfuse', 'Langfuse'),
    ('webhooks', 'Webhooks')
)
INSERT INTO "platform_app_service_capabilities" (
  "app_id",
  "service_name",
  "display_name",
  "category",
  "capability_status",
  "default_enabled",
  "metadata"
)
SELECT
  apps."id",
  defaults.service_name,
  defaults.display_name,
  'ecosystem',
  'available',
  true,
  '{}'::jsonb
FROM "platform_apps" apps
CROSS JOIN defaults
ON CONFLICT ("app_id", "service_name") DO NOTHING;