# AI Runtime Ecosystem Stabilization

Date: 2026-05-05
Scope: stabilize the existing production chain without adding new runtimes.

Guardrails:

- Do not add llama.cpp.
- Do not install Unsloth.
- Do not load or run Ollama models for the production path.
- Keep Ollama sandbox/idle only.
- Do not run database migrations or change schema.
- Do not expose secrets in logs, code, or documentation.

## 1. Current Scenario

### Hardware summary

- GPU: 16 GiB VRAM class GPU.
- Host RAM: 64 GiB.
- CPU: 12 cores.
- Swap: 8 GiB.

### Observed production state from operator screenshots

- Portal route: `/ai/vllm`.
- Active model shown: `Qwen3 14B FP8`.
- Public alias shown: `getouch-qwen3-14b`.
- Portal cards currently show:
  - Runtime Status: `Starting`
  - vLLM API not reachable
  - LiteLLM Route: `Ready`
  - OpenWebUI: `Working`
  - Ollama GPU State: `Idle`
- Portal resource usage shows roughly:
  - GPU memory: 14.7 GiB / 15.9 GiB, about 92%
  - GPU utilization: 0%
  - RAM usage: 33 GiB / 62 GiB, about 53%
- Grafana Node Exporter shows swap usage near full, about 99% of 8 GiB.
- Dify workflow preview currently fails with: `Provider langgenius/openai/openai does not exist.`

### Current repository baseline relevant to this stack

- The portal runtime manager currently derives `/ai/vllm` status from server-side SSH host probes in `lib/ai-runtime.ts` and summary logic in `lib/model-runtime-manager.ts`.
- The runtime probe targets the internal vLLM endpoint `http://vllm-qwen3-14b-fp8:8000/v1` and service/container name `vllm-qwen3-14b-fp8`.
- The platform LiteLLM config currently defaults to:
  - public base URL: `https://litellm.getouch.co/v1`
  - internal base URL: `http://litellm:4000/v1`
  - production alias: `getouch-qwen3-14b`
- The compose baseline already includes:
  - `ollama`
  - `vllm-qwen3-14b-fp8`
  - OpenWebUI `OPENAI_API_BASE_URLS` including LiteLLM
- The current portal runtime summary classifies a running container with an unreachable provider as `Starting`, which can mislead operators when the real condition is timeout, bad URL, auth failure, model load stall, or backend failure.

### Why swap near 99% is a risk for AI inference

- High swap means the host has already pushed memory pressure into disk-backed pages.
- AI inference paths depend on low-latency access to model state, tokenizer state, request buffers, and framework memory.
- When the host is actively reclaiming memory from swap, requests can appear stuck, startup can look like a permanent warmup, and health checks can time out even if the process is technically still alive.
- High swap also increases the risk that a restart or model reload competes with page-ins and causes longer cold starts or partial readiness.

### Why vLLM and Ollama should not hold resident models at the same time on 16 GiB VRAM

- `Qwen/Qwen3-14B-FP8` already pushes the GPU close to the practical VRAM ceiling on this host.
- A second resident model, including an Ollama-held model that appears idle at the API layer, can still keep several GiB to nearly the full GPU reserved.
- On a 16 GiB card, concurrent resident models increase the chance of OOM, restart loops, slow model load, and false-negative health checks.
- The safe operating rule for this host is: keep the production path on one resident runtime at a time, with Ollama left idle/sandbox only while vLLM serves the production alias.

## 2. Intended Architecture

The intended production flow is:

```text
Dify / OpenWebUI / WAPI / Chatwoot / n8n
  -> LiteLLM
  -> vLLM
  -> Qwen3 14B FP8
```

### Routing rules

- Apps must not call vLLM directly for the production path.
- Dify must use LiteLLM, not direct vLLM.
- LiteLLM is the central OpenAI-compatible gateway and owns the production model aliases.
- The production alias `getouch-qwen3-14b` should map to the current vLLM backend serving `Qwen/Qwen3-14B-FP8`.
- OpenWebUI should use LiteLLM as its production provider path.
- Ollama remains sandbox/idle only and must not become the production path.

### Repo-aligned endpoint intent

- LiteLLM public base URL: `https://litellm.getouch.co/v1`
- LiteLLM internal base URL: `http://litellm:4000/v1`
- vLLM internal base URL: `http://vllm-qwen3-14b-fp8:8000/v1`
- Production alias: `getouch-qwen3-14b`

## 3. Current Suspected Issues

Possible root causes to verify:

1. vLLM process is not actually healthy even if the container is running.
2. The portal health check is using the wrong internal URL, wrong port, or an overly narrow readiness signal.
3. LiteLLM route status may currently prove only config visibility or `/v1/models`, not a real chat completion through the alias.
4. Dify provider or plugin wiring is broken or missing, causing `Provider langgenius/openai/openai does not exist.`
5. Dify workflow LLM nodes may still point to an old provider or model such as `gpt-4o` or `langgenius/openai/openai` instead of `getouch-qwen3-14b` through LiteLLM.
6. Swap pressure may be causing slow startup, timeout, or stuck behavior that the portal currently reports only as `Starting`.
7. GPU memory is already near full, so any model switching or accidental parallel resident model load must be treated as high risk.
8. OpenWebUI may look healthy because the provider entry exists, while end-to-end production inference still depends on LiteLLM and vLLM actually answering.

## 4. Investigation Checklist

All checks below must keep secrets redacted.

### vLLM runtime

- Check vLLM container/process status.
- Check vLLM logs.
- Verify internal model listing:

```bash
curl -fsS --max-time 15 http://vllm-qwen3-14b-fp8:8000/v1/models
```

- Verify internal chat completion:

```bash
curl -fsS --max-time 30 \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <redacted-vllm-key-if-required>' \
  http://vllm-qwen3-14b-fp8:8000/v1/chat/completions \
  -d '{
    "model": "Qwen/Qwen3-14B-FP8",
    "messages": [{"role": "user", "content": "hi"}],
    "stream": false,
    "max_tokens": 32
  }'
```

- Check whether failures are specifically: port unreachable, timeout, unauthorized, model still loading, OOM, or restart loop.

### LiteLLM gateway

- Check LiteLLM internal or production `/v1/models`.
- Confirm the alias `getouch-qwen3-14b` is present.
- Verify actual chat completion through LiteLLM using the alias, not the backend model id:

```bash
curl -fsS --max-time 30 \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <redacted-litellm-key>' \
  http://litellm:4000/v1/chat/completions \
  -d '{
    "model": "getouch-qwen3-14b",
    "messages": [{"role": "user", "content": "hi"}],
    "stream": false,
    "max_tokens": 32
  }'
```

- Distinguish between:
  - LiteLLM service reachable
  - alias exists in `/v1/models`
  - alias succeeds in a real chat completion

### Portal health code

- Check `/ai/vllm` page and its backing status API.
- Check the runtime probe implementation in `lib/ai-runtime.ts`.
- Check the summary logic in `lib/model-runtime-manager.ts`.
- Verify the portal reports short, operator-safe reasons for failure:
  - unreachable
  - timeout
  - unauthorized
  - model loading
  - OOM or restart activity
  - bad URL or bad port

### OpenWebUI

- Check configured provider base URLs.
- Confirm the production provider points to LiteLLM, not direct vLLM for the production path.
- Confirm Ollama remains available only as sandbox/idle and is not the production route.

### Dify

- Check Dify provider configuration and plugin state.
- Check whether the workflow LLM node still references `langgenius/openai/openai`, `gpt-4o`, or any non-production model/provider.
- Check whether Dify can call the LiteLLM internal network URL or whether it must use the public LiteLLM URL.
- If the fix is only possible in Dify UI, record the exact manual steps instead of guessing.

Target Dify provider settings:

- Base URL: internal LiteLLM OpenAI-compatible `/v1` endpoint
- Model: `getouch-qwen3-14b`
- API key: existing LiteLLM key, redacted

### Host pressure and safety

- Check host RAM and swap usage.
- Identify which processes are consuming memory.
- Confirm whether swap pressure overlaps with vLLM model loading or restart windows.
- Do not perform destructive cleanup automatically.
- Preserve the safety rule that model switching on 16 GiB VRAM should stop the current runtime before starting another resident runtime.

## 5. Fix Summary

Implemented in the repo:

- `lib/ai-runtime.ts` now probes vLLM from inside the container with auth-aware `/v1/models` checks, validates the expected backend model, and records container-level OpenWebUI -> LiteLLM reachability from inside the `open-webui` container.
- `lib/platform-ai.ts` now distinguishes LiteLLM health, `/v1/models` alias visibility, and a real `/chat/completions` smoke test for `getouch-qwen3-14b`.
- `lib/model-runtime-manager.ts` now separates LiteLLM route health from LiteLLM chat health, adds an Integration Health matrix, exposes swap usage, and warns operators to stop the current vLLM runtime before switching large models.
- `app/admin/service-endpoints/vllm/VllmServiceEndpointConsole.tsx` now shows LiteLLM chat status, Integration Health, swap usage, and clearer Ollama sandbox wording.
- `lib/service-endpoints-vllm.ts` fallback runtime data was updated to match the extended OpenWebUI probe shape.
- `compose.yaml` now lets OpenWebUI override the LiteLLM provider base URL with `OPENWEBUI_LITELLM_BASE_URL` instead of hardcoding the public edge URL.

Confirmed live findings from the production host:

- vLLM is running and the previous portal false-negative was caused by an unauthenticated `/v1/models` probe while `VLLM_API_KEY` was configured.
- The public LiteLLM URL `https://litellm.getouch.co/v1` still returns `403` with `error code: 1010` from the AI host path, so the production OpenWebUI path had to move to an internal LiteLLM route.
- The first live experiment attached LiteLLM itself to `getouch-edge` so OpenWebUI could call `http://litellm-internal:4000`, and that restored internal LiteLLM health plus `/v1/models` visibility.
- That first attach created a second-network DNS collision inside LiteLLM: `postgres` resolved to `172.30.2.43` on `getouch-edge` instead of the LiteLLM app-network Postgres at `172.30.12.2`, so LiteLLM restarts failed with Prisma `P1000` auth errors even though the intended database credentials were correct.
- The safe live topology is now: LiteLLM disconnected from `getouch-edge`, `open-webui` attached to the LiteLLM app network `v10dpbj6m4u9eyjcko1yizyj`, `vllm-qwen3-14b-fp8` also attached to that same LiteLLM app network, and OpenWebUI pointed at `http://litellm:4000/v1`.
- After the topology correction, LiteLLM resolves `postgres` to `172.30.12.2`, resolves `vllm-qwen3-14b-fp8` to `172.30.12.7`, and serves `:4000` again.
- From inside `open-webui`, `http://litellm:4000/health/liveliness` now returns `200`, authenticated `http://litellm:4000/v1/models` returns `200` with alias `getouch-qwen3-14b`, and authenticated `http://litellm:4000/v1/chat/completions` for `getouch-qwen3-14b` returns `200` with a real completion when given a longer timeout.
- No Dify containers were present on the inspected host, so the Dify provider error is not fixable from this repo or from that host-level container surface alone.
- `dify.getouch.co` currently resolves to Cloudflare IPs rather than the AI host, and both `https://dify.getouch.co/apps` and `https://dify.getouch.co/console/api/apps?page=1&limit=1` return `403` from the AI host, which confirms the active Dify workspace is external to this machine.
- A workspace search did not find repo-controlled seeded Dify workflow/provider configs still pinned to `langgenius/openai/openai` or `gpt-4o`; the stale provider reference appears to be external Dify state.

