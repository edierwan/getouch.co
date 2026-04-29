# Dify service endpoint - 2026-04-29

## Summary

A fresh official Dify `1.14.0` runtime is installed on the VPS as a Docker Compose stack under `/home/deploy/apps/dify`.

- Native Dify UI and setup flow: `https://dify.getouch.co`
- Native Dify apps dashboard: `https://dify.getouch.co/apps`
- Portal control/status page: `https://portal.getouch.co/service-endpoints/dify`

The public Dify endpoint is live now. The portal control page is implemented in this repository and becomes live after the Next.js app is deployed.

Current public state:

- `/` returns `307` to `/apps`
- `/install` returns `200`
- `/signin` returns `200`
- `/apps` returns `200`
- `/console/api/system-features` returns `200`
- `/console/api/apps?page=1&limit=1` returns `401`, which is expected before authentication and also proves the console API is reachable

Dify is currently a clean self-hosted install that still needs the browser-based initialization flow to be completed at `https://dify.getouch.co/install`.

## Runtime layout

Install method:

- Official upstream checkout from `https://github.com/langgenius/dify`
- Fresh clone on VPS path `/home/deploy/apps/dify`
- Deployed from the official `docker/docker-compose.yaml`
- Runtime upgraded to tag `1.14.0`

Ingress path:

- `dify.getouch.co -> Caddy -> host:18080 -> docker-nginx-1 -> Dify web/api`

Primary runtime containers:

- `docker-api-1` -> `langgenius/dify-api:1.14.0`
- `docker-web-1` -> `langgenius/dify-web:1.14.0`
- `docker-worker-1` -> `langgenius/dify-api:1.14.0`
- `docker-worker_beat-1` -> `langgenius/dify-api:1.14.0`
- `docker-plugin_daemon-1` -> `langgenius/dify-plugin-daemon:0.6.0-local`
- `docker-sandbox-1` -> `langgenius/dify-sandbox:0.2.15`
- `docker-db_postgres-1` -> `postgres:15-alpine`
- `docker-redis-1` -> `redis:6-alpine`
- `docker-weaviate-1` -> `semitechnologies/weaviate:1.27.0`
- `docker-nginx-1` -> `nginx:latest`
- `docker-ssrf_proxy-1` -> `ubuntu/squid:latest`

Database and storage:

- Main runtime database: `dify`
- Plugin metadata database: `dify`
- Redis is dedicated to the Dify stack
- User uploads, datasets, and runtime files stay in the Dify Docker volumes under `/home/deploy/apps/dify/docker/volumes`

Runtime notes:

- Worker queue connectivity is healthy after aligning `CELERY_BROKER_URL` with the live Redis password.
- Plugin daemon starts cleanly after pointing `DB_PLUGIN_DATABASE` at `dify`.
- Plugin debug access is still published for internal use, but is now loopback-only: `127.0.0.1:55003->5003`.
- Sandbox health checks are returning `200`.

## Live deployment deltas from upstream

Two live runtime patches were required after the fresh `1.14.0` install:

1. `CELERY_BROKER_URL` had to be explicitly aligned with the generated `REDIS_PASSWORD`, otherwise the worker retried Redis authentication indefinitely.
2. `DB_PLUGIN_DATABASE` had to be set to `dify`, otherwise the plugin daemon initially tried to use a missing `dify_plugin` database.
3. The API service had to run with `GUNICORN_CMD_ARGS=--no-control-socket` because the official `1.14.0` API image runs as user `dify` but does not create `/home/dify`, which caused a gunicorn control socket startup error.
4. The live compose port mapping for the plugin daemon had to be patched to honor `EXPOSE_PLUGIN_DEBUGGING_HOST`; the upstream compose template exposed the debug port on all interfaces even when the host env var was set.

These changes are local to the VPS Dify deployment and should be preserved on future Dify upgrades unless upstream fixes them.

## Backup and rollback

Backup root:

- `/home/deploy/backups/dify-20260429-082307`

Backup artifacts:

- `/home/deploy/backups/dify-20260429-082307/containers.txt`
- `/home/deploy/backups/dify-20260429-082307/dify-db.sql.gz`
- `/home/deploy/backups/dify-20260429-082307/dify-revision.txt`
- `/home/deploy/backups/dify-20260429-082307/repository-and-config.tgz`
- `/home/deploy/backups/dify-20260429-082307/runtime-volumes.tgz`
- `/home/deploy/backups/dify-20260429-082307/live-app`

The previous live Dify checkout was preserved at:

- `/home/deploy/backups/dify-20260429-082307/live-app`

Rollback outline:

1. Stop the fresh stack from `/home/deploy/apps/dify/docker` with `docker compose down --remove-orphans`.
2. Move the current `/home/deploy/apps/dify` directory aside.
3. Restore `/home/deploy/backups/dify-20260429-082307/live-app` back to `/home/deploy/apps/dify`.
4. If the old runtime state is required, restore `/home/deploy/backups/dify-20260429-082307/runtime-volumes.tgz` into `/home/deploy/apps/dify/docker/volumes`.
5. If the old database state is required, restore `/home/deploy/backups/dify-20260429-082307/dify-db.sql.gz` into the target PostgreSQL runtime before starting containers.
6. Start the old stack again from `/home/deploy/apps/dify/docker` with `docker compose up -d`.

