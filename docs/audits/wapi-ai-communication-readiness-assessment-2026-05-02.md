# WAPI AI/Communication Readiness Assessment - 2026-05-02

Assessment scope is limited to the WAPI WhatsApp + AI + knowledge + human-support flow.

Evidence basis:

- GetTouch repo docs, control-plane schema, env-name references, Caddy routes, and service endpoint code.
- WAPI repo schema, WhatsApp webhook routes, Dify integration docs, and tenant-safety guards.
- Non-destructive public HTTP probes run on 2026-05-02.
- All tokens, passwords, API keys, and secret values are redacted.

## 1. Executive Summary

Current setup is not ready for the full intended WAPI production flow, but it is ready for contract-finalization work and a narrow first wave of non-destructive integration tests.

Verdict: `PARTIALLY READY`

Main blockers:

1. The vLLM production runtime path is not ready. `https://vllm.getouch.co/health` returns `200`, but `https://vllm.getouch.co/ready` returns `503`, so the gateway is up while the backend route is not production-ready.
2. LiteLLM is live and auth-protected, but the repo still describes provider credentials and model-provider wiring as incomplete for production traffic.
3. WAPI and the WhatsApp gateway still have a webhook contract drift: legacy docs point to `/api/wa/events`, while the current WAPI app exposes `/api/wa/webhooks/{qr,connected,disconnected,inbound,status}`.
4. WAPI has Dify-first tenant-safe foundations, but there are still no first-class WAPI code references for Evolution, LiteLLM, Qdrant, Chatwoot, or Langfuse.
5. Dify tenant dataset provisioning, direct tenant knowledge sync, and cross-tenant retrieval tests are still incomplete in WAPI.
6. Chatwoot runtime is live, but the WAPI handoff contract, account/inbox strategy, and contact mapping strategy are not yet defined end-to-end.
7. Infisical is reachable, but onboarding is still pending and Coolify env remains the current runtime source of truth.

What can be tested safely now:

- Public health/auth posture for Evolution, Dify, LiteLLM, vLLM, Qdrant, Langfuse, Infisical, and Chatwoot.
- WAPI webhook HMAC verification and typed webhook receivers with fixture payloads.
- WAPI tenant resolution from WhatsApp account/session ownership.
- Dify direct server-side calls from WAPI using tenant-safe conversation keys.
- Evolution-to-WAPI static reply tests in non-production after one canonical webhook callback contract is chosen.

Observed public probe snapshot on 2026-05-02:

| Service | Probe | Result |
| --- | --- | --- |
| LiteLLM | `/health/liveliness` | `200` |
| LiteLLM | `/v1/models` without auth | `401` |
| vLLM | `/health` | `200` |
| vLLM | `/ready` | `503` |
| Dify | `/apps` | `200` |
| Dify | `/console/api/apps?page=1&limit=1` without auth | `401` |
| Qdrant | `/healthz` | `200` |
| Qdrant | `/collections` without auth | `401` |
| Langfuse | `/api/public/health` | `200` |
| Infisical | `/api/status` | `200` |
| Chatwoot | `/` | `200` and serves login page |
| Evolution | `/` | `200` |
| Evolution | `/instance/fetchInstances` without auth | `401` |

Short note on Baileys:

- Baileys still exists in the ecosystem and parts of WAPI docs are Baileys-oriented, but this assessment treats Baileys as non-primary because Evolution is the selected WhatsApp gateway for WAPI.

## 2. Tool Role Confirmation

