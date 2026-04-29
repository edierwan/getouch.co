# getouch.co

Production landing app for getouch.co.

## Stack

- Next.js 16
- React 19
- Docker multi-stage build

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Portal Routing Guard

`portal.getouch.co`, `auth.getouch.co`, and `getouch.co` must all reverse proxy to the same live Next.js upstream: `getouch-web:3000`.

If `portal.getouch.co` drifts to an old alias such as `getouch-web-prod`, the live portal can serve stale sidebar/auth code even when the repo and current app container are correct.

Run `npm run verify:portal-preprod-backups` after portal navigation or proxy changes.

## Portal Auth Runtime Guard

The portal auth flow depends on the app using the database that actually contains the auth tables: `getouch.co`.

If `APP_DB_NAME` points at `getouch`, the landing page can still render, but portal login fails at runtime with Postgres `relation "users" does not exist` during the sign-in action.

Run `npm run verify:live-deploy` on the live host to print and validate:

- repo path, remote, branch, and commit SHA
- effective upstream for `getouch.co`, `auth.getouch.co`, and `portal.getouch.co`
- active web/caddy container identity and alias resolution
- configured `APP_DB_NAME`
- presence of the `users` table in the configured app database

If you replace `infra/Caddyfile` with `scp`, force-recreate `caddy` afterward so Docker rebinds the updated file inode:

```bash
docker compose up -d --force-recreate --no-deps caddy
```

## Evolution API Deployment

Evolution API is deployed as a Docker service on the VPS. It is not a separate GitHub repository and it is not part of the `wa.getouch.co` Baileys gateway.

- Portal admin UI: `portal.getouch.co/whatsapp-services/evolution`
- Internal service URL: `http://evolution-api:8080`
- Public endpoint: `https://evo.getouch.co`
- Runtime database: PostgreSQL database `evolution`
- Existing Baileys gateway: `https://wa.getouch.co`

Operational boundaries:

- Portal is the admin/control plane for Evolution.
- `evo.getouch.co` reverse proxies to the Evolution API service.
- The portal talks to Evolution over the internal Docker network, not the public URL.
- The Baileys gateway at `wa.getouch.co` remains separate and its primary number stays untouched.

## WhatsApp Providers

- Baileys Gateway is a WhatsApp service endpoint backed by PostgreSQL database `baileys`.
- Evolution API is a WhatsApp service endpoint backed by PostgreSQL database `evolution`.
- LINE and Telegram are not handled by Baileys or Evolution and need their own providers later.

## Container

```bash
docker build -t getouch-co .
docker run --rm -p 3000:80 getouch-co
```

### VPS Access
ssh deploy@100.84.14.93 / Turun@2020