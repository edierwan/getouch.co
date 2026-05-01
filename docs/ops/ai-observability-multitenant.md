# AI Observability for Multi-Tenant Workloads

Updated: 2026-05-01

## Required Metadata

Every AI event, trace, prompt execution, workflow step, retrieval call, and messaging-driven AI action should carry the following metadata:

- tenant_id
- tenant_slug
- channel
- user_id
- conversation_id
- app_id
- workflow_id
- model
- provider
- environment

## Apply Across These Services

- Dify
- LiteLLM
- Langfuse
- n8n
- MCP
- Qdrant
- Chatwoot
- Baileys
- Evolution

## Operating Model

- Start with one Langfuse project: `getouch-production`.
- Use `tenant_id` and `tenant_slug` metadata first instead of creating many projects immediately.
- Split very large tenants into dedicated Langfuse projects later only when scale or data isolation needs justify it.
- Do not store secrets in trace metadata.
- Avoid sensitive customer payloads unless they are explicitly required, compliant, and appropriately redacted.

## Service Guidance

### Dify

- Propagate tenant metadata into app runs, workflow runs, and tool invocations.
- Include `app_id`, `workflow_id`, and `environment` consistently.

### LiteLLM

- Stamp `tenant_id`, `model`, `provider`, and `environment` on every routed request.
- Keep auth keys and provider secrets out of tracing payloads.

### Langfuse

- Use shared project `getouch-production` initially.
- Standardize trace metadata keys so cross-service joins stay consistent.

### n8n

- Carry tenant metadata through webhook triggers, workflow context, and downstream HTTP calls.
- Preserve `workflow_id` and `channel` on automation runs.

### MCP

- Tag tool and resource calls with tenant, app, and workflow context.
- Keep request headers or auth material out of trace metadata bodies.

### Qdrant

- Store tenant identifiers in collection design or payload filters.
- Maintain purge and retention logic keyed by tenant.

### Chatwoot, Baileys, Evolution

- Standardize `channel`, `user_id`, and `conversation_id` across ingress points.
- Attach tenant context before handing work to AI, routing, or automation services.
# AI Observability for Multi-Tenant GetTouch

Langfuse is the planned AI observability system for GetTouch.co.

ClickHouse stores high-volume trace, observation, score, latency, token, and cost analytics for Langfuse.

Redis handles queue, cache, and background ingestion workloads that support Langfuse and related AI platform services.

Recommended starting model:

- One Langfuse project: `getouch-production`
- Partition and filter traces by tenant metadata first
- Consider one project per large tenant later only if isolation or retention needs justify it

Every AI call should include metadata for multi-tenant readiness:

- `tenant_id`
- `tenant_slug`
- `channel`
- `user_id`
- `conversation_id`
- `app_id`
- `workflow_id`
- `model`
- `provider`
- `environment`

Implementation notes:

- Treat Langfuse as the UI and control plane for observability.
- Treat ClickHouse as the internal analytics store, not a first-class public app.
- Treat Redis as an internal dependency only. Do not publish a public Redis route.
- Prefer adding trace metadata consistently across Dify, LiteLLM, MCP, and n8n before adding deeper dashboards.
- Do not store secrets in trace metadata.
- Avoid logging sensitive customer data unless it is explicitly required and compliant.