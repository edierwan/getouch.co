# Model Provider Routing Plan

Date: 2026-04-30

## Goal

Separate provider roles clearly so tenant apps, admin tooling, and operator UIs do not confuse:
- Ollama local models
- Assistant pipeline aliases
- vLLM high-throughput models
- Dify orchestration workflows

## Routing flow

```text
Tenant App
  -> Getouch AI Gateway
  -> Provider Router
     -> Ollama
     -> Assistant Pipeline
     -> vLLM
     -> Dify app/workflow when orchestration is required
```

## Provider roles

Ollama:
- Default local runtime on the shared single-GPU host.
- Best for always-on local chat and low-risk fallback behavior.
- Should remain the default when vLLM is not explicitly deployed and ready.

Assistant Pipeline:
- Exposes curated assistant behavior rather than raw base-model inventory.
- Should be labeled with an explicit provider prefix such as `assistant:`.
- Best for branded assistant experiences, routing logic, tool orchestration, and guardrail layers.

vLLM:
- Reserved for explicitly deployed OpenAI-compatible high-throughput serving.
- Should only appear as active when the backend container exists and `/ready` succeeds.
- Best for stable external API access and higher concurrency after deployment approval.

Dify:
- Separate orchestration product, not a drop-in model provider label.
- Best for app-level workflows, prompt chains, and multi-step automations.

## Tenant-level mapping

Recommended model registry shape:
- Store tenant-visible aliases in database or admin-managed configuration, not hard-coded UI lists.
- Each alias should resolve to:
  - provider type
  - provider model id
  - fallback alias
  - allowed tenant ids or groups
  - rate limit / quota policy
  - enabled / planned / blocked status

Example aliases:
- `assistant:getouch-smart-assistant`
- `ollama:qwen3-14b`
- `vllm:getouch-qwen3-14b`

## Fallback behavior

Recommended order:
1. Tenant-requested alias resolves to preferred provider.
2. If that provider is unavailable, the router checks an allowed fallback alias.
3. If no safe fallback exists, return a provider-unavailable error instead of silently switching to a different capability profile.

Example:
- `vllm:getouch-qwen3-14b`
  - preferred provider: vLLM
  - fallback: `ollama:qwen3-14b`
  - only active when vLLM is deployed and ready

## Admin changes without code changes

Support these admin-managed controls:
- enable/disable alias
- change provider target for an alias
- change fallback chain
- change tenant visibility
- change quota/rate-limit profile

This should be backed by configuration data or tables, not component constants.

## Rate limits and quotas

Suggested control model:
- gateway-level API key rate limits for public endpoints
- tenant-level daily token/request ceilings
- alias-level concurrency caps for expensive providers such as vLLM
- audit logs by tenant, alias, and provider outcome

## UI distinction requirements

Admin UI should always show provider prefixes.

Required display style:
- `ollama:<model>`
- `assistant:<alias>`
- `vllm:<alias>`
- Dify apps should be shown as `dify:<app-or-workflow>` when listed alongside model providers

Minimum admin panels:
- Provider Inventory
- Alias Routing
- Fallback Chain
- Tenant Visibility
- Rate Limit / Quota Status

## When to use Ollama vs vLLM

Use Ollama when:
- the shared GPU host must stay stable
- the model is already resident or locally cached
- low operational risk matters more than throughput

Use vLLM when:
- the backend is explicitly deployed
- OpenAI-compatible external API access is required
- throughput and batching benefits justify the deployment
- the model should be exposed through the gateway rather than through Open WebUI-only flows