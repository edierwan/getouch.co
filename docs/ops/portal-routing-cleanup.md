# Portal Routing Cleanup — Audit (2026-05-01)

> **Status: Phase 1 (audit) only. No destructive action has been taken.
> Decision required from the operator before continuing.**

## TL;DR

The premise stated in the cleanup task — "Coolify is already serving
`getouch.co` and only `portal.getouch.co` is wrong" — is **incorrect**.
The audit found:

1. **Caddy never points to the Coolify container for any hostname.**
   The Coolify-managed container `mqmo5bwkxysedbg7vvh6tk1f-180422032576`
   is running, healthy, and serving the latest commit (`ab69e39`), but
   it is not wired into Caddy at all. It is effectively idle.
2. **`getouch-web:3000` (the docker-compose `web` service) serves
   every public Next.js hostname**, not just `portal.getouch.co`:
   `getouch.co`, `portal.getouch.co`, `mcp.getouch.co`,
   `openclaw.getouch.co`, plus internal redirects.
3. **Caddy itself is part of the same compose project** (`getouchco`,
   defined in `/home/deploy/apps/getouch.co/compose.yaml`), as are
   `voice-fusionpbx`, `voice-freeswitch`, `getouch-postgres`,
   `prometheus`, `grafana`, `ollama`, `open-webui`, `searxng`,
   SeaweedFS, `baileys-gateway`, `openclaw-gateway`, `pgadmin`,
   `filestash`, and `pipelines`. Running `docker compose down` from
   that directory would take all 22 services offline — including the
   PBX, FreeSWITCH, Prometheus, and the edge proxy.
4. **Coolify app id 2 is redundant**, not authoritative. Caddy never
   reaches it.

Therefore the task as written would either be a no-op (removing a
Caddy entry that points to the upstream that actually serves
production) or catastrophic (taking down `getouch.co`,
`mcp.getouch.co`, `openclaw.getouch.co`, voice, monitoring, and
storage at once).

## Phase 1 audit findings

### Container map

