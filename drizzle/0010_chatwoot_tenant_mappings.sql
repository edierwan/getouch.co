-- 0010_chatwoot_tenant_mappings.sql
-- Portal control-plane metadata for Chatwoot tenant/account/inbox mapping.
-- Chatwoot runtime tables stay inside the Chatwoot database.

DO $$ BEGIN
  CREATE TYPE "chatwoot_tenant_mapping_status" AS ENUM ('pending', 'active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "chatwoot_tenant_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "chatwoot_account_id" integer NOT NULL,
  "chatwoot_inbox_id" integer,
  "status" "chatwoot_tenant_mapping_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "chatwoot_tenant_mappings_tenant_unique" UNIQUE ("tenant_id")
);

CREATE INDEX IF NOT EXISTS "chatwoot_tenant_mappings_account_idx" ON "chatwoot_tenant_mappings" ("chatwoot_account_id");
CREATE INDEX IF NOT EXISTS "chatwoot_tenant_mappings_status_idx" ON "chatwoot_tenant_mappings" ("status");