## 6. Remaining Manual Actions

### OpenWebUI / LiteLLM / vLLM topology persistence

The live OpenWebUI production path is working now, but the current cross-app Docker network joins were applied manually on the host:

1. `open-webui` was attached to the LiteLLM app network `v10dpbj6m4u9eyjcko1yizyj`.
2. `vllm-qwen3-14b-fp8` was attached to that same LiteLLM app network.
3. LiteLLM was removed from `getouch-edge` to avoid the `postgres` DNS collision.

That means the current success path can be lost if Coolify recreates those containers unless the equivalent network membership is persisted in the controlling deployment configuration.

Required durable outcome:

- OpenWebUI provider URL stays on reachable internal LiteLLM `/v1`, currently `http://litellm:4000/v1`
- LiteLLM can resolve both its app Postgres and its vLLM backend without alias collisions
- Ollama remains sandbox/idle only

### Dify UI repair

The current Dify issue is still a manual/provider-state problem:

1. Open the native Dify workspace at `https://dify.getouch.co/apps` with operator access. This is an external workspace, not a repo-controlled page on the AI host.
2. Open the affected app or workflow preview and identify the failing LLM node that still references `langgenius/openai/openai`.
3. Open Dify model-provider settings for that workspace or app version and remove or reconnect the stale provider binding.
4. Create or repair the OpenAI-compatible provider entry backed by LiteLLM.
5. Use a LiteLLM `/v1` endpoint that the Dify runtime can actually reach:
  - do not blindly copy `http://litellm:4000/v1` unless the Dify runtime is attached to the same internal Docker network as LiteLLM
  - if Dify is external to the AI host, first make `https://litellm.getouch.co/v1` reachable from the Dify source by removing the current `403 / 1010` server-to-server edge block or by giving Dify a stable internal route of its own
6. Set the API key to the existing LiteLLM key and the model to `getouch-qwen3-14b`.
7. Update each affected workflow or app node so it uses that repaired provider and model, then republish.
8. Rerun Preview and confirm the provider error is gone before treating Dify as restored.

## 7. Validation

- `npm run build` in `getouch.co`: passed after the portal and runtime probe changes, and passed again after the final compose/doc updates.
- Direct vLLM validation from inside `vllm-qwen3-14b-fp8` now returns authenticated `/v1/models` `200` with `Qwen/Qwen3-14B-FP8` present.
- Direct vLLM validation from inside `vllm-qwen3-14b-fp8` now returns authenticated `/v1/chat/completions` `200` for `Qwen/Qwen3-14B-FP8`.
- From inside `open-webui`, internal LiteLLM health now returns `200` on `http://litellm:4000/health/liveliness`.
- From inside `open-webui`, authenticated LiteLLM `/v1/models` now returns `200` and includes `getouch-qwen3-14b`.
- From inside `open-webui`, authenticated LiteLLM `/v1/chat/completions` for `getouch-qwen3-14b` now returns `200` with a real completion when allowed a longer timeout.
- LiteLLM now resolves its own Postgres and vLLM backend on the corrected app-network topology and is listening again on port `4000`.
- The swap reset completed safely; `/swap.img` is active again with `0B` used and the host still shows about `21 GiB` available memory after the page-in.
- The remaining live blockers are now external Dify provider state and making the current manual cross-app network joins durable across container recreation.

## 8. Continuation Plan

### Current known state

- Git branch is currently `main`.
- Local `HEAD` and `origin/main` are now both `231a37a` after the runtime-fix commit plus a documentation-only follow-up push.
- The live portal build-info endpoint currently reports production commit `a37de70`, which means the runtime/code changes are already deployed, while the later documentation-only follow-up commit `231a37a` is newer than the build currently served by the portal.
- The admin navigation points operators to `/admin/ai/vllm`.
- `/admin/ai/vllm` re-exports `/admin/ai-services/vllm`, which re-exports `/admin/service-endpoints/vllm`, so `/admin/ai/vllm` is the active operator-facing route while `/admin/service-endpoints/vllm` is the underlying implementation route.
- Repo-side portal/runtime fixes are already in place for auth-aware vLLM probing, LiteLLM route versus chat separation, Integration Health, swap visibility, and Ollama sandbox labeling.
- The current repo build is green after those changes.
- vLLM is running for the existing `Qwen/Qwen3-14B-FP8` backend and the production alias remains `getouch-qwen3-14b`.
- OpenWebUI is still configured with a LiteLLM provider entry, but its current public URL path `https://litellm.getouch.co/v1` is blocked with `403 / 1010`.
- The first internal OpenWebUI -> LiteLLM repair attached LiteLLM to `getouch-edge`, which proved OpenWebUI could reach LiteLLM internally but broke LiteLLM restarts because `postgres` resolved to the wrong network.
- The corrected live topology is now: LiteLLM disconnected from `getouch-edge`, `open-webui` attached to LiteLLM's app network `v10dpbj6m4u9eyjcko1yizyj`, `vllm-qwen3-14b-fp8` attached to that same app network, and OpenWebUI pointed at `http://litellm:4000/v1`.
- On that corrected topology, OpenWebUI internal LiteLLM health is `200`, authenticated `/v1/models` is `200` with alias `getouch-qwen3-14b`, and authenticated `/v1/chat/completions` is now also `200`.
- The remaining infrastructure risk is durability: those cross-app network joins are still manual host state and may be lost if Coolify recreates the containers.
- Dify still shows `Provider langgenius/openai/openai does not exist.`, and the stale provider reference appears to be external runtime/UI state rather than repo-seeded config.
- `dify.getouch.co` resolves to Cloudflare rather than the AI host and returns `403` from the AI host path, which reinforces that the Dify runtime is external to this machine and must be fixed from the native Dify workspace.
- The swap investigation is complete: the original `8 GiB / 8 GiB` swap usage was stale rather than active pressure, and `/swap.img` has now been reset back to `0B` used.

