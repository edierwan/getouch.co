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