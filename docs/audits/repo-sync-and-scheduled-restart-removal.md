# Repo Sync And Scheduled Restart Removal

Date: 2026-04-30

## 1. Git sync summary

- Previous branch: `main`
- Synced branch: `main`
- Origin/main commit: `d8821bd04bc2125dd183d2da2ced8f69bc808795`
- Local commit after sync: `d8821bd04bc2125dd183d2da2ced8f69bc808795`
- Backup branch created: `backup/pre-main-sync-20260430-2307`
- Backup snapshot commit: `4c87d48`
- Drift resolved: yes

Notes:

- Before sync, local `main` was dirty and diverged from `origin/main`.
- A safety snapshot branch was created before resetting local `main` to `origin/main`.
- The local-only object-storage work that was not yet pushed was preserved on the backup branch and was not discarded.

## 2. Files removed

- `docs/audits/remove-scheduled-restart-cleanup.md`

Notes:

- No additional application source files needed removal in this task because synced `origin/main` already had the Scheduled Restart page, API routes, and backend module removed.

## 3. Files modified

- `docs/audits/repo-sync-and-scheduled-restart-removal.md`

## 4. Routes removed

These feature routes are no longer present in the synced application source tree:

- `/admin/scheduled-restart`
- `/api/admin/scheduled-restart`
- `/api/admin/scheduled-restart/test`

Alias checks:

- `/scheduled-restart` is not defined in current source.
- `/monitoring/scheduled-restart` is not defined in current source.

## 5. API endpoints removed

- `/api/admin/scheduled-restart`
- `/api/admin/scheduled-restart/test`

## 6. Env vars removed / no longer used

No active application source references remain for these legacy variables:

- `SCHEDULED_RESTART_TARGET_HOST`
- `SCHEDULED_RESTART_TARGET_LABEL`
- `SCHEDULED_RESTART_SSH_TARGET`
- `SCHEDULED_RESTART_REMOTE_DIR`

Searches also found no active source references for:

- `PORTAL_RESTART_*`
- `PORTAL_SCHEDULED_RESTART_*`

## 7. DB/schema objects found

Active TypeScript model status:

- No active Scheduled Restart schema exports remain in `lib/schema.ts`.
- The stale Scheduled Restart section comment in `lib/schema.ts` was removed during this cleanup pass.
- No Scheduled Restart route or backend module files remain in `app/` or `lib/`.

Historical database artifacts found:

- Migration file: `drizzle/0005_scheduled_restarts.sql`
- Enum: `scheduled_restart_type`
- Table: `scheduled_restarts`
- Columns in `scheduled_restarts`:
  - `id`
  - `target_host`
  - `target_label`
  - `enabled`
  - `schedule_type`
  - `timezone`
  - `one_time_at`
  - `daily_time`
  - `weekly_day`
  - `weekly_time`
  - `note`
  - `next_run_at`
  - `last_applied_at`
  - `last_applied_by`
  - `last_remote_status`
  - `last_remote_message`
  - `last_remote_sync_at`
  - `metadata`
  - `created_at`
  - `updated_at`
- Index: `scheduled_restarts_target_host_idx`
- Table: `scheduled_restart_logs`
- Columns in `scheduled_restart_logs`:
  - `id`
  - `restart_id`
  - `target_host`
  - `event_type`
  - `status`
  - `summary`
  - `details`
  - `actor_email`
  - `source`
  - `created_at`
- Indexes:
  - `scheduled_restart_logs_target_host_idx`
  - `scheduled_restart_logs_created_at_idx`

DB cleanup pending approval: yes

Proposed SQL only, not executed:

```sql
DROP TABLE IF EXISTS scheduled_restart_logs;
DROP TABLE IF EXISTS scheduled_restarts;
DROP TYPE IF EXISTS scheduled_restart_type;
```

## 8. Verification results

Grep results summary:

- No active Scheduled Restart references remain in current `app/` or `lib/` source.
- No active Scheduled Restart navigation entry remains in `app/admin/data.ts`.
- No active env fallback references remain for `SCHEDULED_RESTART_*` in application source.
- Remaining references after cleanup are limited to:
  - historical migration file `drizzle/0005_scheduled_restarts.sql`
  - this report file

Lint result:

- `npm run lint` is not available in this repository because `package.json` does not define a `lint` script.

Typecheck result:

- Initial `npx tsc --noEmit` failed against stale generated `.next/types` from the pre-sync build state.
- `npm run build` regenerated the Next.js route/type artifacts.
- Final `npx tsc --noEmit` passed.

Build result:

- `npm run build` passed

Route verification summary:

- Scheduled Restart route files are absent from the synced source tree.
- Post-build route manifest checks show no `/admin/scheduled-restart`, `/api/admin/scheduled-restart`, or `/api/admin/scheduled-restart/test` entries.

Safety constraints honored:

- No VPS reboot, shutdown, or restart was triggered as part of Scheduled Restart cleanup.
- No Scheduled Restart dry test was run.
- No live SQL was executed.

## 9. What was intentionally not removed and why

- `drizzle/0005_scheduled_restarts.sql` was retained because it is historical migration state and deleting migration history would be a separate, riskier repo-history decision.
- Existing live database objects were not modified because database cleanup requires explicit approval and SQL execution was out of scope.
- The backup branch `backup/pre-main-sync-20260430-2307` was intentionally retained so the pre-sync local state can be recovered or cherry-picked later if needed.