# OpenClaw Integration — getouch.co
**Date:** 2026-04-22  
**Status:** Deployed ✅

---

## Phase 1 — Discovery Summary

### Existing AI Stack (getouch.co)
| Component | Container | Endpoint | Notes |
|---|---|---|---|
| Ollama | `ollama` | `http://ollama:11434` | GPU (RTX 5060 Ti 16GB), ~44 tok/s |
| Open WebUI | `open-webui` | `ai.getouch.co` | v0.8.12, "Getouch Chat" |
| Pipelines | `open-webui-pipelines` | `http://pipelines:9099` | custom orchestrator pipeline |
| SearXNG | `searxng` | `http://searxng:8080` | web search for RAG |

### Installed Ollama Models
- `qwen2.5:14b` (9.0GB) — default multilingual
- `qwen3:14b` (9.3GB) — formal/academic
- `llama3.1:8b` (4.9GB) — fast general
- `gemma2:9b` (5.4GB) — Google
- `mistral:7b` (4.4GB) — fast EU model
- `nomic-embed-text` — RAG embeddings

### Existing Messaging Stack
| Component | Container | Notes |
|---|---|---|
| WhatsApp (Baileys) | `getouch-wa` | port 3001, auth at `/data/getouch/wa` |

### Reverse Proxy
- Caddy on `getouch-edge` network (`caddy` container)
- Caddyfile at `infra/Caddyfile` in repo
- All subdomains routed via Cloudflare Tunnel

### Portal (portal.getouch.co)
- Next.js app deployed via Coolify
- Services defined in `app/portal/page.tsx` as a static `services[]` array
- Deployed from `main` branch on git push

---

## Phase 2 — Fit Assessment

### What OpenClaw Is
OpenClaw ("🦞 The Lobster Way") is a personal AI assistant gateway:
- **Gateway daemon**: Node.js/TypeScript, port 18789
- **Control UI**: web interface served at the same port
- **Multi-channel**: WhatsApp, Telegram, Discord, Slack, and 20+ others
- **Native Ollama support**: built-in provider plugin, uses `/api/chat` (not `/v1`)
- **Docker**: pre-built image at `ghcr.io/openclaw/openclaw:latest`

### Integration Decision
| Concern | Decision |
|---|---|
| Ollama/models | ✅ **Reuse** — point at `http://ollama:11434`, use existing models |
| Open WebUI | ✅ **Coexist** — separate UIs for different use cases |
| WhatsApp (Baileys) | ⚠️ **Do NOT connect** — only one Baileys session per WA account allowed; both cannot share the same number |
| SearXNG | Future option — OpenClaw has web search support that could use SearXNG |
| Postgres | Not used by OpenClaw — it uses its own file-based config |
| New Caddy route | ✅ Added `openclaw.getouch.co` |

### Why WhatsApp Coexistence Is Not Safe
The existing `getouch-wa` container holds an active authenticated Baileys session for the production WhatsApp number. OpenClaw also uses Baileys internally. Connecting OpenClaw to the same number would conflict (Baileys boots the other session). **A separate WhatsApp number is required** if OpenClaw's WhatsApp channel is desired.

---

## Phase 3 — Installation

### New Service Added to compose.yaml
```yaml
openclaw-gateway:
  image: ghcr.io/openclaw/openclaw:latest
  container_name: openclaw-gateway
  env_file: /data/getouch/openclaw/config/.env
  environment:
    HOME: /home/node
    TZ: Asia/Kuala_Lumpur
    OPENCLAW_GATEWAY_BIND: lan
    OPENCLAW_ALLOW_INSECURE_PRIVATE_WS: "1"
  volumes:
    - /data/getouch/openclaw/config:/home/node/.openclaw
    - /data/getouch/openclaw/workspace:/home/node/.openclaw/workspace
  networks: [edge]
```

