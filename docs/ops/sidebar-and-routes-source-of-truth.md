# Sidebar and Routes Source of Truth

Updated: 2026-05-02

## Rule Set

- The sidebar IA below is the canonical source of truth.
- Runtime installation status does not change the canonical IA or route table below.
- Old `/service-endpoints/*` routes are legacy aliases only and are not canonical.
- Old `/developer/*`, `/access/*`, `/operations/*`, and `/infrastructure/*` public routes are legacy aliases only where redirects still exist.
- Root `https://portal.getouch.co/` remains usable and resolves to `Databases` at `/infra/databases`.
- Legacy `/system/dashboard`, `/admin/system/dashboard`, `/infra/servers`, and `/admin/infra/servers` redirect to `Databases` and are not canonical.
- Grafana is a direct external link and no longer uses a portal status page as a canonical destination.
- Coolify is a direct external link and no longer uses a portal status page as a canonical destination.
- Authentik is a direct external link and no longer uses a portal status page as a canonical destination.
- Infisical is a direct external link and no longer uses a portal status page as a canonical destination.
- Langfuse is a direct external link and no longer uses a portal status page as a canonical destination.

## Sidebar IA

### Infra & Persistence

- Grafana
- Langfuse
- Coolify
- Databases

### AI Engine & Data Flow

- LiteLLM Gateway
- n8n Workflows
- Airbyte
- vLLM Gateway
- MCP Endpoint
- Webhooks

### Communication Hubs

- Dify
- Chatwoot
- Open WebUI
- FusionPBX / Voice
- Evolution Gateway
- Baileys Gateway

### Access & Security

- Authentik
- Infisical
- API Keys
- SDK & Docs
- Quick Links

## Canonical Route Table

| Category | Item | Canonical Public Route | Internal Admin Route |
| --- | --- | --- | --- |
| Infra & Persistence | Grafana | `https://grafana.getouch.co` | `https://grafana.getouch.co` |
| Infra & Persistence | Langfuse | `https://langfuse.getouch.co` | `https://langfuse.getouch.co` |
| Infra & Persistence | Coolify | `https://coolify.getouch.co` | `https://coolify.getouch.co` |
| Infra & Persistence | Databases | `/infra/databases` | `/admin/infra/databases` |
| AI Engine & Data Flow | LiteLLM Gateway | `https://litellm.getouch.co` | `https://litellm.getouch.co` |
| AI Engine & Data Flow | n8n Workflows | `https://n8n.getouch.my` | `https://n8n.getouch.my` |
| AI Engine & Data Flow | Airbyte | `https://airbyte.getouch.co` | `https://airbyte.getouch.co` |
| AI Engine & Data Flow | vLLM Gateway | `/ai/vllm` | `/admin/ai/vllm` |
| AI Engine & Data Flow | MCP Endpoint | `/ai/mcp` | `/admin/ai/mcp` |
| AI Engine & Data Flow | Webhooks | `/automation/webhooks` | `/admin/automation/webhooks` |
| Communication Hubs | Dify | `https://dify.getouch.co/apps` | `https://dify.getouch.co/apps` |
| Communication Hubs | Chatwoot | `https://chatwoot.getouch.co` | `https://chatwoot.getouch.co` |
| Communication Hubs | Open WebUI | `https://ai.getouch.co` | `https://ai.getouch.co` |
| Communication Hubs | FusionPBX / Voice | `/communications/voice` | `/admin/communications/voice` |
| Communication Hubs | Evolution Gateway | `/communications/evolution` | `/admin/communications/evolution` |
| Communication Hubs | Baileys Gateway | `/communications/baileys` | `/admin/communications/baileys` |
| Access & Security | Authentik | `https://sso.getouch.co` | `https://sso.getouch.co` |
| Access & Security | Infisical | `https://infisical.getouch.co` | `https://infisical.getouch.co` |
| Access & Security | API Keys | `/security/api-keys` | `/admin/security/api-keys` |
| Access & Security | SDK & Docs | `/security/docs` | `/admin/security/docs` |
| Access & Security | Quick Links | `/security/quick-links` | `/admin/security/quick-links` |

## Legacy Route Note

- `/infra/servers`, `/system/servers`, `/admin/infra/servers`, and `/admin/system/servers` are compatibility redirects to `/infra/databases`.
- `/admin/security/infisical` and `/security/infisical` are legacy aliases and now redirect directly to `https://infisical.getouch.co`.
- `/admin/observability/grafana` and `/observability/grafana` are legacy aliases and now redirect directly to `https://grafana.getouch.co`.
- `/admin/observability/langfuse` and `/observability/langfuse` are legacy aliases and now redirect directly to `https://langfuse.getouch.co`.
- `/admin/infra/coolify`, `/infra/coolify`, `/admin/infrastructure/coolify`, and `/infrastructure/coolify` are legacy aliases and now redirect directly to `https://coolify.getouch.co`.
- `/ai/dify`, `/admin/ai/dify`, `/ai-services/dify`, and `/admin/ai-services/dify` now redirect directly to `https://dify.getouch.co/apps`; the internal monitoring page remains available at `/admin/service-endpoints/dify`.
- `API Keys` remains the internal portal page for tenant and client key management.

## Source Files

- Sidebar and route rows: `app/admin/data.ts`
- Portal canonical redirects: `proxy.ts`
- Canonical admin route tree: `app/admin/infra`, `app/admin/ai`, `app/admin/automation`, `app/admin/communications`, `app/admin/security`
- Redirect-only observability fallbacks: `app/admin/observability`
- Live diagnostic verification: `app/api/build-info/route.ts`
