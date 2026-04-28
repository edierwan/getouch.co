# Baileys Gateway Setup Status — 2026-04-29

## Applied

- Target database: `Baileys`
- Migration applied: `drizzle/0009_baileys_init.sql`
- Migration re-run successfully to confirm idempotent `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` behavior.

## Current live state

- Public endpoint: `https://wa.getouch.co`
- Current runtime: legacy `getouch-wa`
- Current runtime database: legacy runtime-managed tables in `getouch.co`
- New `Baileys` database: initialized and readable from the portal
- Portal route: `https://portal.getouch.co/service-endpoints/baileys`

## What the portal now does

- Sessions / QR / pairing / reconnect / send-test are proxied to the live legacy runtime.
- API keys remain sourced from the central API key manager in the portal database.
- The portal also reads the new `Baileys` database directly for:
  - tenants
  - webhooks
  - templates
  - messages
  - events
  - send logs
- When the new `Baileys` database is empty, the portal shows truthful empty states instead of fake seed data.

## Cutover blocker

The current `services/wa` runtime is not yet compatible with the new `Baileys` schema.

It still initializes and queries its own legacy tables from `DATABASE_URL`:

- `message_log`
- `event_log`
- `api_keys`
- `connected_apps`
- `admin_settings`

Because of that, pointing the existing runtime directly at `Baileys` would not make it use the new schema. A safe cutover requires either:

1. Updating `services/wa` to read/write the new `Baileys` tables, or
2. Replacing `services/wa` with a new Baileys runtime that targets `Baileys` natively.

## Rollback

- Keep `getouch-wa` unchanged until a replacement runtime is verified.
- Keep the `wa.getouch.co` Caddy route pointed at the current runtime until the new runtime passes validation.
- The `Baileys` database schema can remain in place even if runtime cutover is deferred.

## Deferred

- Runtime cutover from `getouch-wa` to a schema-compatible Baileys service
- Legacy DB retirement (`wapi`, `wapi.dev`) — not started
- Legacy runtime retirement — not started