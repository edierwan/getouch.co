-- 0007_central_api_keys_pepper_metadata.sql
-- Adds hash algorithm/version metadata to central_api_keys so that the
-- pepper used at hash time is recorded alongside the hash. This enables
-- safe rotation of CENTRAL_API_KEY_PEPPER in the future without ambiguity.
--
-- IMPORTANT: AUTH_SECRET is no longer used as the central API key pepper.
-- The dedicated env var CENTRAL_API_KEY_PEPPER replaces it (with a
-- temporary AUTH_SECRET fallback in code for backward compatibility).
-- Rotating AUTH_SECRET MUST NOT invalidate central API keys.
--
-- Idempotent — safe to run multiple times.

ALTER TABLE "central_api_keys"
  ADD COLUMN IF NOT EXISTS "hash_algorithm" varchar(32) NOT NULL DEFAULT 'hmac-sha256';

ALTER TABLE "central_api_keys"
  ADD COLUMN IF NOT EXISTS "hash_version" integer NOT NULL DEFAULT 1;

ALTER TABLE "central_api_keys"
  ADD COLUMN IF NOT EXISTS "pepper_version" integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "central_api_keys_pepper_version_idx"
  ON "central_api_keys" ("pepper_version");
