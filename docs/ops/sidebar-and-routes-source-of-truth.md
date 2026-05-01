# Sidebar and Routes Source of Truth

Updated: 2026-05-01

## Rule Set

- The sidebar IA below is the canonical source of truth.
- Dashboard sections must match the same category logic exactly.
- Runtime installation status does not change the canonical IA or route table below.
- Old `/service-endpoints/*` routes are legacy aliases only and are not canonical.
- Old `/developer/*`, `/access/*`, `/operations/*`, and `/infrastructure/*` public routes are legacy aliases only where redirects still exist.
- Root `https://portal.getouch.co/` remains usable and resolves to the dashboard experience.

## Sidebar IA

### System Orchestration

- Dashboard
- Servers & Nodes
- Authentik

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

### Infra & Persistence

- Coolify
- Databases
- Object Storage
- Backups

### Observability & Tracing

- Grafana
- Langfuse

### Access & Security

- API Keys
- Infisical
- SDK & Docs
- Quick Links

## Canonical Route Table

| Category | Item | Canonical Public Route | Internal Admin Route |
| --- | --- | --- | --- |
| System Orchestration | Dashboard | `/system/dashboard` | `/admin/system/dashboard` |
| System Orchestration | Servers & Nodes | `/system/servers` | `/admin/system/servers` |
| System Orchestration | Authentik | `/system/authentik` | `/admin/system/authentik` |
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
| Infra & Persistence | Coolify | `/infra/coolify` | `/admin/infra/coolify` |
| Infra & Persistence | Databases | `/infra/databases` | `/admin/infra/databases` |
| Infra & Persistence | Object Storage | `/infra/object-storage` | `/admin/infra/object-storage` |
| Infra & Persistence | Backups | `/infra/backups` | `/admin/infra/backups` |
| Observability & Tracing | Grafana | `/observability/grafana` | `/admin/observability/grafana` |
| Observability & Tracing | Langfuse | `/observability/langfuse` | `/admin/observability/langfuse` |
| Access & Security | API Keys | `/security/api-keys` | `/admin/security/api-keys` |
| Access & Security | Infisical | `/security/infisical` | `/admin/security/infisical` |
| Access & Security | SDK & Docs | `/security/docs` | `/admin/security/docs` |
| Access & Security | Quick Links | `/security/quick-links` | `/admin/security/quick-links` |

## Source Files

- Sidebar and route rows: `app/admin/data.ts`
- Portal canonical redirects: `proxy.ts`
- Canonical admin route tree: `app/admin/system`, `app/admin/ai`, `app/admin/automation`, `app/admin/communications`, `app/admin/infra`, `app/admin/observability`, `app/admin/security`
- Live diagnostic verification: `app/api/build-info/route.ts`