| Tool | Purpose in WAPI flow | Current status if discoverable | Required URL/API endpoint | Required key/secret | Should WAPI call directly? | App / tenant scoping support |
| --- | --- | --- | --- | --- | --- | --- |
| Evolution | Primary WhatsApp ingress/egress runtime for inbound events, QR/session state, and outbound sends. | Public route reachable; protected API rejects unauthenticated instance listing; portal control-plane and multi-tenant metadata tables exist. | Public: `https://evo.getouch.co`; internal admin/runtime base: `http://evolution-api:8080` | `EVOLUTION_API_KEY` / backend `AUTHENTICATION_API_KEY`; dedicated webhook signing secret ref `[redacted]` | Yes, server-side only. Not via Dify or Chatwoot. | Yes. Portal control-plane supports tenant bindings, tenant-scoped sessions, and tenant-scoped webhook records. |
| LiteLLM | AI gateway/router that should be the single model-routing entry for WAPI. | Live and auth-protected. Health passes, unauthenticated model listing returns `401`. Repo still says provider credentials/model routing need production completion. | Public: `https://litellm.getouch.co/v1`; internal if same network: `http://litellm:4000/v1` | Gateway auth/master or app-scoped key `[redacted]`; provider credentials `[redacted]` | Yes. WAPI should call LiteLLM only for model inference. Dify should also prefer LiteLLM as its provider layer. | Partial. Auth surface exists, but WAPI-specific virtual key / metadata isolation contract is not yet defined. |
| vLLM | Production local model runtime target for `Qwen/Qwen3-14B-FP8`. | Gateway health route is up, but readiness is failing (`503`). Current backend is not ready for production traffic. | Public gateway: `https://vllm.getouch.co/v1`; internal backend target: `http://vllm-qwen3-14b-fp8:8000/v1` | `GETOUCH_VLLM_GATEWAY_KEYS`, optional backend key `[redacted]` | No for normal WAPI production calls. WAPI should reach it through LiteLLM. | No tenant isolation by itself. Isolation must be carried by upstream metadata and routing policy. |
| Dify | Knowledge/workflow orchestration layer for grounded replies and AI flows. | UI reachable; console API is auth-protected; portal control-plane exists; WAPI already has a tenant-safe Dify client and Dify schema fields. | Public UI: `https://dify.getouch.co/apps`; API call pattern: `POST {baseUrl}/v1/chat-messages`; internal base via `DIFY_BASE_URL` | `DIFY_APP_API_KEY` or per-app key ref `[redacted]` | Yes, server-side only. Tenants should not use Dify directly. | Yes, if WAPI enforces tenant ownership and uses shared app/workflow plus per-tenant datasets. |
| Qdrant | Vector store for tenant-isolated retrieval and future memory/search. | Healthy and auth-protected; no WAPI-side contract exists yet. | Public: `https://qdrant.getouch.co`; internal: `http://qdrant:6333` | Qdrant API key `[redacted]`; exact env name not discoverable in repo | Prefer direct server-side use only when WAPI owns vector writes/reads; otherwise let Dify own retrieval internally. | Yes, by collection/namespace or payload filters, but WAPI policy is still undefined. |
| Chatwoot | Human support inbox and handoff destination for conversations that leave AI flow. | UI is live and serving login; portal metadata table exists; handoff routing is still only planned. | Public: `https://chatwoot.getouch.co` | WAPI should use a scoped Chatwoot API token `[redacted]` plus a webhook secret `[redacted]`; platform runtime also has internal Chatwoot secrets | Yes. WAPI should create/update conversations server-side and receive Chatwoot webhooks server-side. | Yes, strongest isolation is account-per-tenant with inbox-per-number or per-support-lane. |
| Langfuse | AI trace store for model, workflow, latency, token, and error observability. | Healthy; shared project `getouch-production` is documented as live; no WAPI code wiring yet. | Public UI/API base: `https://langfuse.getouch.co` | Langfuse public/secret keys `[redacted]`; exact env names not discoverable in repo | Indirectly through LiteLLM/Dify where possible, plus optional direct WAPI SDK instrumentation. | Yes, through metadata in a shared project initially; dedicated projects later only if needed. |
| Infisical secret refs | Secret-vault reference layer for internal service secrets only. | Healthy status endpoint; onboarding pending; not yet the active runtime source of truth. | `https://infisical.getouch.co` | Vault/machine identity credentials `[redacted]`; WAPI should store only references, not values | No browser access. Server-side only or CI/CD/runtime injection. | App/platform scope only. Do not use it for tenant business records. |

