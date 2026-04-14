# Supabase Production — Serapod Development-home

Self-hosted Supabase stack for **Serapod Development-home**, fully isolated from the Getouch platform.

## Domains

| Service | URL |
|---------|-----|
| API (Kong) | `https://sb-dev.serapod.getouch.co` |
| Studio | `https://st-dev.serapod.getouch.co` |

## Architecture

```
Cloudflare → cloudflared tunnel → Caddy (127.0.0.1:80)
  ├── sb-dev.serapod.getouch.co → serapod-prd-kong:8000
  └── st-dev.serapod.getouch.co → serapod-prd-studio:3000
```

All services run on an isolated Docker network (`supabase-prd-net`). Kong and Studio additionally join `getouch-edge` so Caddy can reach them.

## Deployment

### 1. Create .env

```bash
cp .env.example .env
# Edit .env — fill in all REQUIRED fields
```

### 2. Start the stack

```bash
docker compose up -d
```

### 3. Verify

```bash
docker compose ps
curl -s https://sb-dev.serapod.getouch.co/rest/v1/ \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```
