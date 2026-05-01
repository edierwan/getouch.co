# AI API Gateway Foundation (2026-04-27, plan-updated 2026-04-28)

## Scope

- Public vLLM API domain: `https://vllm.getouch.co/v1`
- Portal admin UI route: `https://portal.getouch.co/service-endpoints/vllm`
- `https://llm.getouch.co/v1` is **reserved for future LiteLLM** and is not used by this gateway.
- Public access goes through the portal application gateway, not directly to a model server.
- All `/v1/*` routes require an API key.
- Public health endpoints stay available at `/health` and `/ready`.
- Raw vLLM is never exposed publicly without API key protection.
- vLLM itself has no native UI. `portal.getouch.co/service-endpoints/vllm` is the admin/control surface; `ai.getouch.co` (Open WebUI) is the chat/test UI.

## Architecture

```
External client / Dify / n8n / custom app
  → https://vllm.getouch.co/v1
  → Next.js AI gateway route handlers (this app, lib/ai-gateway.ts)
  → internal vLLM backend: http://vllm-qwen3-14b-fp8:8000/v1
```

This keeps one stable public API surface while allowing backend changes behind the gateway.

## Public Endpoints

- `GET /health` — public, basic health only.
- `GET /ready` — public, structured readiness; does not expose secrets.
- `GET /v1/models` — requires API key.
- `POST /v1/chat/completions` — requires API key.
- `POST /v1/embeddings` — requires API key. (Foundation only — backend pending verified HF model id, returns 503 with clean JSON until wired.)

## Authentication Model

- `Authorization: Bearer <GETOUCH_VLLM_API_KEY>` is required on every `/v1/*` request.
- Gateway keys are currently managed through server env or secrets.
- The portal now includes a dedicated vLLM gateway dashboard at `/service-endpoints/vllm` showing status, key inventory, quick tests, sanitized logs, Open WebUI provider status, and usage when central logging exists.
- Keys may be provided as plain values or `sha256:` hashes.
- The admin UI does not reveal full key values.
- Per-key rate limit (default: 30 requests / 60s window).

## Environment Variables

New canonical names:

- `GETOUCH_VLLM_GATEWAY_ENABLED`
- `GETOUCH_VLLM_PUBLIC_BASE_URL` (default `https://vllm.getouch.co/v1`)
- `GETOUCH_VLLM_GATEWAY_ALLOWED_HOSTS` (default `vllm.getouch.co,localhost,127.0.0.1`)
- `GETOUCH_VLLM_GATEWAY_KEYS`
- `GETOUCH_VLLM_BACKEND_TYPE` (`vllm` | `ollama` | `disabled`)
- `GETOUCH_VLLM_BACKEND_BASE_URL` (default `http://vllm-qwen3-14b-fp8:8000/v1`)
- `GETOUCH_VLLM_BACKEND_API_KEY`
- `GETOUCH_VLLM_GATEWAY_TIMEOUT_MS`
- `GETOUCH_VLLM_GATEWAY_MAX_BODY_BYTES`
- `GETOUCH_VLLM_GATEWAY_MAX_TOKENS`
- `GETOUCH_VLLM_GATEWAY_RATE_LIMIT_REQUESTS`
- `GETOUCH_VLLM_GATEWAY_RATE_LIMIT_WINDOW_SECONDS`
- `GETOUCH_VLLM_GATEWAY_MODEL_ALIASES`
- `GETOUCH_VLLM_GATEWAY_ADMIN_TEST_KEY`

The legacy `GETOUCH_AI_*` names from the original 2026-04-27 plan are still honored as fallbacks for backwards compatibility, but new deployments should set the `GETOUCH_VLLM_*` names.

## Model Policy

| Alias              | Backend model              | Type       | Status   | Notes |
|--------------------|----------------------------|------------|----------|-------|
| `getouch-qwen3-14b` | `Qwen/Qwen3-14B-FP8`      | chat       | planned (becomes active when backend is ready) | Primary vLLM target |
| `getouch-qwen3-30b` | _pending verified HF id_  | chat       | blocked  | Future / blocked on current 16GB GPU until validated. Not exposed by `/v1/models`. |
| `getouch-embed`     | _pending verified HF id_  | embedding  | planned  | Future Nomic embedding alias. Routes through `/v1/embeddings` only. |

Routing rules enforced by the gateway:

- `getouch-qwen3-14b` and `getouch-qwen3-30b` are accepted only by `/v1/chat/completions`.
- `getouch-embed` is accepted only by `/v1/embeddings`.
- Sending an embedding alias to `/v1/chat/completions` returns 400 (`wrong_model_type`).
- Sending a chat alias to `/v1/embeddings` returns 400 (`wrong_model_type`).
- Aliases with `status: blocked` are not exposed by `/v1/models` and are rejected with 400 (`model_blocked`).
- Unknown aliases return 400 (`unknown_model`).

## Safety Controls

- Host allowlist (default `vllm.getouch.co,localhost,127.0.0.1`).
- Per-API-key fixed-window rate limiter (in-memory).
- Max body size cap (default 1 MB).
- Request timeout cap (default 120s).
- `max_tokens` cap (default 2048).
- Structured logs only — no API keys, no full prompts in audit logs.

## Current Backend Posture

- Public gateway can run before vLLM is deployed.
- If `GETOUCH_VLLM_BACKEND_TYPE=disabled` or the backend is unreachable, `/ready` returns 503 and chat/embeddings requests return clean 503.
- Ollama remains the active inference stack for Open WebUI; the gateway can run with `BACKEND_TYPE=ollama` as a fallback during transition.
- vLLM stays internal-only until the maintenance window where the GPU container is brought up.

## Open WebUI Integration

Open WebUI currently shows only the local Ollama models. vLLM is **not** auto-configured. To add it:

1. In Open WebUI → **Settings → Connections → OpenAI API**:
   - Base URL: `http://vllm-qwen3-14b-fp8:8000/v1` (preferred, internal Docker network)
     or `https://vllm.getouch.co/v1` (public protected gateway)
   - API key: a key from `GETOUCH_VLLM_GATEWAY_KEYS` (when using the public gateway), or a backend key (when calling the backend directly).
2. After saving, the configured chat aliases (e.g. `getouch-qwen3-14b`) appear under the External / OpenAI-compatible provider once the vLLM backend is running.
3. The Nomic embedding alias `getouch-embed` will not show up as a chat model — it must be configured through Open WebUI's embedding provider settings if/when supported.
4. **Do not delete Ollama models** and **do not wipe Open WebUI data** during this change.

## Portal Admin UI

The dedicated admin page is:

- `portal.getouch.co/service-endpoints/vllm`

It is responsible for:

- showing public gateway health and backend readiness
- showing the current public alias `getouch-qwen3-14b` → `Qwen/Qwen3-14B-FP8`
- exposing admin-only quick tests for `/health`, `/ready`, and `/v1/models`
- exposing sanitized gateway and backend log viewers
- showing current env-managed gateway keys alongside central API key readiness

Current key posture on that page:

- gateway auth still uses `GETOUCH_VLLM_GATEWAY_KEYS`
- central API keys are shown for operational readiness and future cutover
- central-key validation is not yet the live auth path for `/v1/*`
- no secrets are sent to the frontend; plaintext keys are shown only once at central-key creation time

## Example Requests

List models:

```bash
curl https://vllm.getouch.co/v1/models \
  -H "Authorization: Bearer <GETOUCH_VLLM_API_KEY>"
```

Chat completion:

```bash
curl https://vllm.getouch.co/v1/chat/completions \
  -H "Authorization: Bearer <GETOUCH_VLLM_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "getouch-qwen3-14b",
    "messages": [
      { "role": "user", "content": "Reply only: GETOUCH VLLM API OK" }
    ],
    "max_tokens": 50,
    "temperature": 0.2
  }'
```

Embeddings (returns 503 until backend is wired):

```bash
curl https://vllm.getouch.co/v1/embeddings \
  -H "Authorization: Bearer <GETOUCH_VLLM_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{ "model": "getouch-embed", "input": "hello world" }'
```

## Portal Surface

Page: `/admin/ai-services`

The admin UI shows:

- public base URL = `https://vllm.getouch.co/v1`
- a banner noting `llm.getouch.co` is reserved for future LiteLLM
- gateway readiness, backend type, backend privacy posture
- **Model Runtime Plan** table with alias / backend model / type / status / notes
- request safety limits
- `/health` and authenticated `/v1/models` test actions (admin test key never sent to browser)

API key issuance/rotation UI is intentionally deferred to a follow-up change.

