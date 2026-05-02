# GetTouch Web — Deployment Source of Truth (2026-05-01)

## Final state

- **Coolify application id 2** is the **sole runtime** for the Next.js portal.
  - Repo: `edierwan/getouch.co` branch `main`.
  - Image: `mqmo5bwkxysedbg7vvh6tk1f` (Coolify-built; managed UUID).
  - Stable upstream on the `coolify` network: **`getouch-coolify-app`** (port 3000).
- **Caddy** (compose service, mounted from `infra/Caddyfile`) is the only edge.
  All portal hostnames `reverse_proxy getouch-coolify-app:3000`:
  - `getouch.co`
  - `portal.getouch.co`
  - `auth.getouch.co`
  - `mcp.getouch.co` (with `/api/mcp` rewrites)
  - `openclaw.getouch.co` (with `/connect`, `/reset`, `/chat` paths)
- Additional service hostnames such as `sso.getouch.co`, `infisical.getouch.co`,
  `langfuse.getouch.co`, `litellm.getouch.co`, and `qdrant.getouch.co` are also
  defined in `infra/Caddyfile`, but they are service routes, not a compose-hosted
  portal fallback.
- **Coolify proxy is disabled** (`proxy_type=none`); Caddy continues to terminate
  via Cloudflare → `127.0.0.1:80` only.
- The old compose-hosted portal runtime has been removed from `compose.yaml`.
  There is no compose fallback path for the Next.js portal.
- The retired names `getouch-web` and `getouch-web-prod` are forbidden in active
  containers, network aliases, Caddy routes, and deploy scripts.

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
- Retired portal names must not be reintroduced in routes, docs, or verifiers.

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

There is no supported rollback to a compose-hosted portal runtime.

If a portal rollback is required, do one of these instead:

1. Redeploy the previous Git commit through Coolify application id 2.
2. Restore the previous Caddy config only if the active config is wrong, then
  reload Caddy safely with `docker kill -s SIGUSR1 caddy`.
3. Reconcile env values in Coolify and redeploy the same application.

## Verification commands

```bash
# Guard against any legacy compose-served portal path.
bash scripts/verify-no-legacy-web.sh

# Coolify env keys for the app
docker exec coolify php artisan tinker --execute='
use App\Models\Application;
$a = Application::find(2);
foreach ($a->environment_variables as $ev) echo $ev->key . PHP_EOL;
'

# Caddy upstream check (no public traffic)
docker exec caddy sh -lc 'wget -qO- --header="Host: portal.getouch.co" http://getouch-coolify-app:3000/api/build-info'
```
