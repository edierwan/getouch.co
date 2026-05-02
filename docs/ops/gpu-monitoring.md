# GPU Monitoring

Updated: 2026-05-02

## Source of Truth

- Grafana and Prometheus are the operator source of truth for GPU monitoring.
- DCGM remains the primary source for device-level GPU utilization, framebuffer usage, temperature, and live power draw.
- A repo-managed `nvidia-smi` textfile collector supplements DCGM with per-process VRAM ownership, PID, container, runtime, and GPU power-limit metadata.
- Loaded model identity comes from runtime interfaces such as `ollama ps` when the runtime exposes it.

## Key Interpretation Rules

- `GPU Utilization` means active compute work.
- `VRAM Used` means model or process memory occupancy.
- High VRAM with `0%` GPU utilization usually means a model is loaded but idle.
- The process table and top-consumer panels identify which process or container is holding VRAM.
- If a model cannot be detected from a runtime API or CLI, the dashboard must show it as unknown instead of inferring or faking a model name.

## Provisioned Dashboard

- Dashboard name: `GetTouch GPU Runtime Detail`
- Folder: `GPU`
- Expected URL: `https://grafana.getouch.co/d/gettouch-gpu-runtime-detail/gettouch-gpu-runtime-detail`

## Metrics Sources

### DCGM metrics

- `DCGM_FI_DEV_GPU_UTIL`
- `DCGM_FI_DEV_FB_USED`
- `DCGM_FI_DEV_FB_FREE`
- `DCGM_FI_DEV_POWER_USAGE`
- `DCGM_FI_DEV_GPU_TEMP`

### Supplemental Getouch metrics

- `getouch_gpu_process_memory_bytes`
- `getouch_gpu_process_memory_mib`
- `getouch_gpu_process_info`
- `getouch_gpu_loaded_model_info`
- `getouch_gpu_process_count`
- `getouch_gpu_device_power_limit_watts`

These supplemental metrics are written by `infra/scripts/getouch-gpu-process-metrics.sh` into the node-exporter textfile collector directory and refreshed by the `gettouch-gpu-process-metrics.timer` systemd unit.

- Per-process ownership comes from `nvidia-smi` and `/proc/<pid>/cgroup` container mapping.
- Model identity comes from runtime APIs or CLIs such as `ollama ps` when available.

## Current Interpretation Example

- If the top row shows about `0%` utilization, about `15 GiB` VRAM used, about `39 C`, and about `8 W`, the GPU is not actively computing.
- If the process table shows `ollama` as the top VRAM consumer, that means Ollama is holding the model in memory.
- If the loaded-model table shows `qwen3-vl:32b` with Ollama residency, that means the runtime itself confirmed that model is loaded.
- That state is expected for an idle but warm model-serving runtime and is not evidence of a fault by itself.