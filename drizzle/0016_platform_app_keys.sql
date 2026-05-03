CREATE TABLE IF NOT EXISTS "platform_app_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "platform_apps"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "key_last4" text NOT NULL,
  "scopes" jsonb DEFAULT '["platform:*"]'::jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_used_at" timestamptz,
  "revoked_at" timestamptz,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_app_keys_key_hash_idx"
  ON "platform_app_keys" ("key_hash");

CREATE INDEX IF NOT EXISTS "platform_app_keys_app_idx"
  ON "platform_app_keys" ("app_id");

CREATE INDEX IF NOT EXISTS "platform_app_keys_status_idx"
  ON "platform_app_keys" ("status");