## 3. WAPI Integration Contract

WAPI already stores tenant-owned WhatsApp account/session data, inbound messages, and Dify mapping fields. It does not yet model the full Evolution/LiteLLM/Qdrant/Chatwoot/Langfuse contract as first-class application data.

Required WAPI config/mappings:

| Field | Purpose | Current evidence | Assessment |
| --- | --- | --- | --- |
| `tenant_id` | Primary tenant boundary for every lookup, store, and trace. | Already core to WAPI schema and webhook handlers. | Ready. This must remain the first-class tenancy key. |
| `whatsapp_instance_id` | Generic provider-facing instance/session identifier. | Not explicit in current WAPI schema. | Needed only if WAPI wants provider-agnostic abstraction. If Evolution is primary, do not let this diverge from the provider-specific field. |
| `evolution_instance_name` / `evolution_instance_id` | Resolves which Evolution instance/session WAPI is attached to. | Not found in current WAPI repo; Evolution control-plane exists in GetTouch repo. | Required before production. WAPI needs a direct provider mapping, not only a generic WhatsApp account row. |
| `evolution_webhook_url` | Callback URL Evolution posts to. | Legacy docs point to `/api/wa/events`; current WAPI exposes typed webhook routes only. | Required and currently inconsistent. This is a real blocker. |
| `evolution_send_api` | Base URL + route template for outbound send calls. | Not modeled in current WAPI repo. | Required before production. Store as config, not hard-coded scattered strings. |
| `dify_app_id` or `workflow_id` | Shared Dify app/workflow selection for the tenant. | `dify_app_id` exists in WAPI schema; workflow-specific id is not explicit. | Partially ready. Use `dify_app_id` today; add explicit workflow id if workflow mode is chosen. |
| `dify_knowledge_base_id` | Tenant knowledge source id. | WAPI currently uses `dify_dataset_id` / `dify_dataset_name`. | Partially ready. Treat current dataset fields as the WAPI source of truth for this concept. |
| `litellm_model_alias` | Alias WAPI sends to LiteLLM. | No WAPI reference found. | Required. Recommended to be app-scoped, not only provider-scoped. |
| `litellm_key_ref` | Secret ref for WAPI’s LiteLLM key. | No WAPI reference found. | Required. WAPI should not hold a global LiteLLM master key. |
| `vllm_model_alias` | Downstream vLLM alias or resolved route target. | No WAPI reference found. | Useful for platform routing clarity; can live in platform registry if WAPI only calls LiteLLM. |
| `qdrant_collection_or_namespace` | Tenant vector isolation target. | No WAPI reference found. | Required if WAPI writes/queries Qdrant directly. |
| `chatwoot_account_id` | Tenant Chatwoot isolation anchor. | Exists in portal metadata table, not in WAPI. | Required for handoff. |
| `chatwoot_inbox_id` | Channel or number-specific inbox target. | Exists in portal metadata table, not in WAPI. | Required for handoff. |
| `chatwoot_contact_id` mapping strategy | Maps `(app_id, tenant_id, normalized_phone)` to Chatwoot contact. | Not found in WAPI repo. | Required. This should be a mapping table, not a single loose field. |
| `langfuse_trace_metadata` | Structured per-request trace context. | Metadata contract exists in docs, not in WAPI code. | Required as runtime context, not necessarily a persisted table column. |
| `webhook_signing_secret_ref` | Secret ref for inbound/outbound webhook verification. | WAPI uses `WA_GATEWAY_SECRET`; gateway uses `WAPI_SECRET`; no single canonical ref field. | Required. Canonicalize one reference model before production. |

Important contract observations:

- WAPI already stores `api_key_ref`-style pointers and explicitly avoids plaintext provider secrets in the DB.
- WAPI already enforces tenant-safe Dify conversation keys like `tenant:<tenantId>:contact:<contactId>` and rejects bare phone numbers.
- WAPI inbound WhatsApp handling already resolves tenant from account/session ownership and does not trust phone-to-tenant mapping from the request body.
- WAPI currently has no direct repo references for LiteLLM, Qdrant, Chatwoot, Langfuse, or Evolution, which means the contract for those tools is still mostly architectural rather than implemented.

