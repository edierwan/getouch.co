# AI Observability for Multi-Tenant Workloads

Updated: 2026-05-01

Langfuse is now installed on `langfuse.getouch.co` with ClickHouse and Redis running as internal dependencies. LiteLLM and Qdrant are also installed, so the metadata contract below now applies to live production runtimes rather than planned placeholders.

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
- Complete provider wiring before routing production inference traffic through the shared gateway.

### Langfuse

- Use shared project `getouch-production` initially.
- Standardize trace metadata keys so cross-service joins stay consistent.
- Admin access is now live for the shared project; keep production API key issuance inside controlled operator workflows.

### n8n

- Carry tenant metadata through webhook triggers, workflow context, and downstream HTTP calls.
- Preserve `workflow_id` and `channel` on automation runs.

### MCP

- Tag tool and resource calls with tenant, app, and workflow context.
- Keep request headers or auth material out of trace metadata bodies.

### Qdrant

- Store tenant identifiers in collection design or payload filters.
- Maintain purge and retention logic keyed by tenant.
- Keep API authentication enabled on protected collection and mutation endpoints.

### Chatwoot, Baileys, Evolution

- Standardize `channel`, `user_id`, and `conversation_id` across ingress points.
- Attach tenant context before handing work to AI, routing, or automation services.