# AI Runtime Control Panel (2026-04-27)

## Scope

- Portal foundation only for inference runtime visibility and guarded maintenance actions.
- Ollama remains the current primary inference backend.
- vLLM is not deployed publicly in this phase.
- No vLLM subdomain or public port is added in this phase.
- Open WebUI stays on the existing Ollama-first configuration.

## Current Inference Architecture

User browser
-> Open WebUI
-> Ollama
-> local NVIDIA GPU

Planned trial path for a future maintenance window:

User browser
-> Open WebUI
-> vLLM internal provider
-> Qwen/Qwen3-14B-FP8

## Roles

- Ollama: current primary and default runtime for Open WebUI.
- Open WebUI: operator and end-user chat interface.
- vLLM: controlled trial candidate only, intended for internal testing with `Qwen/Qwen3-14B-FP8`.

## Why Parallel Ollama + vLLM Is Blocked

- The current host has one 16 GB NVIDIA GPU.
- Ollama already uses about 11.3 GB VRAM when a resident model is loaded.
- Running a second 14B inference backend in parallel is not considered safe on this host.
- The portal therefore shows `Ollama primary / vLLM trial only` as the recommended mode.

## Portal AI Services Control Panel

Page: `/admin/ai-services`

The page now includes:

- Top summary cards for active runtime, GPU VRAM, Ollama state, and vLLM trial state.
- An `Inference Control` panel with live status for:
  - active runtime
  - recommended mode
  - GPU status
  - Ollama status
  - vLLM status
  - Open WebUI provider status
  - last check timestamp
- A warning banner when current GPU pressure makes a vLLM trial unsafe.
- An updated AI services list that keeps Dify, MCP, Open WebUI, Ollama, SearXNG, and Pipelines, and adds a vLLM row.

Additional page:

- `/admin/ai/vllm` → public portal path `/ai/vllm`

This dedicated page focuses on the protected gateway surface rather than runtime maintenance. It shows:

- public endpoint `https://vllm.getouch.co/v1`
- internal backend `http://vllm-qwen3-14b-fp8:8000/v1`
- Open WebUI provider status for the External tab
- gateway/API key status, quick tests, usage, and sanitized logs

## Status Meanings

- `Ollama`: Ollama is the active runtime and vLLM is not running.
- `vLLM`: vLLM is running and Ollama has no resident model loaded.
- `Maintenance`: the stack is in a transitional state, such as vLLM running while Ollama still has a resident model, or Ollama running without a resident model.
- `Unknown`: status could not be determined safely.

vLLM service state values:

- `Not installed`
- `Installed but stopped`
- `Starting`
- `Running`
- `Failed`
- `Blocked`
- `Unknown`

## Available Portal Actions

All maintenance actions require a confirmation modal before execution.

- `Refresh Status`: safe read-only status refresh.
- `Open Open WebUI`: opens `https://ai.getouch.co`.
- `Open Grafana GPU Dashboard`: opens the configured Grafana URL.
- `Unload Ollama Resident Model`: unloads only the current resident model from GPU memory. It does not delete Ollama models or volumes.
- `Start vLLM Trial`: reserved for a maintenance window and blocked until GPU headroom and host configuration are safe.
- `Stop vLLM`: stops only the vLLM service if present.
- `Restore Ollama Mode`: stops vLLM if needed and confirms the stack returns to Ollama-first mode.
- `Configure Open WebUI vLLM Provider`: intentionally blocked until an approved maintenance window and vLLM service configuration exist.

## Server-Side Control Design

This phase reuses the existing server-side SSH control pattern already used by infrastructure and restart tooling.

- No browser-side shell or SSH execution is allowed.
- Admin-only routes live under `/api/admin/ai-runtime/*`.
- The frontend calls only portal API routes.
- The backend uses fixed remote commands and does not accept arbitrary command input.

Implemented routes:

- `GET /api/admin/ai-runtime/status`
- `POST /api/admin/ai-runtime/ollama/unload`
- `POST /api/admin/ai-runtime/vllm/start`
- `POST /api/admin/ai-runtime/vllm/stop`
- `POST /api/admin/ai-runtime/restore-ollama`
- `POST /api/admin/ai-runtime/openwebui/configure-vllm`

## Host Control Notes

This phase does not install `/usr/local/sbin/getouch-ai-runtime-control.sh` on the host.

Instead, the portal uses a fixed-command SSH library with a narrow policy:

- `status`
- `ollama-unload-current`
- `vllm-start`
- `vllm-stop`
- `restore-ollama`
- `openwebui-configure-vllm`

This keeps the current change small and reversible while preserving the option to move the command policy into a dedicated host-side script later.

The runtime page and the service-endpoint page both reuse this fixed-command SSH approach. No arbitrary shell input is accepted from the browser.

## vLLM Trial Intent

Current operational notes for the dedicated gateway/runtime pair:

- No separate vLLM database is required at this stage.
- Portal metadata, key inventory, and usage continue to use the main `getouch.co` PostgreSQL database.
- The backend model cache is expected under `/srv/apps/ai/huggingface` on the host.
- LiteLLM, if introduced later on `litellm.getouch.co`, may have its own database and control surface.

If approved in a future maintenance window, the intended internal vLLM service is:

- service/container name: `vllm-qwen3-14b-fp8`
- image: `vllm/vllm-openai:latest`
- model: `Qwen/Qwen3-14B-FP8`
- network: `getouch-edge`
- endpoint: `http://vllm-qwen3-14b-fp8:8000/v1`
- Hugging Face cache: `/srv/apps/ai/huggingface`

No public DNS, public port, or unauthenticated model API is added in this phase.

## Safe Trial Workflow

1. Confirm a maintenance window.
2. Refresh portal AI runtime status.
3. Verify current free VRAM and current Ollama resident model.
4. Unload the resident Ollama model.
5. Start the internal-only vLLM trial.
6. Validate vLLM health and Open WebUI provider readiness.
7. Stop vLLM after the trial or restore Ollama mode immediately if the trial is unsuccessful.

## Open WebUI Provider Configuration

Current state:

- Existing Ollama provider remains intact.
- Existing OpenAI-compatible provider env wiring is preserved.
- Automatic provider mutation is intentionally blocked in this phase.

Future maintenance-window path:

- append the internal vLLM endpoint to `OPENAI_API_BASE_URLS`
- append the matching key entry to `OPENAI_API_KEYS`
- preserve the current provider ordering and existing keys
- restart Open WebUI only during an approved maintenance window
- verify both Ollama and vLLM provider paths afterward

## Rollback

Rollback for this phase is small:

1. Stop or disable the vLLM service if it was ever enabled.
2. Remove the vLLM provider from Open WebUI only if it was added later.
3. Restore Ollama as the active/default runtime.
4. Confirm Open WebUI can still reach Ollama.
5. Revert the portal UI and API changes if the control panel is no longer wanted.

What rollback does not do:

- It does not delete Ollama models.
- It does not delete Ollama or Open WebUI volumes.
- It does not add or remove any public subdomain in this phase.

## Validation Notes

- The portal build passed after the AI runtime control panel and routes were added.
- Destructive actions were not executed in this phase.
- vLLM was not started in this phase.
- No public exposure was added for vLLM in this phase.
---

## Changelog — 2026-04-28 Plan Update

This document was originally written before the LiteLLM hostname was standardized. That decision changed:

- **Public vLLM API domain is now `https://vllm.getouch.co/v1`.**
- **`https://litellm.getouch.co/v1` is the canonical future LiteLLM endpoint** (higher-level model routing) and is not used by the vLLM gateway today.
- The protected vLLM API foundation is implemented in the portal app at `/v1/models`, `/v1/chat/completions`, `/v1/embeddings`, `/health`, `/ready` (see `docs/ai-api-gateway-2026-04-27.md`).
- Raw vLLM is never exposed publicly without API key protection.

### Additional model targets (planned, not deployed)

The runtime plan now records two future model aliases in addition to the original Qwen 14B target:

1. `getouch-qwen3-14b` → `Qwen/Qwen3-14B-FP8` — primary planned vLLM chat model.
2. `getouch-qwen3-30b` — Qwen3 30B chat/reasoning. **Blocked** on the current 16GB GPU unless a compatible quantized/MoE/FP8 variant is verified by an actual run. Exact Hugging Face model id is pending verification — recorded as `pending-verified-hf-id` rather than guessed.
3. `getouch-embed` — Nomic embedding family. Embedding-only; routed through `/v1/embeddings`, never through `/v1/chat/completions`. Exact HF model id pending verification.

### Operational guardrails

- Do not start Qwen 30B automatically on the current 16GB GPU.
- Do not run Qwen 14B, Qwen 30B, and embeddings concurrently on the same GPU.
- Do not delete Ollama models.
- Do not break Open WebUI. vLLM provider must be added manually in Open WebUI settings; it is not auto-configured.

### Why vLLM still does not appear in Open WebUI

Open WebUI currently shows only local Ollama models because no OpenAI-compatible provider has been added yet. After the operator adds either:

- internal: `http://vllm-qwen3-14b-fp8:8000/v1` (with backend or gateway key), or
- public protected: `https://vllm.getouch.co/v1` (with `GETOUCH_VLLM_API_KEY`),

…the chat aliases (e.g. `getouch-qwen3-14b`) will appear under the External / OpenAI-compatible tab. The embedding alias `getouch-embed` will not appear as a chat model.

## Changelog 2026-04-27/28

- Confirmed `https://vllm.getouch.co/v1` is the only public vLLM API surface; `https://litellm.getouch.co` is the canonical future LiteLLM hostname and intentionally has no Caddy vhost in this milestone.
- Added Caddy vhost for `vllm.getouch.co` routing only `/v1/*`, `/health`, `/ready` to the portal app; everything else returns 404 at the edge.
- Reaffirmed: vLLM container is **not** deployed in this milestone (the prior `vllm-qwen3-14b-fp8-probe` exited on engine init — separate 16GB-GPU validation task).
- Reaffirmed: vLLM is **not** added to Open WebUI's External provider list automatically; operator must add it manually after the backend is validated.
- `CENTRAL_API_KEY_PEPPER` is unrelated to the gateway key path today (gateway uses `GETOUCH_VLLM_GATEWAY_KEYS`); central-key→gateway wiring is documented as a deferred follow-up in `docs/ai-api-gateway-2026-04-27.md`.