## 4. Tenant Isolation Assessment

Can Evolution map one WhatsApp instance to one WAPI tenant?

- Yes in principle. The GetTouch control-plane schema already has tenant bindings, tenant-scoped sessions, tenant-scoped webhooks, and a unique tenant binding constraint.
- The missing part is the WAPI-side provider mapping field and one canonical callback contract.
- Recommendation: one Evolution instance/session belongs to exactly one WAPI tenant at a time. Resolve tenant from instance/session/account, never from phone number.

Can Dify isolate knowledge per tenant?

- Yes, but only if WAPI stays the tenancy boundary and each tenant gets its own Dify dataset/knowledge base.
- WAPI’s own Dify architecture docs already recommend shared app/workflow plus per-tenant dataset.
- Cross-tenant retrieval tests are still missing, so the design intent is stronger than the current proof.

Should Dify use one app per tenant or one shared app with tenant variables?

- Recommendation: one shared WAPI Dify app/workflow plus one dataset per tenant for MVP.
- Use app-per-tenant only for exceptional enterprise isolation, not as the default operating model.

Can Qdrant isolate via collection per tenant or shared collection with `tenant_id` payload filter?

- Both are technically possible.
- Recommendation for WAPI MVP: collection per tenant, with an app prefix, for example `wapi__knowledge__<tenant_id>`.
- Reason: WAPI does not yet have a first-class Qdrant contract or cross-tenant filter enforcement tests. Collection-per-tenant reduces accidental data bleed and simplifies purge/export logic.

Can LiteLLM isolate usage via virtual keys/metadata per tenant?

- In principle yes, but the current repo only proves a public gateway/auth surface, not the tenant virtual-key plan.
- Recommendation: WAPI should use an app-scoped key and attach `app_id`, `tenant_id`, `conversation_id`, and `message_id` metadata on every request.
- Do not let WAPI use a platform-wide master key directly.

Can Chatwoot isolate conversations using account/inbox/team per tenant?

- Yes.
- Recommendation: account per tenant, inbox per WhatsApp number or support lane, team as an internal routing concern inside that tenant account.
- Avoid shared Chatwoot accounts across different WAPI tenants.

Can Langfuse traces include `app_id`, `tenant_id`, `conversation_id`, and `message_id`?

- Yes. The current observability contract already standardizes `tenant_id`, `tenant_slug`, `channel`, `conversation_id`, `app_id`, `workflow_id`, `model`, `provider`, and `environment`.
- Add `message_id` explicitly for the WAPI flow.

Is there any risk of tenant A seeing tenant B data?

- Yes, today there is material risk if the missing contracts remain implicit.
- Highest-risk areas are Dify dataset selection, Qdrant namespace choice, Chatwoot account/inbox choice, LiteLLM key scope, and the current webhook URL drift.
- WAPI’s existing tenant guards are good foundations, but the platform-side mapping registry is still too thin for production confidence.

## 5. App/Future-App Isolation

Do we need `app_id` / `app_code` in platform mappings?

- Yes. Without `app_id`, WAPI and future apps will eventually collide on Dify apps, LiteLLM keys, Qdrant collections, Chatwoot assets, and Langfuse traces.

Can each app have its own LiteLLM key?

- Yes, and it should.
- Recommendation: app-scoped LiteLLM key per product app. Tenant isolation then rides on request metadata and platform binding rules.

Can each app have separate Dify apps/workspaces?

- Yes.
- Recommendation: separate Dify app/workflow family per product app; shared operator workspace is acceptable initially.

Can each app have separate Chatwoot inbox/account strategy?

- Yes.
- Recommendation: keep WAPI handoff assets logically separate from future apps at least by account naming and integration bindings, and preferably by account boundary where workflows differ.

Can each app have separate Qdrant namespace/collections?

- Yes.
- Recommendation: app prefix is mandatory even if collection-per-tenant is chosen.

