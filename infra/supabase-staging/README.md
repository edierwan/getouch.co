# Supabase Staging — Serapod

Self-hosted Supabase stack for **Serapod Staging**, fully isolated from the Getouch platform.

## Domains

| Service | URL |
|---------|-----|
| API (Kong) | `https://sb-stg-serapod.getouch.co` |
| Studio | `https://st-stg-serapod.getouch.co` |

## Architecture

```
Cloudflare → cloudflared tunnel → Caddy (127.0.0.1:80)
  ├── sb-stg-serapod.getouch.co → serapod-stg-kong:8000
  └── st-stg-serapod.getouch.co → serapod-stg-studio:3000
```

All services run on an isolated Docker network (`supabase-stg-net`). Kong and Studio additionally join `getouch-edge` so Caddy can reach them.

### Services

| Container | Image | Purpose |
|-----------|-------|---------|
| serapod-stg-db | supabase/postgres:15.6.1.145 | PostgreSQL 15 |
| serapod-stg-kong | kong:2.8.1 | API gateway |
| serapod-stg-auth | supabase/gotrue:v2.164.0 | Authentication |
| serapod-stg-rest | postgrest/postgrest:v12.2.3 | RESTful API |
| serapod-stg-realtime | supabase/realtime:v2.33.58 | WebSocket subscriptions |
| serapod-stg-storage | supabase/storage-api:v1.11.13 | File storage |
| serapod-stg-imgproxy | darthsim/imgproxy:v3.8.0 | Image transforms |
| serapod-stg-meta | supabase/postgres-meta:v0.84.2 | DB metadata (Studio) |
| serapod-stg-studio | supabase/studio:20241029-46e1e40 | Dashboard UI |

## Deployment

### 1. Generate secrets

```bash
# JWT secret (64 bytes, base64)
openssl rand -base64 64 | tr -d '\n'

# Postgres password
openssl rand -base64 32

# Generate anon + service_role JWT keys from the JWT secret:
# https://supabase.com/docs/guides/self-hosting#api-keys
# Or use the supabase CLI / jwt.io with your JWT_SECRET
```

### 2. Create .env

```bash
cp .env.example .env
# Edit .env — fill in all REQUIRED fields
```

### 3. Start the stack

```bash
docker compose up -d
```

### 4. Verify

```bash
# All containers should be healthy
docker compose ps

# Test Kong API gateway
curl -s https://sb-stg-serapod.getouch.co/rest/v1/ \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Isolation

- **Network**: `supabase-stg-net` — no connectivity to Getouch containers
- **Database**: Own PostgreSQL instance (`serapod-stg-db`) with dedicated volumes
- **Volumes**: `serapod-stg-db-data`, `serapod-stg-storage-data`
- **No shared state** with the Getouch platform whatsoever

## Connecting from Serapod

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://sb-stg-serapod.getouch.co',
  'YOUR_ANON_KEY'
)
```

## Stopping / Cleanup

```bash
# Stop (preserves data)
docker compose down

# Stop and delete all data
docker compose down -v
```
