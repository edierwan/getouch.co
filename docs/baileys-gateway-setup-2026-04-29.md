# Baileys Gateway Setup Status — 2026-04-29

## Applied

- Target database: `baileys`
- Migration applied: `drizzle/0009_baileys_init.sql`
- Migration re-run successfully to confirm idempotent `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` behavior.
- Runtime env standardized to `BAILEYS_DB_NAME=baileys` and `BAILEYS_DATABASE_URL=.../baileys`.
- Portal env standardized to `BAILEYS_DB_NAME=baileys` and `BAILEYS_DATABASE_URL=.../baileys`.
- Uppercase `Baileys` was deleted after live verification.

## Current live state

- Public endpoint: `https://wa.getouch.co`
- Current runtime: `baileys-gateway`
- Current runtime database: `baileys`
- Portal direct-read database: `baileys`
- Portal route: `https://portal.getouch.co/service-endpoints/baileys`
- Backup/rollback bundle kept at `/home/deploy/backups/baileys-cutover-20260429-035147`

## Validation

- `https://wa.getouch.co/healthz` now returns `service=baileys-gateway`, `runtimeMode=baileys`, and `database=baileys`.
- A live admin session smoke test wrote a temporary row to `baileys.sessions` and removed it cleanly.
- The portal host resolves `portal.getouch.co/service-endpoints/baileys` and the live portal container now points at `baileys`.

## Provider boundary

- Baileys Gateway is a WhatsApp service endpoint backed by PostgreSQL database `baileys`.
- Evolution API is a separate WhatsApp service endpoint backed by PostgreSQL database `evolution`.
- LINE and Telegram are not handled by Baileys or Evolution and need their own providers later.

## Notes

- API keys remain sourced from the central API key manager in the portal database.
- The Baileys runtime and the portal both use the lowercase service DB name going forward.