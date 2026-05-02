# Sidebar and Routes Source of Truth

Updated: 2026-05-02

## Rule Set

- The sidebar IA below is the canonical source of truth.
- Runtime installation status does not change the canonical IA or route table below.
- Old `/service-endpoints/*` routes are legacy aliases only and are not canonical.
- Old `/developer/*`, `/access/*`, `/operations/*`, and `/infrastructure/*` public routes are legacy aliases only where redirects still exist.
- Root `https://portal.getouch.co/` remains usable and resolves to `Servers & Nodes` at `/infra/servers`.
- Legacy `/system/dashboard` and `/admin/system/dashboard` paths redirect to `Servers & Nodes` and are not canonical.
- Grafana is a direct external link and no longer uses a portal status page as a canonical destination.
- Authentik is a direct external link and no longer uses a portal status page as a canonical destination.
- Infisical is a direct external link and no longer uses a portal status page as a canonical destination.
- Langfuse is a direct external link and no longer uses a portal status page as a canonical destination.

## Sidebar IA

### Infra & Persistence

- Servers & Nodes
- Coolify
- Databases
- Object Storage
- Backups

### AI Engine & Cognition

- vLLM Gateway
- LiteLLM Gateway
- Dify
- MCP Endpoint
- Qdrant

### Automation & Data Flow

- n8n Workflows
- Webhooks
- Airbyte

### Communication Hubs

- Evolution Gateway
- Baileys Gateway
- Open WebUI
- Chatwoot
- FusionPBX / Voice

### Observability & Tracing

- Grafana
- Langfuse

### Access & Security

- Authentik
- API Keys
- Infisical
- SDK & Docs
- Quick Links

## Canonical Route Table

| Category | Item | Canonical Public Route | Internal Admin Route |
| --- | --- | --- | --- |
| Infra & Persistence | Servers & Nodes | `/infra/servers` | `/admin/infra/servers` |
| Infra & Persistence | Coolify | `/infra/coolify` | `/admin/infra/coolify` |
| Infra & Persistence | Databases | `/infra/databases` | `/admin/infra/databases` |
| Infra & Persistence | Object Storage | `/infra/object-storage` | `/admin/infra/object-storage` |
| Infra & Persistence | Backups | `/infra/backups` | `/admin/infra/backups` |
| AI Engine & Cognition | vLLM Gateway | `/ai/vllm` | `/admin/ai/vllm` |
| AI Engine & Cognition | LiteLLM Gateway | `/ai/litellm` | `/admin/ai/litellm` |
| AI Engine & Cognition | Dify | `/ai/dify` | `/admin/ai/dify` |
| AI Engine & Cognition | MCP Endpoint | `/ai/mcp` | `/admin/ai/mcp` |
| AI Engine & Cognition | Qdrant | `/ai/qdrant` | `/admin/ai/qdrant` |
| Automation & Data Flow | n8n Workflows | `/automation/n8n` | `/admin/automation/n8n` |
| Automation & Data Flow | Webhooks | `/automation/webhooks` | `/admin/automation/webhooks` |
| Automation & Data Flow | Airbyte | `/automation/airbyte` | `/admin/automation/airbyte` |
| Communication Hubs | Evolution Gateway | `/communications/evolution` | `/admin/communications/evolution` |
| Communication Hubs | Baileys Gateway | `/communications/baileys` | `/admin/communications/baileys` |
| Communication Hubs | Open WebUI | `/communications/open-webui` | `/admin/communications/open-webui` |
| Communication Hubs | Chatwoot | `/communications/chatwoot` | `/admin/communications/chatwoot` |
| Communication Hubs | FusionPBX / Voice | `/communications/voice` | `/admin/communications/voice` |
| Observability & Tracing | Grafana | `https://grafana.getouch.co` | `https://grafana.getouch.co` |
| Observability & Tracing | Langfuse | `https://langfuse.getouch.co` | `https://langfuse.getouch.co` |
| Access & Security | Authentik | `https://sso.getouch.co` | `https://sso.getouch.co` |
| Access & Security | API Keys | `/security/api-keys` | `/admin/security/api-keys` |
| Access & Security | Infisical | `https://infisical.getouch.co` | `https://infisical.getouch.co` |
| Access & Security | SDK & Docs | `/security/docs` | `/admin/security/docs` |
| Access & Security | Quick Links | `/security/quick-links` | `/admin/security/quick-links` |

## Legacy Route Note

- `/admin/security/infisical` and `/security/infisical` are legacy aliases and now redirect directly to `https://infisical.getouch.co`.
- `/admin/observability/grafana` and `/observability/grafana` are legacy aliases and now redirect directly to `https://grafana.getouch.co`.
- `API Keys` remains the internal portal page for tenant and client key management.

## Source Files

- Sidebar and route rows: `app/admin/data.ts`
- Portal canonical redirects: `proxy.ts`
- Canonical admin route tree: `app/admin/infra`, `app/admin/ai`, `app/admin/automation`, `app/admin/communications`, `app/admin/observability`, `app/admin/security`
- Live diagnostic verification: `app/api/build-info/route.ts`
