# Scheduled Restart Cleanup Audit

Date: 2026-04-30
Scope: remove the Scheduled Restart feature from the portal application without applying any SQL or host reboot actions.

## Removed from application code

Files deleted:
- `app/admin/scheduled-restart/page.tsx`
- `app/admin/scheduled-restart/ScheduledRestartConsole.tsx`
- `app/api/admin/scheduled-restart/route.ts`
- `app/api/admin/scheduled-restart/test/route.ts`
- `lib/scheduled-restart.ts`

Routes removed:
- `/admin/scheduled-restart`
- `/api/admin/scheduled-restart`
- `/api/admin/scheduled-restart/test`

## Modified application surfaces

Files updated:
- `app/admin/data.ts`
  - Removed the Monitoring sidebar entry for Scheduled Restart.
- `lib/schema.ts`
  - Removed the exported schema objects for scheduled restart tables and enum from application code.
- `lib/ai-runtime.ts`
  - Removed the legacy `SCHEDULED_RESTART_SSH_TARGET` fallback.
- `lib/service-endpoints-vllm.ts`
  - Removed the legacy `SCHEDULED_RESTART_SSH_TARGET` fallback.
- `lib/service-endpoints-chatwoot.ts`
  - Removed the legacy `SCHEDULED_RESTART_SSH_TARGET` fallback.
- `lib/infrastructure.ts`
  - Removed the legacy `SCHEDULED_RESTART_SSH_TARGET` fallback.
- `lib/unexpected-shutdown.ts`
  - Removed legacy `SCHEDULED_RESTART_TARGET_HOST`, `SCHEDULED_RESTART_TARGET_LABEL`, and `SCHEDULED_RESTART_SSH_TARGET` fallbacks.

## Environment variables no longer needed

These names should no longer be required by the portal application:
- `SCHEDULED_RESTART_TARGET_HOST`
- `SCHEDULED_RESTART_TARGET_LABEL`
- `SCHEDULED_RESTART_SSH_TARGET`
- `SCHEDULED_RESTART_REMOTE_DIR`

If any deployment secrets or Coolify variables still define them, they can be removed in a separate configuration cleanup.

## Host-level audit findings

Read-only checks performed on `deploy@100.84.14.93`:
- Deploy-user `crontab -l` had no matching scheduled restart entry.
- `systemctl list-unit-files` showed only generic OS reboot/shutdown units; no custom Getouch scheduled restart unit was found.
- Historical references were still visible in the host-side repo working tree and git logs before redeploy. Those are not active runtime hooks and were not mutated as part of this cleanup.

## Intentionally not removed

These items remain on purpose:
- `drizzle/0005_scheduled_restarts.sql`
  - Preserved as migration history.
- Existing live database tables / enum created by that migration
  - Left untouched because SQL and database changes were explicitly out of scope.
- Historical git metadata on the host
  - Not rewritten because that would be unrelated and potentially destructive.

## Verification completed

Completed checks:
- Removed page, API, and backend feature files from the clean deploy worktree.
- Removed sidebar navigation entry.
- Removed application-level schema exports.
- Removed leftover `SCHEDULED_RESTART_*` env fallbacks from unrelated infrastructure modules.
- `npx tsc --noEmit --pretty false` passed after the cleanup.

Recommended post-deploy verification:
- Confirm the Monitoring sidebar no longer shows Scheduled Restart.
- Confirm `/admin/scheduled-restart` returns a non-feature page state instead of the old UI.
- Confirm `/api/admin/scheduled-restart` and `/api/admin/scheduled-restart/test` are no longer served by the app.