Can traces be separated by `app_id`?

- Yes.
- Recommendation: shared Langfuse project first, strict `app_id` metadata always, separate Langfuse project only when scale or isolation justifies it.

What minimum registry tables are needed?

- See section 6. Current evidence does not show an existing app-level platform registry that covers these relationships.

## 6. Minimal Platform Registry Proposal

This should stay minimal. The goal is only to prevent cross-app and cross-tenant confusion as WAPI becomes the first app on the shared ecosystem.

| Table | Purpose | Minimum useful columns |
| --- | --- | --- |
| `platform_apps` | Canonical product-app registry. | `id`, `app_code`, `name`, `status`, `created_at`, `updated_at` |
| `platform_app_service_keys` | App-scoped service credentials without storing raw secrets in app tables. | `id`, `app_id`, `service`, `secret_ref_id`, `label`, `active`, `created_at` |
| `platform_app_tenant_bindings` | Tenant-to-app operational bindings. | `id`, `app_id`, `tenant_id`, `status`, `evolution_instance_id`, `dify_app_id`, `dify_dataset_id`, `qdrant_namespace`, `chatwoot_account_id`, `chatwoot_inbox_id`, `created_at`, `updated_at` |
| `platform_service_integrations` | Per-app service endpoints and modes. | `id`, `app_id`, `service`, `base_url`, `internal_base_url`, `mode`, `active`, `config_json`, `updated_at` |
| `platform_model_routes` | App-scoped alias routing. | `id`, `app_id`, `alias`, `provider`, `upstream_target`, `fallback_policy`, `active`, `updated_at` |
| `platform_secret_refs` | Normalized secret pointers. | `id`, `app_id`, `service`, `ref_path`, `ref_key`, `scope`, `active`, `rotated_at`, `updated_at` |

Why this is enough:

- `platform_apps` prevents app identity drift.
- `platform_app_tenant_bindings` prevents tenant/service-mapping sprawl.
- `platform_model_routes` prevents alias confusion as LiteLLM and vLLM evolve.
- `platform_secret_refs` keeps secret values out of WAPI tables.

## 7. Infisical Secret Contract

Do not store tenant business records in Infisical. Only store internal service secrets or references to them.

Recommended paths:

| Path | Secrets required | Used by | Notes |
| --- | --- | --- | --- |
| `/prod/apps/wapi/evolution` | `base_url`, `api_key`, `webhook_signing_secret` | WAPI server | Prefer an app-scoped Evolution credential, not a platform-global admin key. |
| `/prod/apps/wapi/dify` | `base_url`, `app_api_key` | WAPI server | WAPI should keep only ref pointers in DB. |
| `/prod/apps/wapi/chatwoot` | `base_url`, `api_token`, `webhook_secret` | WAPI server | Use a scoped Chatwoot API token for WAPI, not a super-admin credential. |
| `/prod/apps/wapi/litellm` | `base_url`, `api_key` | WAPI server | WAPI should call LiteLLM with an app-scoped key. |
| `/prod/apps/wapi/langfuse` | `base_url`, `public_key`, `secret_key` | WAPI server, optional LiteLLM/Dify integration | Keep keys server-side only. |
| `/prod/platform/vllm` | `backend_base_url`, `backend_api_key` | LiteLLM / platform runtime | WAPI should not call this directly in production. |
| `/prod/platform/qdrant` or `/prod/apps/wapi/qdrant` | `base_url`, `api_key` | WAPI server or Dify integration | Prefer app-scoped Qdrant credentials if the platform supports them. |

Who should use them:

- WAPI server-side code only.
- Dify and LiteLLM server-side integrations only.
- Never the tenant browser.

Should WAPI hold master keys or scoped keys?

- Scoped keys only.
- WAPI should not hold platform-global master service keys.

Rotation and revocation recommendation:

1. Separate API credentials from webhook signing secrets.
2. Rotate app-scoped keys on a regular schedule and immediately on incident.
3. Keep secret refs versioned so WAPI can move between old/new keys during controlled rotation.
4. Revoke per-app credentials without forcing unrelated platform services to rotate.

