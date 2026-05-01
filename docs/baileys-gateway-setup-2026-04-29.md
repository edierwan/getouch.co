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

## 2026-05-01 — Portal portal status fix

- Root cause of "Runtime unreachable: fetch failed" + lingering "legacy
  getouch-wa" UI text: the portal container had no `WA_URL` env, so the proxy
  helper fell back to `http://wa:3001`. The legacy container `getouch-wa`
  is stopped (Exited 137) but its DNS reservation for the alias `wa` still
  lingered in the embedded Docker resolver, so the hostname resolved but
  port 3001 was refused. The new runtime is reachable internally as
  `http://baileys-gateway:3001` on the `getouch-edge` network.
- Additional production finding: `portal.getouch.co` is served by the
  compose-managed `getouch-web` service behind the repo Caddy instance,
  not the separate Coolify `getouch.co` app container. Updating the Coolify
  app alone does not change the admin portal page.
- Compose fix applied in repo: the Caddy service no longer claims the
  `wa` / `baileys-gateway` aliases on the shared `edge` network, and the real
  `getouch-web` service now receives explicit `WA_URL`, `WA_PUBLIC_URL`,
  `BAILEYS_DB_NAME`, and `BAILEYS_DATABASE_URL` values.
- Fix:
  - Default for `WA_URL` switched to `http://baileys-gateway:3001` in
    `app/api/admin/service-endpoints/baileys/_helpers.ts` and `lib/wa.ts`.
  - All "legacy getouch-wa" / "Cutover blocker" / "Legacy Runtime" labels
    removed from the portal Baileys console and route. Runtime mode is now
    treated as `baileys` unconditionally; banners surface a fresh-runtime
    "Online" panel when reachable and a sanitized "Baileys runtime
    unreachable" diagnostic (with internal URL only) when not.
  - Pairing-code path no longer carries the legacy default-session-only
    fallback; it proxies straight to the runtime.
- Auth: runtime expects `X-API-Key: $WA_API_KEY` for `/api/*` routes and
  `X-Admin-Key: $WA_ADMIN_KEY` (falling back to `WA_API_KEY`) for `/admin/*`
  routes. The portal proxy helper picks the correct header per path.
- Verified `https://wa.getouch.co/healthz` returns
  `service=baileys-gateway`, `runtimeMode=baileys`, `database=baileys`.
- Internal reachability from the portal container:
  - `wget -O- http://baileys-gateway:3001/healthz` → 200 OK
  - `wget -O- http://wa:3001/healthz` → connection refused (legacy alias)
- Optional follow-up: set `WA_URL=http://baileys-gateway:3001` and
  `WA_PUBLIC_URL=https://wa.getouch.co` explicitly in the portal Coolify
  env. With the new code default this is no longer required to function.