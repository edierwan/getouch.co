# Centralized API Key Manager (2026-04-28)

## Goal

A single place inside `portal.getouch.co` to issue, scope, rotate, revoke, audit, and inventory API keys for every Getouch gateway:

- vLLM API (`vllm.getouch.co`)
- WhatsApp Gateway (`wa.getouch.co`)
- Voice API (`voice.getouch.co`, planned)
- Webhooks
- Internal portal APIs
- External integrations
- Reserved future LiteLLM (`llm.getouch.co`)

## Routes

- UI: `/admin/api-keys` (admin only)
- Sidebar: **Developer Platform → API Keys / Webhooks / SDK & Docs**
- API:
  - `GET /api/admin/api-keys` — list, stats, gateways, secret inventory, scope catalog
  - `POST /api/admin/api-keys` — create new key (returns plaintext **once**)
  - `GET /api/admin/api-keys/:id` — detail + per-key usage + audit
  - `POST /api/admin/api-keys/:id` with body `{ action: rotate|disable|revoke|enable }`

## Key format

```
gtc_live_<random32>      # production
gtc_test_<random32>      # sandbox
```

`<random32>` is a 24-byte cryptographic random encoded as base64url. Total key length: ~41 chars including the `gtc_<env>_` label.

The first 8 chars after `gtc_<env>_` form the **public prefix** used for display, search, and copy-to-clipboard. Example shown in UI: `gtc_live_a8b3df21`.

## Storage model

- Plaintext is **never persisted** — shown ONCE at creation time only.
- Stored value is `HMAC-SHA256(plaintext, AUTH_SECRET)` (the same `AUTH_SECRET` used to sign sessions). This pepper means a DB leak alone is insufficient to brute-force keys.
- Reverse lookup is exact-match against `keyHash`. No bcrypt/argon hashing in validation path → constant-time DB hit, no per-request CPU cost.

### Why HMAC vs bcrypt?

bcrypt is for passwords (low-entropy, human-chosen). API keys are 192-bit random — collision and brute-force resistance come from the entropy of the key itself. HMAC + pepper:

- O(1) DB lookup — no scan of all hashes
- No CPU cost in the hot validation path
- DB leak alone is not enough; attacker also needs `AUTH_SECRET`

If `AUTH_SECRET` rotates, all keys must be re-issued. This is documented as a deliberate constraint.

## Schema

See [lib/schema.ts](../lib/schema.ts) (`apiKeys` exported as TS, table name `central_api_keys`; plus `central_api_key_usage_logs`, `central_api_key_audit_logs`, `central_api_secret_inventory`) and migration [drizzle/0006_api_keys.sql](../drizzle/0006_api_keys.sql).

> Tables are prefixed `central_*` to avoid colliding with the pre-existing legacy `api_keys` table (integer id, FK from `connected_apps`) used by the WhatsApp app integration. The legacy table is left fully intact.

`services` and `scopes` are stored as JSONB string arrays (not normalized child tables) for foundation simplicity. They can be normalized later without breaking the public API surface.

## Scope model

Scopes are namespaced strings. Wildcards (`ai:*`, `*`) are recognized by the validator.

| Group | Scopes |
|-------|--------|
| `ai` | `ai:chat`, `ai:embed`, `ai:models`, `ai:admin` |
| `model` | `model:getouch-qwen3-14b`, `model:getouch-qwen3-30b`, `model:getouch-embed`, `model:ollama`, `model:vllm` |
| `whatsapp` | `whatsapp:send`, `whatsapp:read`, `whatsapp:session`, `whatsapp:webhook`, `whatsapp:admin` |
| `voice` | `voice:call`, `voice:broadcast`, `voice:logs`, `voice:admin` |
| `webhook` | `webhook:receive`, `webhook:send`, `webhook:manage` |
| `internal` | `internal:read`, `internal:write`, `internal:admin` |

A key may carry any combination of scopes from any number of services.

## Validation library

`lib/api-keys.ts` exports `validateApiKey({ authorizationHeader, requiredService?, requiredScope?, ip? })` returning a sanitized result:

```ts
| { ok: true; keyId; keyPrefix; tenantId; scopes; services }
| { ok: false; code: 'missing_api_key' | 'invalid_api_key' | 'revoked_api_key'
              | 'disabled_api_key' | 'expired_api_key' | 'insufficient_scope'
              | 'service_not_allowed' | 'rate_limited'; status; message }
```

Never returned to the caller: `keyHash`, full plaintext, internal stack traces.

The library will be wired into the existing vLLM gateway (`/v1/*` routes) behind a feature flag in a follow-up change. WhatsApp gateway keeps its legacy validation for now (see migration plan below).

## Validation source flag

Each key carries `validationSource`:

- `central` — issued and validated by this manager (default for new keys)
- `legacy_wa` — imported metadata from `wa.getouch.co`; validation still happens in the WAPI service
- `env` — represents an env-managed secret (Coolify); never validated through this manager
- `manual` — manually catalogued; validation handled outside the portal
- `unknown`

## WhatsApp migration plan

Existing WhatsApp keys live in `wapi/src/db/schema.ts` (`api_keys` table). Those keys keep working unchanged. Plan:

1. Phase A — **Inventory** (this commit): central manager exists; WA keys not yet imported.
2. Phase B — **Import metadata** (next change): a one-shot script reads WA `api_keys`, copies *non-secret* metadata (name, prefix, tenant, scopes, status, last-used) into the central `api_keys` table with `validation_source = 'legacy_wa'`. Plaintext is **never** reconstructed; `key_hash` is left as a placeholder marker that fails central validation by design — these keys remain validated only by the WAPI service.
3. Phase C — **Reissue path**: provide a "rotate to central" action that issues a fresh `gtc_live_*` key and disables the legacy WA record after a grace period.
4. Phase D — **Cutover**: WAPI gateway optionally accepts central keys via the shared validation library (Phase 8 of the plan).

Existing WAPI users see no break in any phase.

## Coolify env secret inventory

`/admin/api-keys` → **Gateways** tab shows a curated catalog of env-based secrets we expect across services. The portal only checks **whether** the variable is set in its own `process.env`, never the value. No browser exposure, no log line, no commit.

Catalog (read-only, in code at `lib/api-keys.ts → SECRET_CATALOG`):

- `GETOUCH_VLLM_GATEWAY_KEYS`, `GETOUCH_VLLM_BACKEND_API_KEY`, `GETOUCH_VLLM_GATEWAY_ADMIN_TEST_KEY`
- `GETOUCH_AI_API_KEY` (legacy alias)
- `WA_API_KEY`, `WA_ADMIN_KEY`
- `OPENAI_API_KEYS`, `WEBUI_SECRET_KEY`
- `DIFY_APP_API_KEY`
- `AUTH_SECRET`, `SESSION_SECRET`, `SEARXNG_SECRET`

Coolify API integration is **not** added in this commit. Inventory is presented as a manual catalog so we never need a Coolify token in the portal process.

## Security guarantees in this implementation

| Concern | Implementation |
|---|---|
| Plaintext at rest | Never. Only HMAC hash. |
| Plaintext in API responses | Once, only at create / rotate. |
| `key_hash` ever leaves DB | Never. Sanitized in routes. |
| `Authorization` header logged | Never. Logger does not see headers. |
| Admin-only enforcement | `getSession()` + role check at route entry. |
| Audit trail | `api_key_audit_logs` for create / disable / revoke / rotate / status changes. |
| Confirmations | UI requires JS `confirm()` for revoke / disable / rotate. |
| Rate limit | Schema-level fields exist; enforcement library hook present. Per-key in-memory limiter wired into vLLM gateway. |
| Input validation | Length caps on name (200), services (16), scopes (64), origins (16). |
| Error sanitization | Validation errors return discrete `code` + sanitized `message`. No stacks. |

## Stats shown on the page

- Total Keys
- Active Keys (% of total)
- Gateway Services (count from `getGatewayServices()`)
- Requests Today (24h count from `api_key_usage_logs`)

## What is **not** in this commit

- Live wiring of `validateApiKey()` into vLLM gateway (`/v1/*`). vLLM still enforces its own `GETOUCH_VLLM_GATEWAY_KEYS`.
- Coolify API call to enumerate real env-key status across services (manual catalog only).
- WhatsApp metadata import job (Phase B of migration).
- Cross-service rate limiter (only schema fields and per-vLLM in-memory limiter exist).
- Webhook signing secrets.
- SDK / docs page (`/admin/api-keys#docs` anchor only — page is not yet built).

These are all explicit follow-ups, documented above.

## Required deployment steps

1. **Run migration** on the production DB:

   ```bash
   psql "$DATABASE_URL" -f drizzle/0006_api_keys.sql
   ```

   Idempotent (`CREATE TABLE IF NOT EXISTS`, enum guarded by `DO $$ ... EXCEPTION WHEN duplicate_object`).

2. **No new env vars required.** The manager reuses `AUTH_SECRET` as HMAC pepper.

3. **No Caddy change required.** Routes live under existing `portal.getouch.co`.

4. Coolify auto-deploys the application on push to `main`.

## Rollback

1. Remove the sidebar entry by reverting `app/admin/data.ts`.
2. Remove `/admin/api-keys` page directory.
3. Remove `/api/admin/api-keys/*` route directories.
4. Drop the four new tables (manual SQL — see migration file).
5. Revert `lib/api-keys.ts` and the schema additions.

Rollback never touches WAPI, vLLM gateway, or any existing key.

## Changelog

### 2026-04-28 — Foundation

- Added centralized API Key Manager UI at `/admin/api-keys`.
- Added Developer Platform sidebar section.
- Added schema: `api_keys`, `api_key_usage_logs`, `api_key_audit_logs`, `api_secret_inventory`.
- Added `lib/api-keys.ts` with `generateApiKey`, `hashApiKey` (HMAC-SHA256 + pepper), `validateApiKey`, `recordAudit`, `recordUsage`, `getApiKeyStats`, `createApiKey`, `rotateApiKey`, `setApiKeyStatus`.
- Added admin API routes for list / create / detail / rotate / disable / revoke / enable.
- Added Coolify env-secret inventory (read-only catalog; values never displayed).
- WhatsApp keys remain on WAPI legacy validation; migration plan documented.
- vLLM and Voice gateways still self-validate; central library is ready to plug in.
- LiteLLM domain `llm.getouch.co` confirmed reserved (not in use).
- Existing services intentionally untouched until explicit migration phases.
