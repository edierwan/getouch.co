# AI Runtime Integration

## Operator Contract

The portal is the operator-facing control surface for AI runtime management.

- Product apps such as WAPI must use only `PLATFORM_API_URL`, `PLATFORM_APP_CODE`, and `PLATFORM_APP_KEY`.
- Product apps must not store or call LiteLLM keys, vLLM URLs, or backend model runtime endpoints.
- The Platform Broker validates app identity and service access.
- LiteLLM is the server-side AI router used by the broker.
- vLLM is the production model runtime behind LiteLLM.
- OpenWebUI is an admin testing playground only.
- Ollama is for development and testing only.

## Current Flow

1. App sends AI chat traffic to the Platform Broker.
2. Platform Broker validates the Platform App Key and required capability.
3. Broker forwards the request server-side to LiteLLM.
4. LiteLLM routes to the configured model backend.
5. vLLM serves the active production model when deployed.

## Environment Surface For Apps

Apps should be configured with:

- `PLATFORM_API_URL`
- `PLATFORM_APP_CODE`
- `PLATFORM_APP_KEY`

Apps should not require:

- LiteLLM API keys
- LiteLLM base URLs
- vLLM hostnames
- direct provider secrets

## Portal-Side AI Configuration

The portal currently resolves LiteLLM configuration from these server-side environment variables:

- `PLATFORM_LITELLM_BASE_URL`
- `PLATFORM_LITELLM_API_KEY`
- `PLATFORM_LITELLM_MODEL_ALIAS`
- `PLATFORM_LITELLM_TIMEOUT_MS`

Legacy fallbacks are still supported through:

- `GETOUCH_LITELLM_BASE_URL`
- `GETOUCH_LITELLM_API_KEY`
- `GETOUCH_LITELLM_MODEL_ALIAS`
- `GETOUCH_LITELLM_TIMEOUT_MS`

These values stay on the portal server and are not exposed to product apps.

## Current Source Of Truth

Observed live state during the runtime audit:

- LiteLLM is live on the host.
- No deployed vLLM container is currently running.
- Checked-in compose configuration does not define a vLLM or LiteLLM service.
- OpenWebUI is still wired to `pipelines` and OpenAI, not the portal-managed LiteLLM route.

Because of that, the Model Runtime Manager currently treats model switching as manual-gated.

## Why Switching Is Manual-Gated

The portal must not claim that a model switch succeeded unless the runtime path is verifiably safe.

At the time of implementation:

- the live host does not expose a checked-in vLLM deployment contract,
- the active LiteLLM to vLLM path is not fully represented in repo configuration,
- OpenWebUI is not yet aligned to the intended LiteLLM routing path.

For that reason, the portal returns a manual action plan instead of pretending to automate the switch.

## Admin Routes Added

- `POST /api/platform/ai/chat`
  - broker-facing AI route for product apps
  - validates `platform:ai`
  - forwards server-side to LiteLLM
- `GET /api/admin/service-endpoints/vllm/status`
  - returns operator-facing runtime manager status
- `POST /api/admin/service-endpoints/vllm/model-switch`
  - returns the current switch plan
  - remains manual-required until the host runtime path is safely automatable

## Expected Next Infrastructure Step

Before the portal can offer real automated switching, the platform needs a stable deployment contract for:

- a managed vLLM service definition,
- a managed LiteLLM service definition or equivalent source of truth,
- a verified LiteLLM route update path,
- OpenWebUI pointed at the intended admin testing route.