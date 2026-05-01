# GetTouch Web — Deployment Source of Truth (2026-05-01)

## Final state

- **Coolify application id 2** is the **sole runtime** for the Next.js portal.
  - Repo: `edierwan/getouch.co` branch `main`.
  - Image: `mqmo5bwkxysedbg7vvh6tk1f` (Coolify-built; managed UUID).
  - Network alias on `coolify` network: **`getouch-web-prod`** (port 3000).
  - Also attached to `getouch-edge` so Caddy can reach it.
- **Caddy** (compose service, mounted from `infra/Caddyfile`) is the only edge.
  All four production hostnames `reverse_proxy getouch-web-prod:3000`:
  - `getouch.co`
  - `portal.getouch.co`
  - `auth.getouch.co`
  - `mcp.getouch.co` (with `/api/mcp` rewrites)
  - `openclaw.getouch.co` (with `/connect`, `/reset`, `/chat` paths)
- **Coolify proxy is disabled** (`proxy_type=none`); Caddy continues to terminate
  via Cloudflare → `127.0.0.1:80` only.
- **Legacy compose `web` service** is profile-disabled
  (`profiles: [legacy-disabled]`) in `compose.yaml`. The service definition is
  preserved for emergency rollback only and is **not** started by `docker compose up`.

## Env source of truth

- `compose.yaml` `.env` (path: `/home/deploy/apps/getouch.co/.env`) is the
  authoritative source for runtime env values.
- Coolify `EnvironmentVariable` rows for Application id 2 are kept in sync via
  [`scripts/migrate-coolify-env.php`](../../scripts/migrate-coolify-env.php),
  run inside the `coolify` container.
- `AUTH_SECRET` is force-overwritten to the compose value (preserves sessions).
- Coolify-managed keys (`NODE_ENV`, `NIXPACKS_NODE_VERSION`) and pure-infra
  keys (admin/pgadmin/cloudflared/searxng) are not authoritative for the web
  app but were copied so the Coolify app sees identical env to the legacy
  container; harmless if unused.

## Deploy workflow

1. Push to `edierwan/getouch.co` `main` →
2. Coolify GitHub webhook auto-builds and deploys.
3. Verify via `curl https://portal.getouch.co/api/build-info` and confirm the
   `commit` field matches the pushed SHA.

### Manual redeploy (no UI)

```bash
ssh deploy@100.84.14.93
docker exec coolify php artisan tinker --execute='
use App\Models\Application;
use Illuminate\Support\Str;
$a = Application::find(2);
$u = (string) Str::uuid();
queue_application_deployment(application: $a, deployment_uuid: $u, force_rebuild: true, no_questions_asked: true);
'
```

## Rollback (emergency)

If Coolify is unavailable, restore the legacy compose path:

```bash
ssh deploy@100.84.14.93
cd /home/deploy/apps/getouch.co
# 1. Re-enable legacy web by removing the `profiles: [legacy-disabled]` line
sed -i.bak '/^  web:/,/^    env_file:/{/profiles:/d;/- legacy-disabled/d;/Retired 2026-05-01/d;/Coolify application id 2/d;/the sole runtime/d;/under the .legacy-disabled. profile/d;/See docs.ops.deployment-source-of-truth/d}' compose.yaml
# 2. Restore caddy to legacy upstream
docker exec caddy cp /etc/caddy/Caddyfile.backup-before-coolify-migration-* /etc/caddy/Caddyfile
docker kill -s SIGUSR1 caddy
# 3. Bring legacy back
docker compose build web && docker compose up -d web
```

The Caddyfile backup created during cutover lives at
`/etc/caddy/Caddyfile.backup-before-coolify-migration-<TS>` inside the caddy
container.

## Verification commands

```bash
# Coolify env keys for the app
docker exec coolify php artisan tinker --execute='
use App\Models\Application;
$a = Application::find(2);
foreach ($a->environment_variables as $ev) echo $ev->key . PHP_EOL;
'

# Caddy upstream check (no public traffic)
docker exec caddy sh -lc 'wget -qO- --header="Host: portal.getouch.co" http://getouch-web-prod:3000/api/build-info'
```