## Rollback

1. Remove the `vllm.getouch.co` Caddy route.
2. Disable the gateway with `GETOUCH_VLLM_GATEWAY_ENABLED=false`.
3. Remove gateway env keys from the deployment if the foundation is no longer needed.
4. Revert the portal UI and route handlers.

Rollback does not require exposing or deploying vLLM directly.

## Manual Deployment Steps

The following steps are deployment-time only and are not in the application repo:

1. **Cloudflare DNS:** Confirm `vllm.getouch.co` resolves to the platform edge (currently a wildcard A → Cloudflare proxy already covers this; verify the proxy/grey-cloud setting matches `portal.getouch.co`).
2. **Caddy:** Add a `http://vllm.getouch.co` block on the VPS that reverse-proxies to the portal app (`getouch-coolify-app:3000`). The Caddyfile lives at `/home/deploy/apps/getouch.co/infra/Caddyfile`. Then `docker exec caddy kill -USR1 1` (or `docker restart caddy`) to reload.
3. **Coolify env:** Set the `GETOUCH_VLLM_*` variables on application uuid `mqmo5bwkxysedbg7vvh6tk1f` and redeploy.
4. **Validation:** `curl https://vllm.getouch.co/health` (200), `curl https://vllm.getouch.co/v1/models` (401 without key), `curl -H 'Authorization: Bearer <key>' https://vllm.getouch.co/v1/models` (200 with alias list).

---

## Changelog

### 2026-04-28 — Plan Update

- Switched the public vLLM API domain from `llm.getouch.co` (original plan) to `https://vllm.getouch.co/v1`.
- Reserved `https://llm.getouch.co/v1` for future LiteLLM. Not used by this gateway.
- Renamed canonical env var prefix from `GETOUCH_AI_*` to `GETOUCH_VLLM_*`. Legacy `GETOUCH_AI_*` names remain honored as fallbacks.
- Added `POST /v1/embeddings` foundation (auth + alias-type check; backend wiring pending HF id verification).
- Added future model aliases:
  - `getouch-qwen3-14b` → `Qwen/Qwen3-14B-FP8` (chat, primary)
  - `getouch-qwen3-30b` → pending verified HF id (chat, **blocked** on current 16GB GPU until validated)
  - `getouch-embed` → pending verified HF id (embedding)
- Enforced model-type-vs-route checks: chat aliases reject `/v1/embeddings`, embedding aliases reject `/v1/chat/completions`.
- `/v1/models` no longer lists aliases with `status: blocked`.
- Confirmed vLLM is still not visible in Open WebUI until the operator manually adds it as an OpenAI-compatible provider.
- No raw vLLM public exposure. API key protection is enforced gateway-side.

### 2026-04-27/28 — Auth Ordering + Pepper Alignment

- **Auth ordering fix** in `lib/ai-gateway.ts::authenticateGatewayRequest`: missing/invalid token now returns `401` **before** the `enabled` flag is checked. Prior order returned `503` to anonymous probes when the backend was disabled, which leaked backend state. New order: missing-key → 401 → invalid-key → 401 → backend-disabled → 503 → rate-limit → 429.
- Verified live (`https://vllm.getouch.co`):
  - `/v1/models` (no key) → `401 missing_api_key`
  - `/v1/models` (wrong key) → `401`
  - `/health` → `200`
  - `/ready` → `503` (backend not running, expected)
  - `/foo` → `404`
- **Central key wiring deferred.** The gateway still authenticates against the env-based `GETOUCH_VLLM_GATEWAY_KEYS` list. Wiring central API keys (`central_api_keys` table managed by `lib/api-keys.ts`) into the vLLM gateway is intentionally a follow-up task; it is not required for the 2026-04-27 milestone and would conflate two distinct key namespaces (admin/portal central keys vs. external AI consumer keys). The follow-up should add a gateway-key scope (e.g. `vllm:invoke`) to the central key model and route the gateway through `lib/api-keys.ts::verifyApiKey` when that scope is present, while keeping `GETOUCH_VLLM_GATEWAY_KEYS` as a bootstrap fallback.
- `CENTRAL_API_KEY_PEPPER` (separate from `AUTH_SECRET`) now peppers HMAC for central API keys; legacy `AUTH_SECRET` remains as a one-time fallback with a one-shot prod warning. See `docs/api-key-manager.md`.