### Data Directories on VPS
```
/data/getouch/openclaw/
├── config/          → /home/node/.openclaw  (gateway config + .env with token)
└── workspace/       → /home/node/.openclaw/workspace  (agent workspace)
```

### Onboarding Command Used
```bash
docker compose -f ~/apps/getouch.co/compose.yaml \
  run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js onboard --non-interactive \
  --auth-choice ollama \
  --custom-base-url "http://ollama:11434" \
  --custom-model-id "qwen2.5:14b" \
  --accept-risk \
  --mode local \
  --no-install-daemon
```

---

## Phase 4 — Integration with Existing Stack

### Ollama Integration
- Provider: `ollama`
- Base URL: `http://ollama:11434` (Docker internal, no public exposure)
- Primary model: `qwen2.5:14b` (best multilingual support for Malaysia)
- All other installed models are auto-discovered via Ollama's `/api/tags`

### Configuration Written (openclaw.json)
```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "ollama/qwen2.5:14b" }
    }
  },
  "gateway": {
    "bind": "lan",
    "controlUi": {
      "allowedOrigins": ["https://openclaw.getouch.co"]
    }
  }
}
```

### WhatsApp Coexistence
- **Current state**: OpenClaw has NO WhatsApp channel configured
- **Future path**: Provision a separate WhatsApp number, then run:
  ```bash
  docker compose run --rm openclaw-cli channels login
  ```
- **Do not** connect OpenClaw to the existing `getouch-wa` production number

---

## Phase 5 — Portal Update

### Change to app/portal/page.tsx
Added OpenClaw to the `services[]` array before the WhatsApp API entry:
```typescript
{
  name: 'OpenClaw',
  description: 'Personal AI assistant gateway — chat via WhatsApp, Telegram, Discord and more, powered by local Ollama models.',
  url: 'https://openclaw.getouch.co',
  icon: '🦞',
  status: 'live',
  app: 'openclaw',
  tag: 'AI',
},
```

### Caddy Route Added (infra/Caddyfile)
```
http://openclaw.getouch.co {
  import common_headers
  header { Cache-Control "no-store"; ... }
  reverse_proxy openclaw-gateway:18789 {
    flush_interval -1
  }
}
```

---

## Phase 6 — Validation Checklist

- [ ] `https://openclaw.getouch.co` loads the OpenClaw Control UI
- [ ] Health endpoint: `curl https://openclaw.getouch.co/healthz` → `{"ok":true}`
- [ ] Log in with gateway token from `/data/getouch/openclaw/config/.env`
- [ ] `/model list` shows Ollama models (qwen2.5:14b etc.)
- [ ] Send a test message in Control UI
- [ ] portal.getouch.co shows OpenClaw card with link

---

## Rollback Path

To remove OpenClaw completely:
1. Remove the `openclaw-gateway` block from `compose.yaml`
2. Remove the `http://openclaw.getouch.co` block from `infra/Caddyfile`
3. Remove the OpenClaw entry from `app/portal/page.tsx`
4. On server: `docker compose -f ~/apps/getouch.co/compose.yaml stop openclaw-gateway && docker compose -f ~/apps/getouch.co/compose.yaml rm -f openclaw-gateway`
5. Optionally: `rm -rf /data/getouch/openclaw` (removes all config and history)
6. Reload Caddy: `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`

All changes are reversible. No existing services are modified.

---

## Manual Steps Required

1. **Access**: Visit `https://openclaw.getouch.co`
2. **Reset stuck browser state**: Visit `https://openclaw.getouch.co/reset`
3. **WhatsApp channel** (future): Needs a separate WA number — see Phase 4 above
4. **Model switch**: To use qwen3:14b instead of qwen2.5:14b in OpenClaw, run in Control UI: `/model ollama/qwen3:14b`
5. **Updates**: `docker pull ghcr.io/openclaw/openclaw:latest && docker compose up -d openclaw-gateway`

---

## Phase 7 — Browser Auth Recovery Fix

