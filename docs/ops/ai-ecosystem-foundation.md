# AI Ecosystem Foundation

Updated: 2026-05-01

## Purpose

This document records the current GetTouch AI ecosystem foundation after the portal IA and canonical route pass.

The portal is being prepared as a future multi-tenant AI infrastructure platform. The portal deployment path remains unchanged:

Cloudflare -> Caddy -> getouch-coolify-app -> Coolify app container

Portal deployment remains Coolify-only.

## Final Tool Architecture

### System Orchestration

- Dashboard: portal control-plane summary and status surface.
- Servers & Nodes: host/runtime overview for the primary VPS and ingress/runtime topology.
- Authentik: installed central SSO and identity provider on `sso.getouch.co`.

### AI Engine & Cognition

- vLLM Gateway: public inference gateway surface.
- LiteLLM Gateway: installed model routing and OpenAI-compatible proxy layer.
- Dify: AI workflow and application builder.
- MCP Endpoint: portal-backed Model Context Protocol endpoint.
- Qdrant: installed vector database for RAG, retrieval, and AI memory.

### Automation & Data Flow

- n8n Workflows: workflow automation runtime.
- Webhooks: portal-managed webhook and delivery surface.
- Airbyte: still blocked pending a vetted custom stack for this Coolify version.

### Communication Hubs

- Evolution Gateway: WhatsApp Business API runtime.
- Baileys Gateway: Baileys multi-device gateway runtime.
- Open WebUI: operator and user AI workspace.
- Chatwoot: customer communication workspace.
- FusionPBX / Voice: voice routing and PBX runtime.

### Infra & Persistence

- Coolify: canonical deployment control plane.
- Databases: portal surface for PostgreSQL, service databases, ClickHouse, Redis, and pgAdmin.
- Object Storage: SeaweedFS-backed object storage runtime.
- Backups: portal backup and restore operations.
- ClickHouse: Langfuse analytics dependency.
- Redis / Queue Cache: internal cache and queue dependency.

### Observability & Tracing

- Grafana: metrics and operational dashboards.
- Langfuse: installed AI observability and tracing runtime.

### Access & Security

- API Keys: tenant/app/client key issuance and management.
- Infisical: installed internal secret vault.
- SDK & Docs: operator and integration documentation.
- Quick Links: operator shortcut surface.

## Runtime Apps vs Internal Dependencies

### Runtime Apps

- Portal
- Dify
- MCP Endpoint
- n8n
- Evolution Gateway
- Baileys Gateway
- Open WebUI
- Chatwoot
- FusionPBX / Voice
- Coolify
- Grafana

### Internal Dependencies

- PostgreSQL
- ClickHouse
- Redis / Queue Cache
- SeaweedFS object storage components
- Service-specific databases: authentik, infisical, litellm, langfuse
- Airbyte database remains pending because the runtime is not deployed.

## Audit and Installation Status

| Tool | Category | Status | Public URL | Runtime Notes | Dependencies |
| --- | --- | --- | --- | --- | --- |
| Authentik | System Orchestration | Installed | https://sso.getouch.co | Coolify-managed runtime is healthy and the public route returns the expected login redirect. Admin onboarding is still pending. | PostgreSQL `authentik`, Redis / Valkey |
| Qdrant | AI Engine & Cognition | Installed | https://qdrant.getouch.co | Coolify-managed runtime is healthy. `GET /healthz` returns `200` and protected collection access returns `401` without credentials. | Persistent storage, API auth |
| Airbyte | Automation & Data Flow | Blocked | https://airbyte.getouch.co | No live runtime detected. Coolify `4.0.0` on this host has no built-in Airbyte template, and no vetted custom stack has been deployed yet. | PostgreSQL `airbyte` |
| Infisical | Access & Security | Installed | https://infisical.getouch.co | Coolify-managed runtime is healthy and `/api/status` returns `200`. Initial admin onboarding is still pending. | PostgreSQL `infisical`, secure bootstrap |
| LiteLLM | AI Engine & Cognition | Installed | https://litellm.getouch.co | Coolify-managed runtime is healthy and the public gateway responds on `/health/liveliness`. Anonymous `GET /v1/models` requests are correctly rejected with `401` until provider credentials and client auth are configured. | PostgreSQL `litellm`, auth/master key |
| Langfuse | Observability & Tracing | Installed | https://langfuse.getouch.co | Coolify-managed runtime and dependencies are healthy. `/api/public/health` returns `200`. Initial admin onboarding is still pending. | PostgreSQL `langfuse`, ClickHouse, Redis |
| ClickHouse | Infra & Persistence | Installed | Internal only | ClickHouse is healthy as the Langfuse analytics store and should remain internal-only unless authenticated access is explicitly designed. | Internal-only or authenticated access |
| Redis / Queue Cache | Infra & Persistence | Installed | Internal only | `coolify-redis` is healthy. Additional dedicated Redis runtimes also exist for platform apps. | Internal only |

## Existing Installed Tools Preserved and Remapped

- Dify
- MCP Endpoint
- n8n Workflows
- Evolution Gateway
- Baileys Gateway
- Open WebUI
- Chatwoot
- FusionPBX / Voice
- Coolify
- Grafana
- Object Storage
- API Keys
- Webhooks
- SDK & Docs
- Quick Links

## Runtime Installation Outcome

The missing foundation runtimes that were safe to install through built-in Coolify templates were installed directly on production:

- Authentik
- Qdrant
- Infisical
- LiteLLM
- Langfuse
- ClickHouse and dedicated Redis dependencies for Langfuse

Airbyte remains blocked because the current Coolify release on this host does not ship a production-ready Airbyte template, and a custom stack was not introduced blindly into production.

## Airbyte Next Safe Action

- Status: Blocked pending a vetted custom Coolify-compatible stack.
- Database: `airbyte` remains the prepared target database name.
- Domain: `airbyte.getouch.co` remains the prepared public hostname.
- Next safe action: review the official Airbyte self-managed production stack, adapt it explicitly for Coolify, and validate its database, worker, and storage requirements before any deployment.

## Security Guardrails Verified

- Redis is internal-only. No public Redis route was detected.
- ClickHouse should remain internal-only. No authenticated public exposure was intentionally enabled.
- Qdrant is live and requires API authentication for protected collection access.
- LiteLLM has a live public gateway. Provider credentials are still pending before it should carry production traffic.
- Infisical is live and still requires secure initial admin onboarding before operator use.
