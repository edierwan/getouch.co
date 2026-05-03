# Platform Broker App Key and WhatsApp OTP

Date: 2026-05-02

## Scope

- Added dedicated portal-side `platform_app_keys` storage with one-way hashed keys.
- Extended App Access Control so app creation returns a one-time Platform App Key.
- Added Platform Broker routes for auth check, WhatsApp send message, and WhatsApp send OTP.
- Added admin rotation flow for Platform App Keys.
- Extended the App Access Control snapshot and UI with Platform Broker status, masked key status, and one-time key reveal/testing.

## Schema

- Added migration `drizzle/0016_platform_app_keys.sql`.
- New table: `platform_app_keys`.
- Stored fields: app link, name, key prefix, key hash, key last4, scopes, status, last used, revoked at, metadata, created at.
- Raw Platform App Keys are not stored.

## Auth Model

- Plaintext key format: `pk_<app_code>_<random>`.
- Hashing reuses the portal HMAC SHA-256 API key convention via `hashApiKey`.
- Broker auth accepts either `X-Platform-App-Key` or `Authorization: Bearer <key>`.
- Successful broker auth updates `platform_app_keys.last_used_at`.

## Broker Routes

- `POST /api/platform/auth/check`
- `POST /api/platform/whatsapp/send-message`
- `POST /api/platform/whatsapp/send-otp`

The broker currently routes WhatsApp traffic through the portal-controlled Evolution system sender and returns normalized JSON responses.

## Admin UI

- App creation now reveals one raw Platform App Key once.
- App overview now shows masked Platform App Key status and broker auth status.
- Added a `Platform Broker` tab with:
  - broker API base path
  - app key status
  - auth status
  - sender status for `Evolution / wapi-evo-system`
  - placeholder broker activity note
- Added Platform App Key rotation from the selected app workspace.

## Validation

- `npm exec tsc --noEmit` passed after each portal edit slice.
- `npm run build` passed.
- Live Coolify production source of truth came from the running `edierwan/getouch.co:main` container, whose `DATABASE_URL` resolves to host `getouch-postgres` and database `getouch.co`.
- Live `getouch.co` contains `platform_app_keys` with the expected primary key and secondary indexes.
- Live `wapi` does not contain `platform_app_keys`.
- Production currently has no Drizzle migration tracking table, so `drizzle/0016_platform_app_keys.sql` was applied idempotently as raw SQL against `getouch.co`.

## Production Cleanup

- Searched Coolify application env, shared env, service, and application records for `getouch.co.dev` and `getouch.co.stg`; no active references were found.
- Searched running Coolify-managed container envs for the same stale names; no active references were found.
- Dropped obsolete portal databases `getouch.co.dev` and `getouch.co.stg` after confirming their only active sessions were `pgAdmin 4` connections.
- `getouch.co` and `wapi` remain present on `getouch-postgres` after cleanup.

## Operator Note

- After migration, create or regenerate the WAPI Platform App Key from the portal admin UI, then run the broker auth check once so the UI can show `Connected`.