### Real Root Cause
- The live Control UI does **not** use the same storage path for everything.
- In real browser runtime, the successful token lands in `sessionStorage`, not the manual `localStorage` bootstrap path used by the first fix.
- Exact successful token key observed in Chrome:
  - `sessionStorage['openclaw.control.token.v1:wss://openclaw.getouch.co']`
- Exact settings keys observed in Chrome:
  - `localStorage['openclaw.control.settings.v1']`
  - `localStorage['openclaw.control.settings.v1:wss://openclaw.getouch.co']`
- Direct `https://openclaw.getouch.co/chat?session=main` failed because the browser hit `/chat` with no token in the runtime token store, so the gateway connect request was sent without `auth.token` and returned `AUTH_TOKEN_MISSING`.

### Why The First Fix Failed
- The first `/connect` page wrote `openclaw.control.token.v1:wss://openclaw.getouch.co` into `localStorage`.
- Browser validation showed that the Control UI still rendered an empty token field and sent a connect request without `auth.token`.
- Real browser proof showed that the upstream bundle's working bootstrap path is `https://openclaw.getouch.co/chat?session=main#token=<TOKEN>`, not the manual localStorage write.

### Final Browser-Safe Fix
- `dangerouslyDisableDeviceAuth: true` remains enabled server-side so browser device pairing is not required.
- Caddy now guards direct `GET /chat` requests before the upstream app loads:
  - if no stored token exists, the guard adds `#token=<TOKEN>` and forces a real reload
  - if a stored token already exists, the guard simply reloads into the upstream app
- The guard uses a short-lived cookie `openclaw_boot=1` so only the bootstrap pass is intercepted and the next request is proxied to OpenClaw normally.
- `/reset` now clears the exact OpenClaw browser keys used in practice and then re-enters the guarded `/chat` path.

### Exact Browser Storage Findings

#### Before Working Bootstrap
- Fresh direct `/chat?session=main`:
  - no token key present in browser storage
  - settings keys existed after UI startup
  - WebSocket connect failed with `unauthorized: gateway token missing`

#### After Working Bootstrap
- `sessionStorage['openclaw.control.token.v1:wss://openclaw.getouch.co']`
- `localStorage['openclaw.control.settings.v1']`
- `localStorage['openclaw.control.settings.v1:wss://openclaw.getouch.co']`
- `localStorage['openclaw-device-identity-v1']`

### Exact Reset Coverage
`/reset` explicitly clears these keys before fallback wildcard cleanup:
- `openclaw-device-identity-v1`
- `openclaw.device.auth.v1`
- `openclaw.control.settings.v1`
- `openclaw.control.settings.v1:wss://openclaw.getouch.co`
- `openclaw.control.settings.v1:wss://openclaw.getouch.co/chat`
- `openclaw.control.token.v1`
- `openclaw.control.token.v1:wss://openclaw.getouch.co`
- `openclaw.control.token.v1:wss://openclaw.getouch.co/chat`

### Live Browser Validation
- Fresh Chrome visit to `https://openclaw.getouch.co/`:
  - request chain: `/` -> `/chat?session=main` -> `/chat?session=main`
  - final page: connected OpenClaw Control UI
  - WebSocket: `hello-ok`
- Fresh Chrome visit to `https://openclaw.getouch.co/chat?session=main`:
  - final page: connected OpenClaw Control UI
  - WebSocket: `hello-ok`
- Fresh Chrome visit to `https://openclaw.getouch.co/reset`:
  - cleared state
  - returned to guarded `/chat`
  - final page: connected OpenClaw Control UI
  - WebSocket: `hello-ok`
- Same-tab refresh after bootstrap:
  - token remained in `sessionStorage`
  - second WebSocket handshake returned `hello-ok`

### Final Access Flow
- Canonical user URL: `https://openclaw.getouch.co`
- Recovery URL: `https://openclaw.getouch.co/reset`
