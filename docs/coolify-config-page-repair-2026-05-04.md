# Coolify Config Page Repair - 2026-05-04

## Scope

- Host: `deploy@100.84.14.93`
- Coolify application UUID: `mqmo5bwkxysedbg7vvh6tk1f`
- Coolify application id: `2`
- Coolify environment id: `3`
- Coolify project id: `3`

## Root Cause

The Coolify application configuration page was failing because the application view tree reads environment variable values through Coolify's `App\Models\EnvironmentVariable` accessor, which always decrypts non-literal values before returning them.

The failing stack in `laravel.log` showed:

- view: `resources/views/livewire/project/application/configuration.blade.php`
- model path: `App\Models\EnvironmentVariable::value()`
- decrypt path: `Illuminate\Encryption\Encrypter::decrypt()`
- error: `unserialize(): Error at offset 0 of 17 bytes`

The concrete bad records were the manually inserted LiteLLM rows in `environment_variables` for application id `2`:

- id `541` / key `GETOUCH_LITELLM_API_KEY`
- id `542` / key `GETOUCH_LITELLM_BASE_URL`
- id `543` / key `GETOUCH_LITELLM_MODEL_ALIAS`

Those rows had previously been inserted as plaintext while marked as non-literal, which is incompatible with Coolify's encrypted storage rules for `environment_variables.value`.

## Backup

Created before the official-compatible rewrite:

- `/home/deploy/backups/coolify/coolify-20260503-231209.sql.gz`

## What Was Done

1. Captured the real stack trace from the Coolify container log and confirmed the failing code path was `EnvironmentVariable` decryption, not a generic Blade issue.
2. Confirmed the URL resource `application/mqmo5bwkxysedbg7vvh6tk1f` maps to Coolify application id `2`.
3. Scanned application env rows and related env tables without printing secrets.
4. Re-saved the three LiteLLM env rows through Coolify's own application model relation and mutators so encryption is handled by Coolify itself, not by direct SQL updates.
5. Cleared Coolify caches with `php artisan optimize:clear`.

The env rewrite was done through Coolify's model path on the server, preserving the same keys and record ids:

- id `541` / `GETOUCH_LITELLM_API_KEY`
- id `542` / `GETOUCH_LITELLM_BASE_URL`
- id `543` / `GETOUCH_LITELLM_MODEL_ALIAS`

## Commands Used

High-level command set used during the repair:

- `docker exec coolify ... grep ... laravel.log`
- `docker exec -i coolify php <<'PHP' ... PHP`
- `docker exec coolify php artisan optimize:clear`
- `docker exec coolify-db ... pg_dump ... > /home/deploy/backups/coolify/...sql.gz`

No secrets were printed during the repair.

## Verification

Post-repair checks completed:

- The real Coolify configuration route for this application returned HTTP `200` through Laravel's HTTP kernel.
- The three LiteLLM env rows are present and decryptable.
- No remaining non-decryptable related env rows were found in the scanned tables.
- The deployed `getouch.co` application container `mqmo5bwkxysedbg7vvh6tk1f` remained `Up` and `healthy`.
- No new `unserialize(): Error at offset 0 of 17 bytes` entries were generated after the repair flow.

## Operator Note

- Do not insert Coolify non-literal env rows directly as plaintext.
- For Coolify-managed env values, use the Coolify UI or Coolify's own model/helper path so `value` is encrypted correctly.
- Future one-off app env updates should use [`scripts/set-coolify-app-env.php`](../scripts/set-coolify-app-env.php) inside the `coolify` container instead of raw SQL or direct table inserts.

### Safe Setter Follow-Up

Added a reusable helper at [`scripts/set-coolify-app-env.php`](../scripts/set-coolify-app-env.php).

Properties:

- Resolves the app by Coolify app id or app uuid.
- Targets the exact `key` + preview/build-time row.
- Writes through Coolify's own `Application` / `EnvironmentVariable` model path.
- Preserves encryption semantics for non-literal values.
- Never prints the env value.

Example:

```bash
docker cp scripts/set-coolify-app-env.php coolify:/tmp/set-coolify-app-env.php
printf '%s' "$GETOUCH_LITELLM_API_KEY" | docker exec -i coolify php /tmp/set-coolify-app-env.php \
	--app-id 2 \
	--key GETOUCH_LITELLM_API_KEY \
	--stdin
```

## Why No Container Restart Was Forced

`php artisan optimize:clear` was enough for this repair. A Coolify container restart was not required because the real configuration route was already returning HTTP `200` after the model-based env rewrite, and avoiding unnecessary restarts reduced platform disruption.