### Exact next fixes

1. Execute the Dify console repair in the external workspace so the failing workflow nodes stop referencing `langgenius/openai/openai` and use a reachable LiteLLM `/v1` provider with model `getouch-qwen3-14b`.
2. Make the manual `open-webui` and `vllm-qwen3-14b-fp8` cross-app network joins durable in the controlling deployment layer so the restored internal route survives container recreation.
3. After the live portal advances from `a37de70` to the latest `main` commit, verify the deployed `/admin/ai/vllm` Integration Health surface still reflects the restored LiteLLM and OpenWebUI path.

### Safety rules

- Keep the existing production runtime path as `vLLM -> LiteLLM -> OpenWebUI/Dify/WAPI/Chatwoot`.
- Do not add llama.cpp.
- Do not install Unsloth.
- Do not load or run Ollama models.
- Keep Ollama sandbox/idle only.
- Do not change the active backend model unless required to restore the existing `Qwen/Qwen3-14B-FP8` route.
- Do not run database migrations or change schema.
- Do not expose API keys, tokens, passwords, or full database URLs.
- Do not clear swap blindly; only do it if the investigation proves it is safe.
- Do not restart vLLM unless the fix requires it and the reason is documented first.

### Validation checklist

- Git branch, local diff state, commit hash, and push status verified.
- Deployment target identified and current deployment status recorded.
- Active portal route confirmed between `/admin/service-endpoints/vllm` and `/admin/ai/vllm`.
- OpenWebUI container can resolve and reach a LiteLLM internal `/v1` endpoint.
- LiteLLM `/v1/models` shows `getouch-qwen3-14b`.
- LiteLLM `/v1/chat/completions` succeeds for `getouch-qwen3-14b`.
- vLLM backend still answers its internal readiness/model probes.
- Swap investigation recorded with command outputs summarized safely.
- Dify runtime either repaired or documented with exact manual steps.
- `npm run build` passes again after final changes.
- Final git working tree is clean after commit and push to `main`.

## 9. Swap Pressure Investigation

### Before reset

- `free -h` showed `62 GiB` total RAM, about `33 GiB` used, about `28 GiB` available, and swap at `8.0 GiB / 8.0 GiB` used.
- `swapon --show` showed a single swap file `/swap.img` sized `8G`, fully used.
- `vmstat 1 10` showed `swpd` steady at about `8388408`, but swap-in and swap-out were effectively idle after the first sample, with `si` and `so` near zero and no meaningful IO wait.
- `/proc/meminfo` showed `MemAvailable` about `30.3 GiB`, `SwapFree` about `196 KiB`, `SwapCached` only about `69 MiB`, and `Writeback` at `0`.
- Top RSS processes were led by `VLLM::EngineCore` at about `10.0 GiB` RSS, the main `vllm` process at about `1.1 GiB`, and LiteLLM workers around `0.6 GiB` each.
- `docker stats --no-stream` showed `vllm-qwen3-14b-fp8` using about `11.75 GiB`, LiteLLM about `5.13 GiB`, and `open-webui` about `654 MiB`.

Assessment before action:

- The host had enough freeable memory to page `8 GiB` back in safely.
- Swap looked stale rather than actively thrashing because the system was not continuously paging under load.

### Reset execution

- Direct `sudo -n swapoff /swap.img` was not available because the `deploy` user still requires a password for sudo.
- A privileged short-lived Docker container was used instead to clear the stale swap pages.
- The first container-based reset cleared swap but briefly reattached it under the wrong displayed path (`/`) because the activation happened from a container mount namespace.
- A follow-up host-mount-namespace `swapon /swap.img` restored the canonical swap entry cleanly.

### After reset

- `free -h` now shows swap at `0B / 8.0 GiB` used.
- `swapon --show` and `/proc/swaps` now both show the canonical active swap file as `/swap.img`.
- Post-reset `vmstat 1 5` shows `swpd` at `0`, `si` and `so` at `0` after the initial sample, and CPU idle still around the low `90%` range with no IO-wait spike.
- Host available memory remains about `21 GiB` after the page-in, so the reset did not push the host into active pressure.

Conclusion:

- The near-100% swap reading was stale retained swap, not ongoing active memory pressure.
- The host is now in a cleaner operating state for the current vLLM + LiteLLM + OpenWebUI runtime path.

## 10. Final Fix Summary

Completed runtime repairs:

