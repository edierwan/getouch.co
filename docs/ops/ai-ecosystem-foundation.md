# AI Ecosystem Foundation

Updated: 2026-05-02

## Purpose

This document records the current GetTouch AI ecosystem foundation after the portal IA and canonical route pass.

The portal is being prepared as a future multi-tenant AI infrastructure platform. The portal deployment path remains unchanged:

Cloudflare -> Caddy -> getouch-coolify-app -> Coolify app container

Portal deployment remains Coolify-only.

## Final Tool Architecture

### Infra & Persistence

- Servers & Nodes: host/runtime overview for the primary VPS and ingress/runtime topology.
- Coolify: canonical deployment control plane.
- Databases: portal surface for PostgreSQL, service databases, ClickHouse, Redis, and pgAdmin.
- Object Storage: SeaweedFS-backed object storage runtime.
- Backups: portal backup and restore operations.
- ClickHouse: Langfuse analytics dependency.
- Redis / Queue Cache: internal cache and queue dependency.

### AI Engine & Cognition

- vLLM Gateway: public inference gateway surface.
- LiteLLM Gateway: installed model routing and OpenAI-compatible proxy layer.
- Dify: AI workflow and application builder.
- MCP Endpoint: portal-backed Model Context Protocol endpoint.
- Qdrant: installed vector database for RAG, retrieval, and AI memory.

### Automation & Data Flow

- n8n Workflows: workflow automation runtime.
- Webhooks: portal-managed webhook and delivery surface.
- Airbyte: still blocked because the official single-host abctl install cannot boot kind on this VPS until the root inotify limit is raised.

### Communication Hubs

- Evolution Gateway: WhatsApp Business API runtime.
- Baileys Gateway: Baileys multi-device gateway runtime.
- Open WebUI: operator and user AI workspace.
- Chatwoot: customer communication workspace.
- FusionPBX / Voice: voice routing and PBX runtime.

### Observability & Tracing

- Grafana: direct external infrastructure and GPU monitoring UI on `grafana.getouch.co`.
- Langfuse: installed AI observability and tracing runtime.

### Access & Security

- Authentik: direct external SSO and identity provider UI on `sso.getouch.co`.
- API Keys: tenant/app/client key issuance and management.
- Infisical: direct external secret-vault UI on `infisical.getouch.co`.
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
| Authentik | Access & Security | Installed | https://sso.getouch.co | Coolify-managed runtime is healthy and the public route returns the expected login redirect. | PostgreSQL `authentik`, Redis / Valkey |
| Qdrant | AI Engine & Cognition | Installed | https://qdrant.getouch.co | Coolify-managed runtime is healthy. `GET /healthz` returns `200` and protected collection access returns `401` without credentials. | Persistent storage, API auth |
| Airbyte | Automation & Data Flow | Blocked | https://airbyte.getouch.co | No live runtime detected. The official `abctl` install path was attempted, but kind failed to boot its control-plane container on this VPS with `Failed to create control group inotify object: Too many open files` while `fs.inotify.max_user_instances` remained at `128`. | PostgreSQL `airbyte` |
| Infisical | Access & Security | Installed | https://infisical.getouch.co | Coolify-managed runtime is healthy, `/api/status` returns `200`, and the portal now links directly to the external vault UI instead of an intermediate status page. Initial admin onboarding is still pending. | PostgreSQL `infisical`, secure bootstrap |
| LiteLLM | AI Engine & Cognition | Installed | https://litellm.getouch.co | Coolify-managed runtime is healthy and the public gateway responds on `/health/liveliness`. Anonymous `GET /v1/models` requests are correctly rejected with `401` until provider credentials and client auth are configured. | PostgreSQL `litellm`, auth/master key |
| Grafana | Observability & Tracing | Installed | https://grafana.getouch.co | Grafana remains the external source of truth for infrastructure and GPU monitoring. The portal sidebar now links directly to the real Grafana UI instead of an intermediate status page. | Prometheus, Grafana auth |
| Langfuse | Observability & Tracing | Installed | https://langfuse.getouch.co | Coolify-managed runtime and dependencies are healthy. `/api/public/health` returns `200`. Operator login is working and the initial shared project is `getouch-production`. | PostgreSQL `langfuse`, ClickHouse, Redis |
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

Airbyte remains blocked because the official `abctl` path cannot complete on this host until a root operator raises the inotify instance limit that kind depends on during control-plane boot.

## Airbyte Next Safe Action

- Status: Blocked by host prerequisites for the official `abctl` install path.
- Database: `airbyte` remains the prepared target database name.
- Domain: `airbyte.getouch.co` remains the prepared public hostname.
- Next safe action: raise `fs.inotify.max_user_instances` as root on the VPS, retry `abctl local install --host airbyte.getouch.co --port 18081 --low-resource-mode`, then add the missing `airbyte.getouch.co` Caddy vhost once the runtime is healthy.

## Security Guardrails Verified

- Redis is internal-only. No public Redis route was detected.
- ClickHouse should remain internal-only. No authenticated public exposure was intentionally enabled.
- Qdrant is live and requires API authentication for protected collection access.
- LiteLLM has a live public gateway. Provider credentials are still pending before it should carry production traffic.
- Infisical is live, opens directly from the portal sidebar, and still requires secure initial admin onboarding before operator use.
