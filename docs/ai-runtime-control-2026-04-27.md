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

## vLLM Trial Intent

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