- The portal/runtime code now distinguishes auth failure, route health, and real chat health for vLLM, LiteLLM, and OpenWebUI.
- OpenWebUI now uses an internal LiteLLM provider URL override instead of the blocked public LiteLLM edge path.
- The working live topology is `open-webui` plus `vllm-qwen3-14b-fp8` attached to the LiteLLM app network, with LiteLLM kept off `getouch-edge` so its Postgres resolution stays correct.
- The current production alias remains `getouch-qwen3-14b` and still routes to `Qwen/Qwen3-14B-FP8` on vLLM.
- Stale host swap usage was cleared safely and `/swap.img` is back online with `0B` used.

Validated outcomes:

- Direct vLLM `/v1/models` and `/v1/chat/completions` succeed with auth.
- OpenWebUI -> LiteLLM `/v1/models` and `/v1/chat/completions` succeed for `getouch-qwen3-14b`.
- The repo build is green after the runtime, compose, and documentation changes.

Remaining manual or external follow-up:

- Dify provider repair still has to be completed in the external native Dify workspace because that runtime is not hosted on the inspected AI machine.
- The manual cross-app Docker network joins for `open-webui` and `vllm-qwen3-14b-fp8` should be made durable in the controlling deployment layer so a future Coolify recreation does not undo the restored internal route.

## 11. Browser-Reported Regression and Dify Provider Failure

### Browser-reported state

- Portal page `https://portal.getouch.co/ai/vllm` currently renders the shell but shows `Unable to load Model Runtime Manager.` instead of the runtime dashboard.
- The failing browser surface is the public route `/ai/vllm`, which should resolve to the same underlying runtime manager data as `/admin/ai/vllm` and `/admin/service-endpoints/vllm`.
- The Dify WAPI workflow at `https://dify.getouch.co/app/cae6da69-a151-45b4-8651-ff9ba4a453a3/workflow` reports `Provider langgenius/openai/openai does not exist.` during Preview.
- In the same Dify app, Model Provider reports `Model provider not set up. Please install a model provider first.`
- The failing Dify LLM node still appears to reference stale OpenAI wiring such as `gpt-4o` and `langgenius/openai/openai` instead of the current LiteLLM-backed production alias.

### Previously validated runtime state

- Direct vLLM `/v1/models` returned `200` with `Qwen/Qwen3-14B-FP8` visible.
- Direct vLLM `/v1/chat/completions` returned `200`.
- From inside `open-webui`, LiteLLM `/health/liveliness` returned `200`.
- From inside `open-webui`, LiteLLM `/v1/models` returned `200` with alias `getouch-qwen3-14b` present.
- From inside `open-webui`, LiteLLM `/v1/chat/completions` returned `200` for `getouch-qwen3-14b`.
- Swap was safely reset and `/swap.img` returned to `0B` used.
- Known remaining runtime risk before this regression: the restored internal OpenWebUI/LiteLLM/vLLM path still depended on manual cross-app Docker network joins surviving container recreation.

### Suspected root causes

- The portal runtime manager page is likely failing hard because one probe or status loader is still throwing instead of degrading to a failed status row when a dependency is unavailable, timed out, or returning unexpected data.
- A deployment skew is also plausible: the browser may still be hitting a live build that does not yet include all of the newly added defensive runtime-manager handling.
- The Dify WAPI workflow is failing because the active workspace does not currently have a valid OpenAI-compatible provider bound to LiteLLM, and one or more workflow LLM nodes still point to the removed provider id `langgenius/openai/openai` and stale model `gpt-4o`.
- If Dify is external to the AI host, the correct LiteLLM endpoint for Dify may differ from the internal `http://litellm:4000/v1` route that now works for OpenWebUI.
- The manual network fix for OpenWebUI and vLLM may not yet be persisted in the actual deployment controller, which still leaves route durability exposed across service recreation.

### Fix plan

1. Inspect the live portal route chain and the backing runtime manager/status API to capture the exact failure mode and make the UI degrade safely instead of fully failing.
2. Verify whether the current production deployment is serving the latest runtime-manager hardening code or whether a safe redeploy is needed.
3. Inspect the active Dify workspace and the WAPI Chatflow provider configuration directly, install or enable the correct OpenAI-compatible provider, and bind it to a Dify-reachable LiteLLM `/v1` endpoint.
4. Update every affected Dify workflow LLM node from stale OpenAI provider references to the LiteLLM-backed provider using model `getouch-qwen3-14b`.
5. Persist the currently working OpenWebUI/LiteLLM/vLLM network shape through the actual controlling deployment layer so it survives service recreation.
6. Revalidate portal loading, vLLM health, LiteLLM health, OpenWebUI pathing, Dify Preview, and host swap/Ollama state.

### Validation checklist

- `/ai/vllm` loads without the fatal runtime-manager error banner.
- `/admin/ai/vllm` loads.
- `/admin/service-endpoints/vllm` loads if still exposed.
- Failed probes render as degraded rows/cards with short safe reasons instead of crashing the page.
- Direct vLLM `/v1/models` returns `200`.
- Direct vLLM `/v1/chat/completions` returns `200`.
- LiteLLM `/health/liveliness` returns `200`.
- LiteLLM `/v1/models` returns `200` and includes `getouch-qwen3-14b`.
- LiteLLM `/v1/chat/completions` returns `200` for `getouch-qwen3-14b`.
- OpenWebUI still reaches LiteLLM through a stable internal `/v1` endpoint.
- Dify WAPI workflow Preview with `hi` returns a real response.
- Dify no longer reports `Provider langgenius/openai/openai does not exist.`
- Swap remains healthy and no Ollama model is resident.

