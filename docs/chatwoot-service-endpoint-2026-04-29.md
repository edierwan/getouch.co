# Chatwoot Service Endpoint - 2026-04-29

## Summary

- Native Chatwoot UI: https://chatwoot.getouch.co
- Portal control/status route: https://portal.getouch.co/service-endpoints/chatwoot
- Chatwoot runtime database: `chatwoot`
- Portal metadata table: `chatwoot_tenant_mappings` in the portal DB
- Deployment mode: standalone Docker Compose on the VPS, behind Caddy

## Pre-install Audit

### Old Chatwoot found

Yes. A legacy standalone Chatwoot deployment was already present on the VPS.

Observed runtime:

- Containers: `chatwoot-web`, `chatwoot-sidekiq`, `chatwoot-redis`
- Compose path: `/home/deploy/chatwoot/docker-compose.yml`
- Legacy volumes:
  - `chatwoot_chatwoot-storage`
  - `chatwoot_chatwoot-redis-data`
- Reverse proxy route already existed in Caddy for `chatwoot.getouch.co`
- Legacy runtime config pointed to the wrong frontend URL and legacy database name

Legacy database state:

- Required target DB `chatwoot` existed but was empty before fresh install
- Legacy DB `chat.getouch.co` contained the old Chatwoot tables and data
- Legacy counts at audit time:
  - `accounts = 1`
  - `users = 2`
  - `inboxes = 0`
  - `conversations = 0`
  - `contacts = 0`
  - `messages = 0`

Coolify audit:

- No Chatwoot-specific Coolify resource was found
- Chatwoot was not managed as a Coolify application

## Backup

Backup created before replacement:

- Directory: `/home/deploy/backups/chatwoot-pre-clean-20260429-061818`

Backup contents:

- `docker-compose.legacy.yml`
- `containers.txt`
- `networks.json`
- `chat.getouch.co.pgdump`
- `chatwoot-storage.tgz`
- `chatwoot-redis-data.tgz`
- `Caddyfile.before-chatwoot-proto-fix`

## Fresh Install Method

Fresh install was performed by replacing the legacy standalone compose stack in `/home/deploy/chatwoot`.

Key changes:

- Generated a new `SECRET_KEY_BASE`
- Moved secrets out of inline compose config into `/home/deploy/chatwoot/.env`
- Switched Chatwoot runtime DB from legacy `chat.getouch.co` to required `chatwoot`
- Updated `FRONTEND_URL` to `https://chatwoot.getouch.co`
- Removed direct host port publishing from Chatwoot web
- Kept Chatwoot reachable only through Caddy on the internal Docker networks
- Ran `bundle exec rails db:chatwoot_prepare` against the fresh `chatwoot` DB

Current compose-managed services:

- `chatwoot-web`
- `chatwoot-sidekiq`
- `chatwoot-redis`

Current live volumes:

- `chatwoot_chatwoot-storage-live`
- `chatwoot_chatwoot-redis-data-live`

Networks used:

- `getouch-edge`
- `coolify`

## Reverse Proxy / Routing

Public route:

- `chatwoot.getouch.co` -> `chatwoot-web:3000`

Important proxy fix applied:

- Added `header_up X-Forwarded-Proto https` to the Chatwoot Caddy block
- This fixed the redirect loop caused by `FORCE_SSL=true` behind Cloudflare + Caddy

Current public behavior:

- `https://chatwoot.getouch.co` redirects to `https://chatwoot.getouch.co/installation/onboarding`
- This is the expected fresh-install onboarding path

## Runtime Status After Install

Validated runtime state:

- `chatwoot-web`: running
- `chatwoot-sidekiq`: running
- `chatwoot-redis`: healthy
- `chatwoot` DB schema prepared: yes
- `chatwoot-web` host port binding: removed
- HTTPS via Caddy + Cloudflare: working

Chatwoot DB state after prepare:

- Public tables: 72
- `schema_migrations`: populated

## Admin Setup / Credentials

No default admin password was created or printed.

Credential handling model:

- Chatwoot is currently on the installation onboarding page
- Operator completes the first admin setup through the browser at `https://chatwoot.getouch.co/installation/onboarding`
- Password is chosen during onboarding and is not stored in git or included in this report
- `ENABLE_ACCOUNT_SIGNUP=false` remains set for the runtime; initial installation onboarding is still available on the fresh prepared instance

## Secrets / Env Names

Secrets are stored on the VPS in `/home/deploy/chatwoot/.env`, not in git.

Env names in use:

- `CHATWOOT_SECRET_KEY_BASE`
- `CHATWOOT_FRONTEND_URL`
- `CHATWOOT_INSTALLATION_NAME`
- `CHATWOOT_DATABASE_URL`
- `CHATWOOT_MAILER_SENDER_EMAIL`
- `CHATWOOT_ENABLE_ACCOUNT_SIGNUP`
- `CHATWOOT_DEFAULT_LOCALE`

Container env derived from those values:

- `SECRET_KEY_BASE`
- `FRONTEND_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `MAILER_SENDER_EMAIL`
- `ENABLE_ACCOUNT_SIGNUP`
- `FORCE_SSL`
- `ACTIVE_STORAGE_SERVICE`
- `RAILS_ENV`
- `NODE_ENV`

## Portal Control Plane

Portal implementation added in this repo:

- Sidebar entry for Chatwoot under Service Endpoints
- Route: `/service-endpoints/chatwoot`
- Title: `Chatwoot Support Inbox`
- Subtitle: `Customer support inbox and human handover service endpoint powered by Chatwoot.`

Displayed status areas:

- Chatwoot Status
- Public Endpoint
- Accounts / Inboxes
- Conversations
- Worker Status
- Last Health Check
- Service Information
- Runtime / Workers
- Future Tenant Mapping
- Recent Logs
- Human handover flow notes

The portal page uses live runtime introspection over SSH and does not fabricate Chatwoot metrics.

## Portal Metadata Table

Minimal control-plane table added:

- `chatwoot_tenant_mappings`

Columns:

- `id`
- `tenant_id`
- `chatwoot_account_id`
- `chatwoot_inbox_id`
- `status`
- `created_at`
- `updated_at`

Live status:

- Table applied to the portal DB on the VPS
- Current state is expected to be empty until Portal `tenant_id` mappings are introduced

## Multi-tenant Foundation

Intended mapping:

- Portal `tenant_id`
- Chatwoot `account_id`
- Optional Chatwoot `inbox_id`
- Later channel/provider assignment at the Getouch routing layer

Rules kept in this install:

- No new unrelated tenant IDs were introduced
- Chatwoot runtime data stays inside the `chatwoot` DB
- Portal/control metadata stays in the portal DB
- Tenant provisioning is not auto-created yet

## Future Handover Flow

Planned flow:

- WhatsApp message
- Baileys or Evolution Gateway
- Getouch routing / WAPI layer
- Dify bot if enabled
- Chatwoot when human handover is required
- Agent reply from Chatwoot
- Reply routed back through the selected WhatsApp provider

This task only prepared the architecture and control-plane surface. It did not implement full human handover routing.

## Manual Steps Still Required

1. Complete first-run onboarding at `https://chatwoot.getouch.co/installation/onboarding`.
2. Create the initial admin account in Chatwoot using the operator's chosen email and password.
3. Create the first Chatwoot account and inbox structure once the operator is ready.
4. Add Portal `tenant_id` mappings into `chatwoot_tenant_mappings` when tenant onboarding rules are finalized.
5. Commit and push the repo changes so the portal route becomes live in production.

## Rollback

Rollback path is straightforward because the legacy data was not destroyed.

1. Stop the new Chatwoot stack in `/home/deploy/chatwoot`.
2. Restore `/home/deploy/chatwoot/docker-compose.yml` from `/home/deploy/backups/chatwoot-pre-clean-20260429-061818/docker-compose.legacy.yml`.
3. If needed, restore the old Caddy block from `/home/deploy/backups/chatwoot-pre-clean-20260429-061818/Caddyfile.before-chatwoot-proto-fix`.
4. Bring the legacy stack back up.
5. If legacy runtime state must be restored, use:
   - `/home/deploy/backups/chatwoot-pre-clean-20260429-061818/chat.getouch.co.pgdump`
   - `/home/deploy/backups/chatwoot-pre-clean-20260429-061818/chatwoot-storage.tgz`
   - `/home/deploy/backups/chatwoot-pre-clean-20260429-061818/chatwoot-redis-data.tgz`

## Validation Notes

Validated directly on the VPS:

- Caddy route active for `chatwoot.getouch.co`
- `chatwoot-web`, `chatwoot-sidekiq`, `chatwoot-redis` running
- No direct host port binding on `chatwoot-web`
- Fresh `chatwoot` DB prepared
- Browser now lands on Chatwoot onboarding page instead of looping redirects

Pending after repo push/deploy:

- `https://portal.getouch.co/service-endpoints/chatwoot` live route validation
- cross-check existing portal service-endpoint pages after the new portal deployment rolls out