Current state note:

- Infisical is healthy, but onboarding is still pending and Coolify env remains the active runtime source of truth today.

## 8. Dify + Qdrant Strategy

Recommended Dify strategy:

- One shared Dify app or workflow for WAPI.
- One Dify dataset/knowledge base per WAPI tenant.
- WAPI remains the tenancy boundary and decides which tenant dataset is allowed for each request.

Recommended Qdrant strategy for WAPI MVP:

- One collection per tenant, with an app prefix, rather than one shared collection with only a payload filter.
- Example naming pattern: `wapi__knowledge__<tenant_id>`.
- Reason: WAPI does not yet have direct Qdrant contract enforcement or cross-tenant retrieval tests. Safer isolation is better than denser packing at this stage.

How WAPI should map tenant to Dify app/knowledge:

- `tenant_id` -> shared WAPI Dify app/workflow id.
- `tenant_id` -> `dify_dataset_id`.
- Optional later: `tenant_id` -> `qdrant_collection` if WAPI performs direct vector writes outside Dify.

Should Dify call LiteLLM as model provider?

- Yes, for the intended production shape.
- Reason: model routing, auth, fallback policy, and tracing become centralized.
- Current readiness: not ready yet, because LiteLLM provider routing for WAPI traffic is not evidenced as complete and vLLM is not ready.

Assessment summary:

- Dify is the right workflow/knowledge surface.
- Qdrant is the right vector surface.
- The missing piece is the tenant/app registry and explicit runtime contract between WAPI, Dify, LiteLLM, and Qdrant.

## 9. Chatwoot Handoff Strategy

Recommended account / inbox / team model:

- One Chatwoot account per WAPI tenant.
- One inbox per connected WhatsApp number or support lane within that tenant.
- Teams remain an internal staffing concern inside the tenant account.

How WAPI should create/update Chatwoot conversations:

1. Normalize the customer phone number.
2. Resolve `(app_id, tenant_id, normalized_phone)`.
3. Create or find the Chatwoot contact under the tenant’s Chatwoot account.
4. Create or update the conversation under the mapped inbox.
5. Persist the contact/conversation mapping in WAPI or the minimal platform registry.

How Chatwoot replies should return to WAPI:

- Chatwoot should send outbound-message and conversation-state webhooks to a WAPI server-side callback.
- WAPI validates the webhook secret, resolves the tenant/account mapping, and transforms the agent reply into an Evolution send call.

How WAPI should send agent replies back through Evolution:

- Server-side only.
- Use the tenant’s Evolution instance mapping and WAPI-owned outbound send logic.
- Persist provider message id and delivery status on the WAPI side.

Required webhook endpoints:

- Evolution -> WAPI inbound/status callback.
- Chatwoot -> WAPI outbound message / handoff status callback.
- Recommendation: standardize one canonical WhatsApp multiplexer callback such as `/api/wa/events` inside WAPI, then route internally to typed handlers.

Current readiness:

- Chatwoot runtime is live.
- Portal tenant mapping table exists.
- Full human handoff routing is not implemented yet.

## 10. LiteLLM + vLLM Strategy

Current discoverable model route facts:

- Public vLLM alias in repo: `getouch-qwen3-14b`.
- Internal model target in repo: `Qwen/Qwen3-14B-FP8`.
- vLLM readiness is still failing today.

Recommended WAPI routing shape:

- WAPI should call LiteLLM only.
- LiteLLM should route WAPI’s text alias to the vLLM-backed `Qwen/Qwen3-14B-FP8` path.
- WAPI should not call raw vLLM directly in production.

Recommended alias strategy:

- Short-term for initial testing: WAPI can target the already discoverable alias `getouch-qwen3-14b` if LiteLLM is configured to expose it.
- Recommended production contract: create an app-scoped LiteLLM alias such as `wapi-text-primary` that resolves to the current vLLM-backed route.
- Keep `vllm_model_alias = getouch-qwen3-14b` as the downstream platform route, not necessarily the tenant-facing alias forever.

