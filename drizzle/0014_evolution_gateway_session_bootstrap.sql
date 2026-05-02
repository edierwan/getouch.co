ALTER TABLE "evolution_tenant_bindings"
  ADD COLUMN IF NOT EXISTS "tenant_key" varchar(160);

UPDATE "evolution_tenant_bindings"
SET "tenant_key" = CASE
  WHEN lower(coalesce("tenant_name", '')) = 'gettouch internal' THEN 'getouch-internal'
  ELSE concat(
    trim(both '-' from regexp_replace(lower(coalesce(nullif("tenant_name", ''), 'tenant')), '[^a-z0-9]+', '-', 'g')),
    '-',
    substr(replace("tenant_id"::text, '-', ''), 1, 8)
  )
END
WHERE "tenant_key" IS NULL;

INSERT INTO "evolution_tenant_bindings" (
  "tenant_id",
  "tenant_key",
  "tenant_name",
  "tenant_domain",
  "instance_id",
  "default_session_id",
  "plan",
  "status",
  "metadata"
)
SELECT
  gen_random_uuid(),
  'getouch-internal',
  'GetTouch Internal',
  NULL,
  NULL,
  NULL,
  'trial',
  'active',
  '{"internal": true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM "evolution_tenant_bindings"
  WHERE "tenant_key" = 'getouch-internal'
);

ALTER TABLE "evolution_tenant_bindings"
  ALTER COLUMN "tenant_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "evolution_tenant_bindings_tenant_key_unique"
  ON "evolution_tenant_bindings" ("tenant_key");

ALTER TABLE "evolution_sessions"
  ADD COLUMN IF NOT EXISTS "paired_number" varchar(40),
  ADD COLUMN IF NOT EXISTS "last_qr_at" timestamp with time zone;

UPDATE "evolution_settings"
SET "default_webhook_events" = (
  SELECT jsonb_agg(
    CASE
      WHEN value = 'qr.updated' THEN 'qrcode.updated'
      ELSE value
    END
  )
  FROM jsonb_array_elements_text(coalesce("default_webhook_events", '[]'::jsonb)) AS value
)
WHERE "default_webhook_events"::text LIKE '%qr.updated%';