| Container | Image | Compose project | Role |
|-----------|-------|-----------------|------|
| `getouch-web` | `getouchco-web` | `getouchco` (`/home/deploy/apps/getouch.co/compose.yaml`) | **Production Next.js for `getouch.co`, `portal.getouch.co`, `mcp.getouch.co`, `openclaw.getouch.co`** |
| `mqmo5bwkxysedbg7vvh6tk1f-180422032576` | `mqmo5bwkxysedbg7vvh6tk1f:ab69e39…` | `mqmo5bwkxysedbg7vvh6tk1f` (Coolify artifact) | Coolify-managed Next.js, healthy, **not routed to by Caddy** |
| `caddy` | `caddy:2-alpine` | `getouchco` | Edge proxy for all `*.getouch.co` HTTP virtual hosts |
| `voice-fusionpbx`, `voice-freeswitch` | — | `getouchco` | Voice service endpoint backend |
| `getouch-postgres` | `postgres:16-alpine` | `getouchco` | App + voice + portal database |
| `baileys-gateway`, `openclaw-gateway` | — | `getouchco` | WhatsApp + chat gateways |
| `prometheus`, `grafana`, `node-exporter`, `cadvisor`, `blackbox-exporter`, `dcgm-exporter` | — | `getouchco` | Monitoring stack |
| `ollama`, `open-webui`, `pipelines`, `searxng`, `seaweed-*`, `pgadmin`, `filestash` | — | `getouchco` | AI / search / storage / admin |
| `coolify`, `coolify-realtime`, `coolify-db`, `coolify-redis`, `coolify-sentinel` | coollabsio/* | (unrelated) | Coolify control plane |

`docker compose ls` confirms compose project `getouchco` has
**22 running services** sharing this lifecycle.

### Caddy upstream map (relevant excerpt)

| Public hostname | Caddy upstream | Backed by |
|-----------------|----------------|-----------|
| `getouch.co` | `getouch-web:3000` | compose `web` |
| `portal.getouch.co` | `getouch-web:3000` | compose `web` |
| `mcp.getouch.co` | `getouch-web:3000` (rewrites `/mcp` → `/api/mcp`) | compose `web` |
| `openclaw.getouch.co` | `getouch-web:3000` (multiple route handlers) | compose `web` |
| `dev.getouch.co` | `getouch-web-dev:3000` | container does not exist |
| `stg.getouch.co` | `getouch-web-stg:3000` | container does not exist |
| `vllm.getouch.co` | `getouch-web-prod:3000` (only `/v1/*`, `/health`, `/ready`) | container does not exist (route currently broken) |
| `news.getouch.co` | `news-web:3000` | unaffected |
| `chatwoot.getouch.co` | `chatwoot-web:3000` | unaffected |
| `grafana.getouch.co` | `grafana:3000` | unaffected |
| `analytics.getouch.co` | `umami:3000` | unaffected |

The Caddyfile is mounted read-only from
`/home/deploy/apps/getouch.co/infra/Caddyfile`.

### Live state of Coolify app id 2

- Container name: `mqmo5bwkxysedbg7vvh6tk1f-180422032576`
- Image tag: `mqmo5bwkxysedbg7vvh6tk1f:ab69e39888f2e3f9e9ad93419e7a5b20847f9068`
  (matches latest `origin/main`)
- Status: `Up 7 hours (healthy)`
- Internal port: `3000/tcp` only — **no Caddy upstream points to it**
- Compose file: `/artifacts/vtp36p0w00dcqdiwaex4h00t/docker-compose.yaml`

### What `portal.getouch.co` is actually serving right now

After today's earlier rebuild, `getouch-web` runs build
`QmAI9OTg8h4sbSE_iVAhP` (commit `ab69e39`, pulled and rebuilt at the
operator's request). The Coolify container is on the same commit but
serving zero traffic.

### What would happen under the proposed Phase 4

> "Stop the old docker-compose service: `cd /home/deploy/apps/getouch.co && docker compose down`"

That single command would stop **all 22 services** in the `getouchco`
compose project, including:

- `caddy` → all `*.getouch.co` traffic dies (edge proxy gone)
- `voice-fusionpbx`, `voice-freeswitch` → PBX outage
- `getouch-postgres` → portal, voice, baileys, all lose their DB
- `prometheus`, `grafana`, `node-exporter` → monitoring blackout
- `baileys-gateway`, `openclaw-gateway` → messaging outage
- `ollama`, `open-webui`, `searxng`, `seaweedfs`, `pgadmin`,
  `filestash`, `pipelines`

That is unacceptable, so Phase 4 as written must not be executed.

### Why pushes to GitHub did not update `portal.getouch.co`

The Coolify webhook builds the Coolify-managed container on every
push to `main`, but no Caddy host points there. The compose `web`
container only updates when the operator runs:

```bash
cd /home/deploy/apps/getouch.co
git pull --ff-only origin main
docker compose build web
docker compose up -d web
```

This is the workflow that was just executed manually. Until either
the deploy hook is automated or Caddy is re-pointed at Coolify, push
≠ deploy for `portal.getouch.co` (or any `*.getouch.co` Next.js
hostname).

## Decision required

Three viable paths exist. **Each is a real change with real
trade-offs.** Pick one before I continue.

### Option A — Keep compose authoritative, automate deploys *(recommended, low risk)*

- Compose project `getouchco` continues to own `caddy`, `web`, voice,
  postgres, monitoring, etc.
- Add a server-side post-receive hook (or a tiny systemd path unit
  watching `git fetch`) that runs `git pull && docker compose build web
  && docker compose up -d web` whenever `origin/main` advances.
- Decommission Coolify app id 2 entirely (it is the redundant piece
  causing confusion). Remove the application from the Coolify UI;
  this stops the GitHub webhook target.
- Caddyfile changes: remove the dead `dev.getouch.co`,
  `stg.getouch.co`, and `vllm.getouch.co → getouch-web-prod:3000`
  routes (containers don't exist) **only if the operator confirms
  those hostnames are not coming back**.

### Option B — Move only `portal.getouch.co` to Coolify

- Connect the Coolify container to the `getouchco_edge` Docker
  network (it is currently isolated on the Coolify network).
- Replace the `portal.getouch.co` block's `reverse_proxy
  getouch-web:3000` with `reverse_proxy
  mqmo5bwkxysedbg7vvh6tk1f-180422032576:3000` (or via a stable alias).
- Verify the Coolify container has the same env vars (`AUTH_SECRET`,
  DB URLs, etc.) — currently it inherits Coolify's secrets store, not
  the compose `.env`. Mismatched secrets would break sessions / DB
  access.
- Leave `getouch.co`, `mcp.getouch.co`, `openclaw.getouch.co` on the
  compose `web`. Result: two parallel Next.js processes serve the same
  code via different proxies. Doubles deploy complexity but isolates
  portal blast radius.

### Option C — Full migration: all `*.getouch.co` Next.js to Coolify

- Heavy lift. Requires migrating all env vars to Coolify, keeping
  `caddy` (still in the compose project) pointed at the new upstream,
  and eventually removing `web` from `compose.yaml`. Caddy itself
  would still live in compose since voice / monitoring still depend
  on the same network.
- Strongly NOT recommended unless a separate workstream owns it.

## Rollback notes

Nothing was changed by this audit. To restore the pre-today portal
state:

- `getouch-web` was rebuilt at 2026-05-01 from commit `ab69e39`
  (BUILD_ID `QmAI9OTg8h4sbSE_iVAhP`). To revert: `git -C
  /home/deploy/apps/getouch.co reset --hard 30dcc58 && docker compose
  build web && docker compose up -d web`.

## Acceptance check (current state)

| Check | Result |
|-------|--------|
| `curl -I https://portal.getouch.co` | 307 → /auth/login (expected) |
| `curl -I https://portal.getouch.co/service-endpoints/mcp` | 307 → /auth/login (expected) |
| `docker ps \| grep getouch-web` | running (compose-owned, **must NOT be removed unsafely**) |
| `grep "getouch-web:3000"` in Caddyfile | 11 matches across 4 production hostnames |
| Coolify app id 2 is the only deployment target for portal.getouch.co | ❌ false today; needs Option B or C to become true |

## Recommendation

Proceed with **Option A**. Acknowledge that the original task
description did not match the actual deployment topology, and the
single source of confusion (the redundant Coolify app id 2) should be
removed rather than promoted.

---

## Final chosen direction (operator decision 2026-05-01)

> Coolify is now the source of truth for GetTouch web deployment.
> Legacy docker-compose `getouch-web` must be disabled after Coolify
> traffic is confirmed.

This document records why the cutover **was halted in Phase 2**
because the Coolify-managed app is not currently a drop-in
replacement for `getouch-web`. Operator action is required before
the migration is safe.

### Phase 2 audit results (2026-05-01)

#### Container

- Coolify app id 2 (current name `mqmo5bwkxysedbg7vvh6tk1f-010405281013`,
  recreated on every deploy)
- Image: `mqmo5bwkxysedbg7vvh6tk1f:619aa630a14808c4f53d1c986536befb4ae4bb00`
  (matches `origin/main`)
- Health: `healthy`
- Internal port: `3000/tcp`
- Restart policy: `unless-stopped`

#### Networks (good news)

| Network | `caddy` | `getouch-web` (compose) | Coolify app |
|---------|---------|-------------------------|-------------|
| `getouch-edge` | ✅ alias `caddy` | ✅ alias `web`/`getouch-web` | ✅ no stable alias |
| `coolify` | ✅ | — | ✅ alias `getouch-web-prod` |

Caddy can already reach the Coolify container by IP; it can also
reach it by alias `getouch-web-prod` on the `coolify` network.
**However** that alias is set by Coolify on container create and is
not guaranteed to survive across redeploys without proper config.

#### DB connectivity

- `getouch-postgres` is reachable from the Coolify container on
  `getouch-edge` (`172.30.1.6:5432 open`).

#### **AUTH_SECRET differs between containers** ⚠

Compared by sha256 prefix only (values not printed):

- compose `getouch-web`: `c69a2361991d7b04…`
- Coolify app:           `932364af26a5cc45…`

**Consequence:** at cutover, every currently-logged-in admin session
is invalidated. They must log in again. No data loss; just
disruption. The two values must be reconciled (copy the compose
value into Coolify) before cutover.

#### **Critical env-var gap on Coolify** ⛔ (blocking)

The compose `web` container has these env vars **that the Coolify
app currently lacks**. Several are required by features we just
shipped:

| Group | Missing on Coolify | Feature(s) that break |
|-------|-------------------|------------------------|
| FusionPBX | `FUSIONPBX_ADMIN_USERNAME`, `FUSIONPBX_ADMIN_PASSWORD`, `FUSIONPBX_DOMAIN`, `FUSIONPBX_EVENT_SOCKET_PASSWORD`, `FUSIONPBX_RTP_START_PORT`, `FUSIONPBX_RTP_END_PORT`, `FUSIONPBX_XML_CDR_USERNAME`, `FUSIONPBX_XML_CDR_PASSWORD`, `VOICE_DB_NAME` | Voice service endpoint UI (everything we built today) |
| Dify | `DIFY_APP_API_KEY`, `DIFY_BASE_URL`, `DIFY_CONSOLE_URL` | Dify service endpoint page + bot integration |
| OpenClaw | `OPENCLAW_GATEWAY_TOKEN` | `openclaw.getouch.co/chat`, `/connect` |
| Portal helpers | `PORTAL_ADMIN_URL` | proxy.ts middleware + `mcp-service.ts` |
| WhatsApp / WAPI | `WAPI_SECRET`, `WAPI_WEBHOOK_URL`, `WA_DIFY_*`, `WA_PORT`, `WA_DEPLOYMENT_LABEL`, `WA_ASSISTANT_MODEL_HINT`, `WA_ACTIVE_RESPONDER`, `WA_DIFY_ALLOWED_NUMBERS`, `WA_DIFY_APP_NAME`, `WA_DIFY_AUTO_REPLY_ENABLED` | Baileys + Dify webhook bridge |
| AI runtime | `AI_SESSION_TIMEOUT_MINUTES`, `AI_TRIGGER_NAME` | AI services console behavior |
| Sessions | `AUTO_START_DEFAULT_SESSION`, `AUTO_START_SESSIONS`, `DEFAULT_SESSION_ID`, `MAX_CONCURRENT_SESSIONS`, `SESSIONS_DIR` | Baileys session bootstrap |
| Build/version | `BUILD_ID` | `/api/build-info` |
| Other | `WEBUI_SECRET_KEY`, `SEARXNG_SECRET`, `EVOLUTION_WEBHOOK_BASE_URL`, `CLOUDFLARED_TOKEN`, `PGADMIN_*`, `APP_DB_*`, `ADMIN_AUTH_USER`, `ADMIN_AUTH_HASH` | Some not consumed by Next.js (Caddy/postgres/pgadmin scope), but `WEBUI_SECRET_KEY` and `EVOLUTION_WEBHOOK_BASE_URL` are. |

In addition, the voice console fetcher SSHs out from the Next.js
container using a key at `~/.ssh/id_ed25519`. Coolify provides this
via `SSH_PRIVATE_KEY_B64` / `SSH_KNOWN_HOSTS_B64` (decoded by
`docker-entrypoint.sh`). That mechanism exists and *should* work, but
must be smoke-tested live before cutover (one POST to
`/api/admin/service-endpoints/voice` and check for live data).

### Cutover stopped — required operator actions

The migration cannot proceed until:

1. **Copy the missing env vars into Coolify app id 2**
   (Coolify UI → Application → Environment Variables). Use the values
   currently in `/home/deploy/apps/getouch.co/.env`. After saving,
   trigger a redeploy.

2. **Reconcile `AUTH_SECRET`** — copy the compose value into Coolify
   so existing sessions remain valid. (Otherwise accept that all
   admins will be forced to log in once.)

3. **Verify `SSH_PRIVATE_KEY_B64` decode in Coolify** by hitting the
   voice service endpoint after redeploy and confirming the SSH probe
   returns live data (or `dbAvailable=true`).

4. **Add a stable Caddy upstream alias** for the Coolify container.
   The container's `coolify` network alias `getouch-web-prod` is
   already used elsewhere in Caddyfile — once env parity is confirmed,
   this alias becomes the natural upstream and minimizes Caddy diff.

### Cutover steps (only after the four items above)

1. `cp /etc/caddy/Caddyfile`
   `/etc/caddy/Caddyfile.backup-before-coolify-web-migration-$(date +%Y%m%d-%H%M%S)`
   (executed inside `caddy` container — file is mounted RO from
   `infra/Caddyfile`).
2. In repo: replace `reverse_proxy getouch-web:3000` with
   `reverse_proxy getouch-web-prod:3000` for the **four blocks** owned
   by the Next.js app:
   - `http://getouch.co`
   - `http://portal.getouch.co`
   - `http://mcp.getouch.co`
   - `http://openclaw.getouch.co`
   Leave dev/stg/vllm blocks alone (those upstream containers don't
   exist, separate cleanup).
3. `cd /home/deploy/apps/getouch.co && git pull && docker compose
   exec caddy caddy validate --config /etc/caddy/Caddyfile`
4. `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`
5. Smoke test all four hostnames + `/api/build-info` (commit must
   match Coolify build).
6. Stop & disable compose `web` only (NOT the project):
   - Edit `compose.yaml`: add `profiles: [legacy-disabled]` to the
     `web:` service block.
   - `docker compose stop web && docker compose rm -f web`
   - `docker compose config --profiles | grep -v legacy-disabled`
     confirms it stays down on the next `up`.

### Rollback (if cutover causes regressions)

```bash
cd /home/deploy/apps/getouch.co
# 1. Revert Caddyfile (4 blocks back to getouch-web:3000)
cp infra/Caddyfile.backup-before-coolify-web-migration-<ts> infra/Caddyfile
# 2. Re-enable web service: remove profiles entry from compose.yaml
docker compose up -d web
# 3. Reload caddy
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Status

- Phase 1: ✅ done
- Phase 2: ⛔ blocked on operator env reconciliation
- Phases 3–9: not started