Metadata WAPI should stamp on every LiteLLM request:

- `app_id = wapi`
- `tenant_id`
- `conversation_id`
- `message_id`
- `channel = whatsapp`
- `provider = litellm`
- `resolved_provider = vllm`
- `model_alias`
- `resolved_model`
- `trace_id`

Fallback strategy if vLLM is down:

- Do not silently fall back to Ollama for production WAPI traffic, because Ollama is explicitly treated as test/dev unless chosen later.
- Recommended behavior today: fail closed, log the error, and route to human handoff or operator review.
- A non-production fallback to another provider can exist later, but it should be explicit, tested, and trace-visible.

Assessment summary:

- LiteLLM is the correct production entry point.
- vLLM is the correct intended production local runtime.
- The route is not production-ready until LiteLLM provider wiring is confirmed and vLLM `/ready` becomes healthy.

## 11. Langfuse Trace Strategy

Recommended initial project strategy:

- Use the shared project `getouch-production` first.
- Separate projects later only if scale or isolation requires it.

Required metadata for the WAPI flow:

| Key | Required value / shape | Reason |
| --- | --- | --- |
| `app_id` | `wapi` | Separates WAPI from future apps. |
| `tenant_id` | tenant UUID | Core tenant isolation and audit boundary. |
| `conversation_id` | WAPI conversation id | Correlates multi-message sessions. |
| `message_id` | WAPI or provider message id | Connects a trace to one message/reply decision. |
| `channel` | `whatsapp` | Channel segmentation. |
| `provider` | `litellm`, `vllm`, or `dify` | Cross-service observability. |
| `model` | route alias and resolved model | Model accountability. |
| `latency` | milliseconds | Performance tracking. |
| `token_usage` | prompt/completion/total | Cost and quota monitoring. |
| `error_state` | success/failure classification and error code | Failure analysis. |

Additional strongly recommended fields:

- `workflow_id`
- `evolution_instance_id`
- `chatwoot_conversation_id` when handoff occurs
- `contact_id`

## 12. Recommended First Test Plan

### Test 1: Evolution -> WAPI static reply

Purpose:

- Prove WhatsApp ingress, tenant resolution, signed callback verification, and outbound reply without adding AI complexity.

Preconditions:

- Choose one canonical Evolution/WAPI callback contract.
- Align the gateway shared-secret reference naming.
- Use a non-production Evolution instance bound to a single WAPI tenant.

Expected result:

- WAPI receives the inbound event, resolves tenant by instance/account mapping, stores the message, and sends a hardcoded reply through Evolution.

Current assessment:

- Safe to start once the webhook URL contract is standardized.
- Blocked if the system still points at `/api/wa/events` without a WAPI multiplexer route.

### Test 2: WAPI -> LiteLLM -> vLLM Qwen3-14B-FP8

Purpose:

- Prove the intended production AI route independently of WhatsApp ingress.

Preconditions:

- vLLM `/ready` must return `200`.
- LiteLLM must have a confirmed route for the WAPI alias.

Expected result:

- One WAPI server-side request gets a model response through LiteLLM and the vLLM-backed Qwen route.

Current assessment:

- Blocked today because vLLM readiness is failing and LiteLLM provider routing for WAPI is not yet evidenced as complete.

### Test 3: Evolution -> WAPI -> LiteLLM -> vLLM -> Evolution reply

Purpose:

- Prove the core AI reply loop without Dify knowledge or human handoff.

Preconditions:

- Test 1 and Test 2 must both pass.

Expected result:

- Inbound WhatsApp message triggers AI draft/response generation and Evolution returns the reply.

Current assessment:

- Not ready today.

### Test 4: Evolution -> WAPI -> Dify knowledge -> LiteLLM/vLLM -> Evolution reply

Purpose:

- Prove the knowledge-grounded reply path.

Preconditions:

- Tenant dataset provisioning exists.
- Dify app/dataset mapping is stored per tenant.
- Dify model provider path is set to LiteLLM.

