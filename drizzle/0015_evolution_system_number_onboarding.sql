DO $$
BEGIN
  CREATE TYPE "evolution_session_purpose" AS ENUM ('system', 'customer_chat', 'support', 'sales');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "evolution_session_status" ADD VALUE IF NOT EXISTS 'pending_connection';

ALTER TABLE "evolution_tenant_bindings"
  ADD COLUMN IF NOT EXISTS "source_app" varchar(40);

UPDATE "evolution_tenant_bindings"
SET "source_app" = CASE
  WHEN "tenant_key" = 'getouch-internal' THEN 'system'
  ELSE 'portal'
END
WHERE "source_app" IS NULL;

ALTER TABLE "evolution_sessions"
  ADD COLUMN IF NOT EXISTS "display_label" varchar(160),
  ADD COLUMN IF NOT EXISTS "purpose" "evolution_session_purpose",
  ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "bot_enabled" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "human_handoff_enabled" boolean DEFAULT true;

UPDATE "evolution_sessions"
SET "purpose" = CASE
  WHEN "tenant_id" IN (
    SELECT "tenant_id"
    FROM "evolution_tenant_bindings"
    WHERE "tenant_key" = 'getouch-internal'
  )
  AND (
    "session_name" = 'system-main'
    OR "session_name" LIKE '%-system'
    OR coalesce("display_label", '') = 'System Notification Number'
  )
  THEN 'system'::"evolution_session_purpose"
  ELSE 'customer_chat'::"evolution_session_purpose"
END
WHERE "purpose" IS NULL;

UPDATE "evolution_sessions"
SET "display_label" = CASE
  WHEN "purpose" = 'system' THEN 'System Notification Number'
  WHEN "session_name" LIKE '%-main' THEN 'Main WhatsApp Number'
  ELSE initcap(replace("session_name", '-', ' '))
END
WHERE "display_label" IS NULL;

UPDATE "evolution_sessions"
SET "status" = 'pending_connection'
WHERE "status" = 'qr_pending';

ALTER TABLE "evolution_sessions"
  ALTER COLUMN "purpose" SET DEFAULT 'customer_chat',
  ALTER COLUMN "purpose" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'pending_connection',
  ALTER COLUMN "is_default" SET DEFAULT false,
  ALTER COLUMN "is_default" SET NOT NULL,
  ALTER COLUMN "bot_enabled" SET DEFAULT true,
  ALTER COLUMN "bot_enabled" SET NOT NULL,
  ALTER COLUMN "human_handoff_enabled" SET DEFAULT true,
  ALTER COLUMN "human_handoff_enabled" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "evolution_sessions_purpose_idx"
  ON "evolution_sessions" ("purpose");