Use `repository-and-config.tgz` only if the preserved `live-app` directory is no longer available.

## Environment and secrets

Important environment variables and secret names in the live Dify runtime:

- `CONSOLE_API_URL`
- `CONSOLE_WEB_URL`
- `SERVICE_API_URL`
- `APP_API_URL`
- `APP_WEB_URL`
- `FILES_URL`
- `SECRET_KEY`
- `INIT_PASSWORD`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_PLUGIN_DATABASE`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `CELERY_BROKER_URL`
- `PLUGIN_DIFY_INNER_API_KEY`
- `PLUGIN_DEBUGGING_HOST`
- `PLUGIN_DEBUGGING_PORT`
- `EXPOSE_PLUGIN_DEBUGGING_HOST`
- `EXPOSE_PLUGIN_DEBUGGING_PORT`
- `GUNICORN_CMD_ARGS`

Do not store these values in repository docs or portal code.

## Portal control plane

Repository-side control-plane changes for Dify were added in the Getouch portal app.

Implemented locally:

- Dify status page UI at the existing internal admin route
- Public portal access through `portal.getouch.co/service-endpoints/dify`
- Expanded Dify status model in `lib/service-endpoints-dify.ts`
- Portal-side Dify tenant mapping schema in `lib/schema.ts`
- Migration file `drizzle/0010_dify_tenant_mappings.sql`

Current portal/runtime separation:

- `dify.getouch.co` is the native Dify operator UI and end-user workflow/dashboard surface.
- `portal.getouch.co/service-endpoints/dify` is the Getouch control/status surface for operators.

The portal page should describe Dify status, runtime visibility, provider plan, future tenant mappings, and the intended bot/handover flow. It is not a replacement for the native Dify UI.

## Multi-tenant mapping plan

Getouch should keep tenant-to-Dify mapping metadata in the portal database, not inside the Dify runtime itself.

Planned portal table:

- `dify_tenant_mappings`

Current fields:

- `tenant_id`
- `dify_workspace_id`
- `dify_app_id`
- `dify_workflow_id`
- `status`
- timestamps

Intended use:

- decide whether a Getouch tenant is Dify-enabled
- map a Getouch tenant to a Dify workspace or app/workflow
- keep assignment state in the portal control plane
- avoid hardcoding Dify routing in WhatsApp or Chatwoot services

Operational note:

- The fresh Dify runtime is currently a single clean self-hosted install.
- Tenant mapping is a Getouch control-plane concept for future routing and should not be treated as permission to run an unreviewed public multi-workspace Dify SaaS.

## Model provider plan

Current intended provider plan:

- Preferred current endpoint: `https://vllm.getouch.co/v1`
- Current model alias: `getouch-qwen3-14b`
- Future reserved endpoint: `https://llm.getouch.co/v1`

Recommended rollout:

1. Complete Dify installation first.
2. Configure the model provider in Dify against the direct vLLM endpoint only after the backend is confirmed ready.
3. Keep `llm.getouch.co` reserved for a future LiteLLM layer so model routing can move without changing every downstream integration.

## WhatsApp and human handover flow

Planned service flow:

1. WhatsApp message enters through Baileys Gateway or Evolution Gateway.
2. The Getouch routing layer decides whether Dify is enabled for the tenant.
3. Dify handles AI workflow or bot orchestration when enabled.
4. Chatwoot becomes the human handover surface when escalation is required.
5. The response goes back through the selected WhatsApp provider.

Safety boundaries:

- Do not break Baileys.
- Do not break Evolution.
- Do not break Chatwoot.
- Do not break FusionPBX or voice services.
- Do not break the vLLM service endpoint or its portal page.

## Manual steps still required

1. Run the new portal DB migration that adds `dify_tenant_mappings`.
2. Deploy the Next.js portal application so `portal.getouch.co/service-endpoints/dify` reflects the new Dify control page.
3. Open `https://dify.getouch.co/install` and complete the initial Dify setup flow.
4. Create the first admin account in Dify.
5. Configure the first model provider in Dify.
6. Validate Dify app creation, workflow creation, and sign-in after setup.
7. Validate the portal route at `https://portal.getouch.co/service-endpoints/dify`.
8. Re-check existing service pages after the portal deploy:
   - `https://portal.getouch.co/service-endpoints/baileys`
   - `https://portal.getouch.co/service-endpoints/evolution`
   - `https://portal.getouch.co/service-endpoints/vllm`
   - `https://portal.getouch.co/service-endpoints/chatwoot` if present
   - `https://portal.getouch.co/service-endpoints/voice` if present

## Validation snapshot

Final validated runtime state on 2026-04-29:

- `docker-api-1` healthy
- `docker-db_postgres-1` healthy
- `docker-redis-1` healthy
- `docker-sandbox-1` healthy
- `docker-web-1` up
- `docker-worker-1` up and connected to Redis
- `docker-worker_beat-1` up
- `docker-plugin_daemon-1` up with loopback-only debug exposure
- `docker-nginx-1` up
- `docker-weaviate-1` up
- `docker-ssrf_proxy-1` up

Public endpoint checks passed with the expected status codes listed in the Summary section.