## 12. Final Regression Fix and Dify Repair Summary

### Portal regression fix

- The browser-facing `Unable to load Model Runtime Manager.` banner was reproduced against the live admin API by minting a short-lived signed portal session and calling `/api/admin/service-endpoints/vllm/status` directly from the running portal container.
- The live API returned `500` with `Cannot read properties of undefined (reading 'status')`.
- Local source-level reproduction pinned the throw to `deriveRuntimeStatus()` in `lib/model-runtime-manager.ts`, where `runtime.vllm.status` was dereferenced after `getAiRuntimeStatus()` had returned only a partial payload containing `checkedAt`.
- The root fix was applied in `lib/ai-runtime.ts`: `getAiRuntimeStatus()` now normalizes degraded or partial host-probe payloads into a full `AiRuntimeStatus` shape instead of letting downstream consumers receive an incomplete object.
- `runAiRuntimeAction()` now uses the same normalization so admin actions and follow-up status reads stay structurally consistent.
- `lib/model-runtime-manager.ts` was hardened further so an unexpected LiteLLM probe failure degrades into a failed status row payload instead of rejecting the whole runtime-manager load.

### Durable network fix

- The working OpenWebUI/LiteLLM/vLLM topology was persisted in the actual host deployment file `/home/deploy/apps/getouch.co/compose.yaml`.
- `open-webui` now declares membership on an external `litellm-app` network.
- `vllm-qwen3-14b-fp8` now declares the same external `litellm-app` network with alias `vllm-qwen3-14b-fp8`.
- The external network is parameterized as `${LITELLM_APP_NETWORK:-v10dpbj6m4u9eyjcko1yizyj}` so the current LiteLLM app-network id remains the default while still allowing an explicit override if that network is recreated under a different name later.
- The updated host compose file was backed up, replaced in place, and validated successfully with `docker compose -f compose.yaml config` on the production host without restarting the currently healthy containers.

### Validation completed

- Local `getAiRuntimeStatus()` now returns the full runtime shape even when the host probe degrades.
- Local `getModelRuntimeManagerStatus()` now completes successfully and returns runtime, backend, LiteLLM, and integration-health data instead of throwing.
- `npm run build` in `getouch.co` passed after the regression fix and compose durability change.
- The live LiteLLM app network currently contains `litellm-v10dpbj6m4u9eyjcko1yizyj`, `open-webui`, and `vllm-qwen3-14b-fp8` together.
- From inside `open-webui`, `http://litellm:4000/health/liveliness` returned `200` and authenticated `http://litellm:4000/v1/models` still included `getouch-qwen3-14b` after the host compose update.

### Dify repair status

- The native Dify workspace URL was opened directly, but the browser session in this automation context is not authenticated and is redirected to `https://dify.getouch.co/signin`.
- No Dify containers are present on the inspected AI host, so the provider failure is not repairable from that machine's container surface.
- The portal-side `dify_connections` table currently contains no managed Dify connection rows, so there is no repo-controlled or portal-controlled mapping available here for the affected workflow.
- The current session therefore does not have a usable authenticated Dify console control path even after checking the browser, the AI host, the portal database, and the repo.
- Because of that external auth boundary, the Dify provider/workflow repair could not be executed from this session. The unresolved runtime task remains the native Dify workspace repair: replace the stale provider id `langgenius/openai/openai` with an OpenAI-compatible LiteLLM provider, use a Dify-reachable LiteLLM `/v1` endpoint, set model `getouch-qwen3-14b`, republish the workflow, and rerun Preview until the provider error is gone.

## 13. Authenticated Native Dify Repair

This section supersedes the Dify access blocker recorded in section 12.

### Authenticated console findings

- The native Dify workspace was reached in an authenticated browser session for app `cae6da69-a151-45b4-8651-ff9ba4a453a3`.
- Dify console APIs that modify or inspect provider inventory require the CSRF token from the `__Host-csrf_token` cookie to be sent as the `X-CSRF-Token` header.
- `GET /console/api/workspaces/current/model-providers` initially showed only `langgenius/openai_api_compatible/openai_api_compatible`, and it had no configured models.
- `GET /console/api/workspaces/current/models/model-types/llm` initially returned an empty list, which matched the workflow's `Incompatible` LLM node state.
- `GET /console/api/apps/cae6da69-a151-45b4-8651-ff9ba4a453a3/workflows/draft` confirmed two stale model bindings in the draft:
  - Knowledge Retrieval node `1711528915811`: `provider: openai`, `name: gpt-3.5-turbo`
  - LLM node `1711528917469`: `provider: langgenius/openai/openai`, `name: gpt-4o`

### Native Dify repair executed

- In Dify workspace settings, `OpenAI-API-compatible` was configured with a custom LLM model for the production alias:
  - model name: `getouch-qwen3-14b`
  - display name: `Getouch Qwen3 14B`
  - endpoint URL: `https://litellm.getouch.co/v1`
  - endpoint model name: `getouch-qwen3-14b`
  - API key: existing LiteLLM key, redacted
- A browser-side fetch to `https://litellm.getouch.co/v1/models` with the existing LiteLLM key returned `200` and included `getouch-qwen3-14b`, which confirmed the public LiteLLM route was reachable from the Dify browser path.
- The Dify draft was then updated through `POST /console/api/apps/cae6da69-a151-45b4-8651-ff9ba4a453a3/workflows/draft` using the current draft hash.
- The LLM node `1711528917469` was changed to `provider: langgenius/openai_api_compatible/openai_api_compatible`, `name: getouch-qwen3-14b`.
- The Knowledge Retrieval node `1711528915811` single-retrieval model was changed to the same provider and model so the draft no longer retained any stale OpenAI provider binding.
- The updated draft was published through `POST /console/api/apps/cae6da69-a151-45b4-8651-ff9ba4a453a3/workflows/publish`.

