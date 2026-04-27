# AI API Gateway Foundation (2026-04-27)

## Scope

- Public AI API domain: `https://llm.getouch.co/v1`
- Public access goes through the portal application gateway, not directly to a model server.
- All `/v1/*` routes require an API key.
- Public health endpoints stay available at `/health` and `/ready`.
- vLLM is still not deployed publicly and is not exposed directly.

## Architecture

Client application
-> `llm.getouch.co`
-> Next.js AI gateway route handlers
-> internal backend provider (`vLLM` later, optional `Ollama` fallback when explicitly configured)

This keeps one stable public API surface while allowing backend changes behind the gateway.

## Public Endpoints

- `GET /health`
- `GET /ready`
- `GET /v1/models`
- `POST /v1/chat/completions`

## Authentication Model

- `Authorization: Bearer <GETOUCH_AI_API_KEY>` is required on every `/v1/*` request.
- Gateway keys are currently managed through server env or secrets.
- Keys may be provided as plain values or `sha256:` hashes.
- The admin UI does not reveal full key values.

## Gateway Controls

Current environment knobs:

- `GETOUCH_AI_GATEWAY_ENABLED`
- `GETOUCH_AI_GATEWAY_PUBLIC_BASE_URL`
- `GETOUCH_AI_GATEWAY_DOCS_URL`
- `GETOUCH_AI_GATEWAY_ALLOWED_HOSTS`
- `GETOUCH_AI_GATEWAY_KEYS`
- `GETOUCH_AI_BACKEND_TYPE`
- `GETOUCH_AI_BACKEND_BASE_URL`
- `GETOUCH_AI_BACKEND_API_KEY`
- `GETOUCH_AI_GATEWAY_TIMEOUT_MS`
- `GETOUCH_AI_GATEWAY_MAX_BODY_BYTES`
- `GETOUCH_AI_GATEWAY_MAX_TOKENS`
- `GETOUCH_AI_GATEWAY_RATE_LIMIT_REQUESTS`
- `GETOUCH_AI_GATEWAY_RATE_LIMIT_WINDOW_SECONDS`
- `GETOUCH_AI_GATEWAY_MODEL_ALIASES`
- `GETOUCH_AI_GATEWAY_ADMIN_TEST_KEY`

## Model Policy

- Public alias: `getouch-qwen3-14b`
- Intended future vLLM backend model: `Qwen/Qwen3-14B-FP8`
- Optional Ollama fallback alias target: `qwen3:14b`
- Unknown model names are rejected by the gateway.

## Safety Controls

- Host allowlist for `llm.getouch.co` and local development hosts only.
- Rate limiting is enforced per API key with an in-memory fixed window limiter.
- Request body size is capped.
- Request timeout is capped.
- `max_tokens` is capped.
- Logs are structured to avoid secret and prompt leakage.

## Current Backend Posture

- Public gateway can exist before vLLM deployment.
- If backend type is `disabled` or the backend is unreachable, readiness and chat requests fail cleanly.
- Ollama remains the current active inference stack for portal and Open WebUI.
- vLLM remains internal-only for a future maintenance window.

## Example Requests

List models:

```bash
curl https://llm.getouch.co/v1/models \
  -H "Authorization: Bearer <GETOUCH_AI_API_KEY>"
```

Chat completion:

```bash
curl https://llm.getouch.co/v1/chat/completions \
  -H "Authorization: Bearer <GETOUCH_AI_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "getouch-qwen3-14b",
    "messages": [
      {
        "role": "user",
        "content": "Reply only: GETOUCH AI API OK"
      }
    ],
    "max_tokens": 50,
    "temperature": 0.2
  }'
```

## Portal Surface

Page: `/admin/ai-services`

The admin UI now shows:

- gateway public base URL
- gateway readiness and backend type
- backend privacy posture
- current model alias mapping
- request safety limits
- health and authenticated models test actions

API key issuance and rotation UI is intentionally deferred to a follow-up change.

## Rollback

1. Remove the `llm.getouch.co` Caddy route.
2. Disable the gateway with `GETOUCH_AI_GATEWAY_ENABLED=false`.
3. Remove gateway env keys from the deployment if the foundation is no longer needed.
4. Revert the portal UI and route handlers.

Rollback does not require exposing or deploying vLLM.