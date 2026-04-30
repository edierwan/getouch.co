# AI Provider Post-Reboot Audit

Date: 2026-04-30
Scope: read-only audit of provider wiring after the 2026-04-29 VPS reboot, followed by safe portal-side clarity fixes.

## Reboot snapshot

Observed boot time:
- `2026-04-29 23:02`

Observed service recovery:
- `getouch-web`, `ollama`, `open-webui`, `open-webui-pipelines`, `baileys-gateway`, `caddy`, `getouch-postgres`, `getouch-pgadmin`, and `searxng` were all running after reboot.
- All of the above had `restart=unless-stopped`.
- All of the above exposed a Docker healthcheck.

Observed persistence mounts:
- `ollama`
  - `/srv/apps/ai/models:/models`
  - `/srv/apps/ai/ollama:/root/.ollama`
- `open-webui`
  - `/srv/apps/ai/open-webui:/app/backend/data`
- `open-webui-pipelines`
  - `/srv/apps/ai/pipelines:/app/pipelines`
- `baileys-gateway`
  - `/data/getouch/baileys-gateway:/app/data`
- `caddy`
  - `/data/getouch/caddy/config:/config`
  - `/data/getouch/caddy/data:/data`
- `getouch-postgres`
  - `/data/getouch/postgres:/var/lib/postgresql/data`
- `getouch-pgadmin`
  - `/data/getouch/pgadmin:/var/lib/pgadmin`

## Provider wiring observed after reboot

Open WebUI environment:
- `OLLAMA_BASE_URL=http://ollama:11434`
- `OPENAI_API_BASE_URLS=http://pipelines:9099;https://api.openai.com/v1`
- `OPENAI_API_KEYS=0p3n-w3bu!;sk-placeholder`
- `DEFAULT_MODELS=getouch-smart-assistant`

Interpretation:
- Open WebUI was primarily using Ollama plus the internal Pipelines service.
- vLLM was not configured into Open WebUI after reboot.
- The portal vLLM page was therefore required to show a planned/not-deployed state instead of a quasi-live backend state.

vLLM state:
- `vllm-qwen3-14b-fp8` container was missing.
- Portal/runtime state correctly reflected `configuredInCompose=false` and `containerStatus=missing`.
- This is a non-deployed state, not a failed boot recovery.

## Assistant naming root cause

Live pipelines API check returned:

```json
{
  "data": [
    {
      "id": "getouch_orchestrator_pipeline.assistant",
      "name": "Getouch OrchestratorGetouch Smart Assistant"
    }
  ]
}
```

Conclusion:
- The malformed assistant label was emitted directly by the Pipelines API.
- The root cause was the manifold pipeline name `Getouch Orchestrator` being concatenated with the child model name `Getouch Smart Assistant`.

## Fixes applied in source

Applied changes:
- `infra/pipelines/getouch_orchestrator_pipeline.py`
  - Changed the manifold prefix from `Getouch Orchestrator` to `assistant: ` so the live model name becomes provider-labeled instead of concatenated garbage.
- `lib/ai-runtime.ts`
  - Fixed Ollama reachability probing to use `curl` when present and fall back to `ollama list` instead of `wget`.
  - Added assistant/pipeline status collection from `open-webui-pipelines /v1/models`.
- `app/admin/ai-services/AiServicesConsole.tsx`
  - Added assistant pipeline visibility in the admin runtime view.
  - Added a Provider Inventory section that separates Ollama, assistant pipeline, and planned vLLM aliases.
- `app/admin/service-endpoints/vllm/VllmServiceEndpointConsole.tsx`
  - Changed the non-deployed state to `Planned` / `Not Deployed`.
  - Switched uptime, request, success-rate, and backend resource usage to `N/A` while no real vLLM backend exists.
  - Added an explicit note that Open WebUI models currently come from Ollama and assistant/pipeline providers, not vLLM.

## Recovery findings

What recovered cleanly after reboot:
- Portal app
- Ollama
- Open WebUI
- Open WebUI Pipelines
- Baileys Gateway
- Caddy
- Postgres
- pgAdmin
- SearXNG

What did not auto-appear because it is not deployed:
- vLLM backend container

## Risks and remaining recommendations

Remaining risks:
- `DEFAULT_MODELS=getouch-smart-assistant` is still a friendly alias, while the live pipelines model id is `getouch_orchestrator_pipeline.assistant`.
- If Open WebUI relies on the returned model id rather than its own alias mapping, the default-model setting may still deserve a follow-up alignment check.
- A future vLLM rollout should not reuse host-level GPU metrics as backend metrics until the service is actually deployed.

Recommended next safeguards:
- Use the read-only post-reboot verification script before and after any future maintenance window.
- Keep provider prefixes visible in admin UIs: `ollama:`, `assistant:`, `vllm:`.
- Align user-facing default model labels with the actual provider-returned model ids when the assistant path is finalized.