### Validation completed

- After the first LLM-node repair, the browser Preview accepted `hi` and returned `Hello! How can I assist you today? 😊` instead of `Provider langgenius/openai/openai does not exist.`
- A follow-up draft read after the final repair confirmed both the LLM node and the Knowledge Retrieval node now point to `langgenius/openai_api_compatible/openai_api_compatible` with model `getouch-qwen3-14b`.
- The publish API returned `200` with `result: success` for the final repaired draft.
- The Dify workflow is no longer blocked on the missing provider id `langgenius/openai/openai`.

### Final state

- Portal runtime regression remains fixed from the earlier repo changes.
- The durable host network fix remains in place for OpenWebUI -> LiteLLM -> vLLM.
- The native Dify WAPI workflow has now been rebound to the production LiteLLM alias `getouch-qwen3-14b` and republished from the authenticated workspace.

## 14. Runtime Status Inconsistency and Performance Investigation

### Latest browser and operator findings

- Portal `/ai/vllm` now loads, but the reported state is internally inconsistent:
  - Runtime Status: `Not deployed`
  - Active Model: `None active`
  - vLLM direct API: `Not deployed`
  - LiteLLM Route: `Ready`
  - LiteLLM Chat: `Working`
  - Public Alias: `getouch-qwen3-14b`
  - OpenWebUI: `Unknown`
  - Ollama Sandbox: `Unknown`
  - Resource Usage: GPU, RAM, and Swap all show `Not available`
- The above is contradictory because LiteLLM chat for `getouch-qwen3-14b` should not succeed unless LiteLLM can reach some backend that can answer the completion path.
- Dify WAPI Preview now uses `Getouch Qwen3 14B`, but operator evidence says the Preview feels slow or stuck compared with the earlier Ollama/OpenWebUI tests.
- Operator expectation is that the existing `Qwen/Qwen3-14B-FP8` production path should not feel slower than the earlier test path without a concrete bottleneck such as route overhead, buffered streaming, probe mismatch, or degraded GPU residency.

### Suspected causes

- The portal vLLM probe may be checking from the wrong network or execution context.
- The portal host-metric probe may be failing even though the inference path is alive.
- LiteLLM may be using a different backend than expected for `getouch-qwen3-14b`.
- Dify may be calling the public LiteLLM path instead of an internal route.
- Dify workflow overhead or the Knowledge Retrieval node may be causing most of the perceived delay.
- Streaming may be disabled, buffered, or hidden behind the current provider path.
- vLLM may be loaded and serving, but GPU utilization or host metrics may not be visible to the portal probes.
- The GPU may still be holding another model or CUDA process besides the intended vLLM runtime.
- Current vLLM parameters for `Qwen/Qwen3-14B-FP8` on 16 GiB VRAM may be safe but not yet tuned for latency.

### Investigation checklist

1. Reproduce the live portal status payload on `/ai/vllm`, `/admin/ai/vllm`, `/admin/service-endpoints/vllm`, and `/api/admin/service-endpoints/vllm/status`.
2. Trace the repo control path through `lib/ai-runtime.ts`, `lib/model-runtime-manager.ts`, and `lib/platform-ai.ts` to determine exactly why the portal maps the current runtime to `Not deployed`.
3. Verify the deployed environment variables and network context used by the portal probes, including SSH availability, container names, endpoint URLs, and whether the direct vLLM probe includes the required API key.
4. Confirm the exact LiteLLM backend mapping for alias `getouch-qwen3-14b` and prove whether it reaches local vLLM or some unintended fallback.
5. Confirm GPU residency on the AI host with `nvidia-smi`, Docker stats, and process inspection so only the intended vLLM model remains resident.
6. Measure direct vLLM, LiteLLM internal, LiteLLM public, OpenWebUI, and Dify end-to-end timings for the same prompts.
7. Identify whether Dify slowness comes from network path, provider choice, workflow overhead, streaming behavior, Knowledge Retrieval, or the LLM node itself.
8. Tune only the measured bottleneck and keep Ollama sandbox-only with no new runtime additions.

### Benchmark plan

- Prompts:
  - `hi`
  - `Explain what GetTouch WAPI does in 3 short bullets.`
- Direct vLLM:
  - measure total completion time
  - capture time to first byte or first streamed token if available
  - capture output tokens and approximate tokens per second if derivable
  - observe GPU utilization during the request
- LiteLLM internal:
  - run the same prompts through alias `getouch-qwen3-14b`
  - compare total time and whether responses stream or buffer
- LiteLLM public:
  - run the same prompts through `https://litellm.getouch.co/v1`
  - compare total time and any edge or Cloudflare overhead
- OpenWebUI:
  - confirm provider path
  - capture perceived latency and whether the provider is internal LiteLLM
- Dify WAPI workflow:
  - capture total preview time
  - capture per-node timing if available
  - separate Knowledge Retrieval time from LLM-node time
  - determine whether streaming is enabled or buffered
  - determine whether the workflow uses public LiteLLM or another route

## 15. Performance and Status Fix Summary

### Portal status root cause and fix

