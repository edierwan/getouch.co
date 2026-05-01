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
- Authentik: planned central SSO and identity provider.

### AI Engine & Cognition

- vLLM Gateway: public inference gateway surface.
- LiteLLM Gateway: planned model routing and OpenAI-compatible proxy layer.
- Dify: AI workflow and application builder.
- MCP Endpoint: portal-backed Model Context Protocol endpoint.
- Qdrant: planned vector database for RAG, retrieval, and AI memory.

### Automation & Data Flow

- n8n Workflows: workflow automation runtime.
- Webhooks: portal-managed webhook and delivery surface.
- Airbyte: planned ingestion / ELT sync runtime.

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
- Langfuse: planned AI observability and tracing runtime.

### Access & Security

- API Keys: tenant/app/client key issuance and management.
- Infisical: planned internal secret vault.
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
- Future service-specific databases: authentik, airbyte, infisical, litellm, langfuse

## Audit and Installation Status

| Tool | Category | Status | Public URL | Runtime Notes | Dependencies |
| --- | --- | --- | --- | --- | --- |
| Authentik | System Orchestration | Install blocked | https://sso.getouch.co | No live runtime detected. `authentik.getouch.co` DNS is not currently published. | PostgreSQL `authentik`, Redis / Valkey |
| Qdrant | AI Engine & Cognition | Install blocked | https://qdrant.getouch.co | No live runtime detected. Public route not served. | Persistent storage, API auth |
| Airbyte | Automation & Data Flow | Install blocked | https://airbyte.getouch.co | No live runtime detected. Public route not served. | PostgreSQL `airbyte` |
| Infisical | Access & Security | Install blocked | https://infisical.getouch.co | No live runtime detected. Public route not served. | PostgreSQL `infisical`, secure bootstrap |
| LiteLLM | AI Engine & Cognition | Install blocked | https://litellm.getouch.co/v1 | No live runtime detected. Current route responds without a live backend. | PostgreSQL `litellm`, auth/master key |
| Langfuse | Observability & Tracing | Install blocked | https://langfuse.getouch.co | No live runtime detected. Public route not served by origin. | PostgreSQL `langfuse`, ClickHouse, Redis |
| ClickHouse | Infra & Persistence | Install blocked | https://clickhouse.getouch.co | No live runtime detected. Public route not served by origin. | Internal-only or authenticated access |
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

## Why Installation Was Blocked

The portal and route work was completed, but safe autonomous installation of the missing foundation tools was blocked by production bootstrap requirements that should not be guessed in-place:

- No matching Coolify applications or standalone PostgreSQL resources currently exist for the missing tools.
- Several target public routes are not yet published or are not yet served by origin.
- The missing services require secure bootstrap secrets and admin setup values that should not be auto-generated and deployed blindly into production.
- Exposing Authentik, Infisical, LiteLLM, Qdrant, or Langfuse without a correct auth bootstrap would reduce security posture.

## Security Guardrails Verified

- Redis is internal-only. No public Redis route was detected.
- ClickHouse is not publicly served by origin.
- Qdrant is not publicly served by origin.
- LiteLLM is not backed by a live runtime and should not be treated as production-ready.
- Infisical is not live and should require secure initial admin setup before exposure.