Expected result:

- Dify retrieves only tenant-approved knowledge and returns a grounded reply path.

Current assessment:

- Not ready today because tenant dataset provisioning and isolation proof are incomplete.

### Test 5: WAPI -> Chatwoot handoff -> Chatwoot webhook -> WAPI -> Evolution reply

Purpose:

- Prove human handoff and return-to-WhatsApp flow.

Preconditions:

- Chatwoot account/inbox structure exists for the tenant.
- WAPI contact/conversation mapping exists.
- Chatwoot webhook contract is implemented and signed.

Expected result:

- WAPI opens or updates a Chatwoot conversation, an agent replies in Chatwoot, Chatwoot webhook posts back to WAPI, and WAPI sends the reply through Evolution.

Current assessment:

- Not ready today.

### Test 6: Langfuse trace verification

Purpose:

- Prove trace completeness and metadata quality.

Preconditions:

- At least one AI-bearing test above must pass.

Expected result:

- Langfuse shows a trace with `app_id=wapi`, `tenant_id`, `conversation_id`, `message_id`, `channel=whatsapp`, provider/model metadata, latency, token usage, and error state.

Current assessment:

- Langfuse runtime is ready, but WAPI trace emission is not yet wired in the observable flow.

## 13. Risks / Blockers

- No canonical Evolution/WAPI webhook contract yet.
- Shared secret naming is split between `WAPI_SECRET` on the gateway side and `WA_GATEWAY_SECRET` on the WAPI side.
- vLLM runtime is not ready for production inference.
- LiteLLM gateway is live, but WAPI-specific routing and scoped-key policy are not defined.
- WAPI has no first-class Evolution/LiteLLM/Qdrant/Chatwoot/Langfuse integration mappings yet.
- Dify tenant dataset strategy is documented, but tenant dataset provisioning and cross-tenant proof are incomplete.
- Qdrant collection/namespace strategy is not yet set for WAPI.
- Chatwoot tenant account/inbox/contact mapping is not yet defined in WAPI.
- Langfuse tracing contract exists only at documentation level for WAPI.
- WAPI should not hold master service keys, but the scoped-key contract is not yet formalized.
- Parts of the current WAPI WhatsApp documentation are still Baileys-oriented even though Evolution is the selected primary gateway.

## 14. Final Recommendation

What is ready:

- Evolution, Dify, LiteLLM, Qdrant, Langfuse, Infisical, and Chatwoot are all reachable at the platform level.
- WAPI already has solid tenant-safe foundations for WhatsApp account ownership, webhook verification, inbound message storage, and Dify conversation-key safety.

What is not ready:

- The full production path `Evolution -> WAPI -> Dify -> LiteLLM -> vLLM -> Langfuse -> Evolution`.
- Canonical webhook routing between the gateway and WAPI.
- Dify/Qdrant tenant knowledge provisioning.
- Chatwoot handoff routing.
- App-level registry and secret-ref normalization.

What to configure first:

1. Canonical WhatsApp webhook callback contract and shared-secret ref naming.
2. App-level registry and secret-ref model for WAPI.
3. LiteLLM WAPI alias plus scoped LiteLLM key ref.
4. vLLM backend readiness for `Qwen/Qwen3-14B-FP8`.
5. Dify tenant dataset mapping and provisioning flow.
6. Chatwoot account/inbox/contact mapping strategy.

Can WAPI integration start now?

- Yes for non-production contract work, endpoint/auth verification, static-reply testing, and narrow service-by-service integration.
- No for the full intended production AI + knowledge + handoff flow.

What must be decided before production:

- One canonical Evolution callback pattern.
- One WAPI secret-ref contract for gateway/webhook trust.
- One Dify isolation model for normal tenants.
- One Qdrant isolation model for WAPI knowledge/memory.
- One Chatwoot account/inbox policy per tenant.
- One LiteLLM scoped-key and alias strategy per app.
- One failure policy when AI runtime is unavailable, with human handoff as the safe default.