- The portal `Not deployed` / `None active` state was a false negative caused by the embedded remote Python inside `lib/ai-runtime.ts` failing before it could return status JSON.
- The concrete failure was a broken indentation path in the vLLM probe branch plus unsafe later use of `ollama_gpu_holder_mib`, which collapsed the probe to an empty fallback object.
- `emit_result()` then hid the real probe failure by returning only `{"checkedAt": null}`, which made the portal look like the runtime was absent instead of unhealthy.
- The repo-side fix was:
  - initialize the Ollama GPU-holder probe before later reads
  - repair the vLLM probe branch so a healthy direct probe sets `vllm.status = Running`
  - make `emit_result()` preserve a short structured warning/error when the remote probe fails
  - update the stale Dify integration row in `lib/model-runtime-manager.ts` to reflect the already repaired LiteLLM-backed WAPI Chatflow

### Verified backend route

- Live LiteLLM configuration still maps alias `getouch-qwen3-14b` to backend model `Qwen/Qwen3-14B-FP8` at internal endpoint `http://vllm-qwen3-14b-fp8:8000/v1`.
- OpenWebUI remains configured to use internal LiteLLM at `http://litellm:4000/v1`.
- The Dify draft workflow still points both Knowledge Retrieval and the LLM node at provider `langgenius/openai_api_compatible/openai_api_compatible` with model name `getouch-qwen3-14b`.
- The Dify draft workflow is wired to pass `Knowledge Retrieval / result` into the LLM context and uses a system prompt that injects `{{#context#}}`.

### Measured performance findings

- Uncached `hi` benchmark before the Ollama unload:
  - direct vLLM: `88.553 s`, `128` completion tokens, about `1.45 tok/s`, GPU max `100%`, VRAM max `15191 MiB`
  - LiteLLM internal from the LiteLLM container: `88.568 s`
  - OpenWebUI provider path through internal LiteLLM: `88.555 s`
  - LiteLLM public with a browser-like user agent: `88.968 s`
- LiteLLM public returned Cloudflare `403 / error code 1010` for the default Python `urllib` user agent, but the same route completed normally with a browser-like user agent.
- The above shows route overhead is negligible. The bottleneck is not LiteLLM or the public edge path; it is the model response path itself.
- After unloading the resident Ollama model, the same uncached direct-vLLM `hi` benchmark remained unchanged at `88.556 s`, which proves Ollama GPU residency was a hygiene issue but not the latency bottleneck.
- Direct vLLM with the operator-style prompt `Explain what GetTouch WAPI does in 3 short bullets.` also remained about `88.537 s` with the default model behavior.
- A direct vLLM probe with `chat_template_kwargs.enable_thinking=false` reduced the same WAPI-style prompt to `37.357 s`, but the answer was incorrect because the prompt lacked retrieval context and the model guessed the meaning of `WAPI`.

### Dify findings

- The live Dify WAPI Preview remained slow after the Ollama unload:
  - nonce test prompt: about `103.364 s`
  - actual prompt `Explain what GetTouch WAPI does in 3 short bullets.`: about `127.924 s`
- The live Preview answer for the actual prompt was still `I'm not sure about that — could you clarify or rephrase your question?`
- Because the workflow wiring is correct, the remaining Dify issue is no longer the provider binding. The current evidence points to the retrieval layer not returning useful GetTouch WAPI context for that question.
- Dify therefore has two separate characteristics right now:
  - the same slow underlying Qwen3 14B generation path as direct vLLM and LiteLLM
  - an additional workflow/content problem where the retrieval result does not produce a useful GetTouch-specific answer

### GPU and host hygiene actions

- Confirmed the only intended production GPU holder is vLLM `Qwen/Qwen3-14B-FP8`.
- Confirmed the Ollama sandbox had still left `qwen3:14b` resident on the GPU before cleanup.
- Safely unloaded only the resident Ollama model with `ollama stop qwen3:14b`.
- Verified afterwards that `ollama ps` was empty and `nvidia-smi` only showed `VLLM::EngineCore`.
- Host swap had returned to `8 GiB` used, but `vmstat` showed no continuing swap-in or swap-out pressure after the Ollama unload.
- Reset the stale swap allocation safely; host swap is now back to `0 B` used.

### Tuning conclusion

- No repo-side route change is required for LiteLLM, OpenWebUI, or the public LiteLLM path. All measured paths converge on the same backend latency.
- No further GPU cleanup is required. Ollama is back to sandbox-idle with no resident model.
- No global `no-thinking` change was applied to the production alias from this repo because the measured no-thinking probe was faster but semantically worse without retrieval context.
- The remaining performance ceiling is the current `Qwen/Qwen3-14B-FP8` response speed on this hardware, about `1.45 tok/s` for these prompts.
- The remaining Dify functional issue is external to this repo's portal code: the workflow wiring is correct, but the retrieval content for the WAPI question is not yielding a useful answer.

### Files changed in this phase

- `lib/ai-runtime.ts`
- `lib/model-runtime-manager.ts`
- `docs/ai-runtime-ecosystem-stabilization.md`

### Live portal validation to record after redeploy

- Push to `main`, let Coolify application id `2` rebuild, then verify:
  - `/ai/vllm`
  - `/admin/ai/vllm`
  - `/admin/service-endpoints/vllm`
  - `/api/admin/service-endpoints/vllm/status`
- Expected portal result after redeploy:
  - runtime shows the vLLM backend as active instead of `Not deployed`
  - active model shows `Qwen3 14B FP8`
  - GPU, RAM, and swap metrics are populated again
  - Dify integration row shows the repaired provider status text from the repo change