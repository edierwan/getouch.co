#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="${GETOUCH_GPU_TEXTFILE_DIR:-/var/lib/node_exporter/textfile_collector}"
OUTPUT_FILE="${OUTPUT_DIR}/getouch_gpu_process.prom"
TMP_FILE="$(mktemp "${OUTPUT_FILE}.XXXXXX")"

trap 'rm -f "$TMP_FILE"' EXIT

mkdir -p "$OUTPUT_DIR"

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

escape_label() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/ }
  printf '%s' "$value"
}

to_bytes_from_mib() {
  awk -v value="$1" 'BEGIN { printf "%.0f", value * 1024 * 1024 }'
}

detect_runtime() {
  local haystack
  haystack="$(printf '%s %s %s' "$1" "$2" "$3" | tr '[:upper:]' '[:lower:]')"

  case "$haystack" in
    *ollama*) printf '%s' 'ollama' ;;
    *vllm*) printf '%s' 'vllm' ;;
    *litellm*) printf '%s' 'litellm' ;;
    *open-webui*) printf '%s' 'open-webui' ;;
    *python*) printf '%s' 'python' ;;
    *) printf '%s' 'unknown' ;;
  esac
}

detect_runtime_hint() {
  case "$1" in
    ollama) printf '%s' 'Ollama runtime' ;;
    vllm) printf '%s' 'vLLM backend' ;;
    litellm) printf '%s' 'LiteLLM gateway' ;;
    open-webui) printf '%s' 'Open WebUI process' ;;
    python) printf '%s' 'Generic Python worker' ;;
    *) printf '%s' 'Unclassified runtime' ;;
  esac
}

get_ollama_ps_output() {
  if command -v docker >/dev/null 2>&1; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'ollama'; then
      docker exec ollama ollama ps 2>/dev/null || true
      return
    fi
  fi

  if command -v ollama >/dev/null 2>&1; then
    ollama ps 2>/dev/null || true
  fi
}

write_header() {
  cat >"$TMP_FILE" <<'EOF'
# HELP getouch_gpu_process_scrape_success Whether the Getouch GPU process collector succeeded.
# TYPE getouch_gpu_process_scrape_success gauge
# HELP getouch_gpu_process_collected_at_seconds Unix timestamp of the most recent Getouch GPU process scrape.
# TYPE getouch_gpu_process_collected_at_seconds gauge
# HELP getouch_gpu_process_info Metadata row for each detected GPU process.
# TYPE getouch_gpu_process_info gauge
# HELP getouch_gpu_process_memory_mib GPU memory used by a process in MiB.
# TYPE getouch_gpu_process_memory_mib gauge
# HELP getouch_gpu_process_memory_bytes GPU memory used by a process in bytes.
# TYPE getouch_gpu_process_memory_bytes gauge
# HELP getouch_gpu_loaded_model_info Metadata row for each runtime-reported loaded model.
# TYPE getouch_gpu_loaded_model_info gauge
# HELP getouch_gpu_process_count Number of GPU processes detected for a given GPU.
# TYPE getouch_gpu_process_count gauge
# HELP getouch_gpu_device_info Metadata row for each GPU device discovered via nvidia-smi.
# TYPE getouch_gpu_device_info gauge
# HELP getouch_gpu_device_utilization_percent Current GPU utilization percent.
# TYPE getouch_gpu_device_utilization_percent gauge
# HELP getouch_gpu_device_memory_used_mib Current GPU framebuffer memory used in MiB.
# TYPE getouch_gpu_device_memory_used_mib gauge
# HELP getouch_gpu_device_memory_used_bytes Current GPU framebuffer memory used in bytes.
# TYPE getouch_gpu_device_memory_used_bytes gauge
# HELP getouch_gpu_device_memory_total_mib Total GPU framebuffer memory in MiB.
# TYPE getouch_gpu_device_memory_total_mib gauge
# HELP getouch_gpu_device_memory_total_bytes Total GPU framebuffer memory in bytes.
# TYPE getouch_gpu_device_memory_total_bytes gauge
# HELP getouch_gpu_device_memory_utilization_percent Current GPU framebuffer memory utilization percent.
# TYPE getouch_gpu_device_memory_utilization_percent gauge
# HELP getouch_gpu_device_power_watts Current GPU power draw in watts.
# TYPE getouch_gpu_device_power_watts gauge
# HELP getouch_gpu_device_power_limit_watts Configured GPU power limit in watts.
# TYPE getouch_gpu_device_power_limit_watts gauge
# HELP getouch_gpu_device_temperature_celsius Current GPU temperature in degrees Celsius.
# TYPE getouch_gpu_device_temperature_celsius gauge
EOF
}

write_failure() {
  local reason="$1"
  write_header
  printf 'getouch_gpu_process_scrape_success 0\n' >>"$TMP_FILE"
  printf 'getouch_gpu_process_collected_at_seconds %s\n' "$(date +%s)" >>"$TMP_FILE"
  printf 'getouch_gpu_process_info{gpu="",gpu_uuid="",pid="",process_name="",process_basename="",owner_kind="collector",owner_name="collector",owner_service="",container_name="collector",service="collector",runtime="unknown",runtime_hint="%s"} 0\n' "$(escape_label "$reason")" >>"$TMP_FILE"
  chmod 0644 "$TMP_FILE"
  mv "$TMP_FILE" "$OUTPUT_FILE"
  exit 0
}

if ! command -v nvidia-smi >/dev/null 2>&1; then
  write_failure 'nvidia-smi unavailable'
fi

gpu_output="$(nvidia-smi --query-gpu=index,uuid,name,utilization.gpu,memory.used,memory.total,power.draw,power.limit,temperature.gpu --format=csv,noheader,nounits 2>/dev/null || true)"
if [[ -z "$gpu_output" ]]; then
  write_failure 'gpu query returned no data'
fi

declare -A GPU_INDEX=()
declare -A GPU_NAME=()
declare -A GPU_UTIL=()
declare -A GPU_MEM_USED=()
declare -A GPU_MEM_TOTAL=()
declare -A GPU_MEM_PCT=()
declare -A GPU_POWER=()
declare -A GPU_POWER_LIMIT=()
declare -A GPU_TEMP=()
declare -A GPU_PROCESS_COUNT=()
declare -A RUNTIME_GPU=()

while IFS=, read -r raw_index raw_uuid raw_name raw_util raw_mem_used raw_mem_total raw_power raw_power_limit raw_temp; do
  [[ -n "${raw_uuid:-}" ]] || continue
  local_index="$(trim "$raw_index")"
  local_uuid="$(trim "$raw_uuid")"
  local_name="$(trim "$raw_name")"
  local_util="$(trim "$raw_util")"
  local_mem_used="$(trim "$raw_mem_used")"
  local_mem_total="$(trim "$raw_mem_total")"
  local_power="$(trim "$raw_power")"
  local_power_limit="$(trim "$raw_power_limit")"
  local_temp="$(trim "$raw_temp")"
  local_mem_pct="$(awk -v used="$local_mem_used" -v total="$local_mem_total" 'BEGIN { if (total > 0) printf "%.4f", (used / total) * 100; else printf "0" }')"

  GPU_INDEX["$local_uuid"]="$local_index"
  GPU_NAME["$local_uuid"]="$local_name"
  GPU_UTIL["$local_uuid"]="$local_util"
  GPU_MEM_USED["$local_uuid"]="$local_mem_used"
  GPU_MEM_TOTAL["$local_uuid"]="$local_mem_total"
  GPU_MEM_PCT["$local_uuid"]="$local_mem_pct"
  GPU_POWER["$local_uuid"]="$local_power"
  GPU_POWER_LIMIT["$local_uuid"]="$local_power_limit"
  GPU_TEMP["$local_uuid"]="$local_temp"
  GPU_PROCESS_COUNT["$local_uuid"]=0
done <<<"$gpu_output"

declare -A CONTAINER_NAME=()
if command -v docker >/dev/null 2>&1; then
  while read -r container_id container_name; do
    [[ -n "${container_id:-}" ]] || continue
    CONTAINER_NAME["$container_id"]="$container_name"
  done < <(docker ps --no-trunc --format '{{.ID}} {{.Names}}' 2>/dev/null || true)
fi

write_header
printf 'getouch_gpu_process_scrape_success 1\n' >>"$TMP_FILE"
printf 'getouch_gpu_process_collected_at_seconds %s\n' "$(date +%s)" >>"$TMP_FILE"

for gpu_uuid in "${!GPU_INDEX[@]}"; do
  gpu_index="${GPU_INDEX[$gpu_uuid]}"
  gpu_name="${GPU_NAME[$gpu_uuid]}"
  gpu_mem_used="${GPU_MEM_USED[$gpu_uuid]}"
  gpu_mem_total="${GPU_MEM_TOTAL[$gpu_uuid]}"

  printf 'getouch_gpu_device_info{gpu="%s",gpu_uuid="%s",gpu_name="%s"} 1\n' \
    "$(escape_label "$gpu_index")" \
    "$(escape_label "$gpu_uuid")" \
    "$(escape_label "$gpu_name")" >>"$TMP_FILE"
  printf 'getouch_gpu_device_utilization_percent{gpu="%s",gpu_uuid="%s",gpu_name="%s"} %s\n' \
    "$(escape_label "$gpu_index")" "$(escape_label "$gpu_uuid")" "$(escape_label "$gpu_name")" "${GPU_UTIL[$gpu_uuid]}" >>"$TMP_FILE"
  printf 'getouch_gpu_device_memory_used_mib{gpu="%s",gpu_uuid="%s",gpu_name="%s"} %s\n' \
    "$(escape_label "$gpu_index")" "$(escape_label "$gpu_uuid")" "$(escape_label "$gpu_name")" "$gpu_mem_used" >>"$TMP_FILE"
  printf 'getouch_gpu_device_memory_used_bytes{gpu="%s",gpu_uuid="%s",gpu_name="%s"} %s\n' \
    "$(escape_label "$gpu_index")" "$(escape_label "$gpu_uuid")" "$(escape_label "$gpu_name")" "$(to_bytes_from_mib "$gpu_mem_used")" >>"$TMP_FILE"
  printf 'getouch_gpu_device_memory_total_mib{gpu="%s",gpu_uuid="%s",gpu_name="%s"} %s\n' \
    "$(escape_label "$gpu_index")" "$(escape_label "$gpu_uuid")" "$(escape_label "$gpu_name")" "$gpu_mem_total" >>"$TMP_FILE"
  printf 'getouch_gpu_device_memory_total_bytes{gpu="%s",gpu_uuid="%s",gpu_name="%s"} %s\n' \
    "$(escape_label "$gpu_index")" "$(escape_label "$gpu_uuid")" "$(escape_label "$gpu_name")" "$(to_bytes_from_mib "$gpu_mem_total")" >>"$TMP_FILE"
  printf 'getouch_gpu_device_memory_utilization_percent{gpu="%s",gpu_uuid="%s",gpu_name="%s"} %s\n' \
    "$(escape_label "$gpu_index")" "$(escape_label "$gpu_uuid")" "$(escape_label "$gpu_name")" "${GPU_MEM_PCT[$gpu_uuid]}" >>"$TMP_FILE"
  printf 'getouch_gpu_device_power_watts{gpu="%s",gpu_uuid="%s",gpu_name="%s"} %s\n' \
    "$(escape_label "$gpu_index")" "$(escape_label "$gpu_uuid")" "$(escape_label "$gpu_name")" "${GPU_POWER[$gpu_uuid]}" >>"$TMP_FILE"
  printf 'getouch_gpu_device_power_limit_watts{gpu="%s",gpu_uuid="%s",gpu_name="%s"} %s\n' \
    "$(escape_label "$gpu_index")" "$(escape_label "$gpu_uuid")" "$(escape_label "$gpu_name")" "${GPU_POWER_LIMIT[$gpu_uuid]}" >>"$TMP_FILE"
  printf 'getouch_gpu_device_temperature_celsius{gpu="%s",gpu_uuid="%s",gpu_name="%s"} %s\n' \
    "$(escape_label "$gpu_index")" "$(escape_label "$gpu_uuid")" "$(escape_label "$gpu_name")" "${GPU_TEMP[$gpu_uuid]}" >>"$TMP_FILE"
done

process_output="$(nvidia-smi --query-compute-apps=gpu_uuid,pid,process_name,used_memory --format=csv,noheader,nounits 2>/dev/null || true)"
if [[ -n "$process_output" && "$process_output" != "No running processes found" && "$process_output" != "No running compute processes found" ]]; then
  while IFS=, read -r raw_gpu_uuid raw_pid raw_process_name raw_used_memory; do
    [[ -n "${raw_pid:-}" ]] || continue
    gpu_uuid="$(trim "$raw_gpu_uuid")"
    pid="$(trim "$raw_pid")"
    process_name="$(trim "$raw_process_name")"
    used_memory_mib="$(trim "$raw_used_memory")"
    gpu_index="${GPU_INDEX[$gpu_uuid]:-unknown}"
    process_basename="$(basename "$process_name")"
    owner_kind='host'
    owner_name='host'
    owner_service=''
    container_name='host'

    if [[ -r "/proc/$pid/cgroup" ]]; then
      cgroup_contents="$(cat "/proc/$pid/cgroup")"
      if [[ "$cgroup_contents" =~ ([0-9a-f]{64}) ]]; then
        container_id="${BASH_REMATCH[1]}"
        owner_kind='container'
        owner_name="${CONTAINER_NAME[$container_id]:-$container_id}"
        container_name="$owner_name"
        if command -v docker >/dev/null 2>&1; then
          inspect_output="$(docker inspect --format '{{.Name}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "coolify.service.name"}}|{{index .Config.Labels "coolify.resourceName"}}' "$container_id" 2>/dev/null || true)"
          if [[ -n "$inspect_output" ]]; then
            IFS='|' read -r inspect_name compose_service coolify_service coolify_resource <<<"$inspect_output"
            inspect_name="${inspect_name#/}"
            owner_name="${inspect_name:-$owner_name}"
            container_name="$owner_name"
            owner_service="${compose_service:-${coolify_service:-${coolify_resource:-}}}"
          fi
        fi
      elif [[ "$cgroup_contents" =~ ([^/]+\.service) ]]; then
        owner_name="${BASH_REMATCH[1]}"
      fi
    fi

    runtime="$(detect_runtime "$process_name" "$owner_name" "$owner_service")"
    runtime_hint="$(detect_runtime_hint "$runtime")"
    service="$owner_service"
    if [[ -z "$service" ]]; then
      case "$runtime" in
        ollama|vllm|litellm|open-webui) service="$runtime" ;;
        *) service="$process_basename" ;;
      esac
    fi

    if [[ "$runtime" != "unknown" ]]; then
      RUNTIME_GPU["$runtime|$container_name|$service"]="$gpu_index"
    fi

    GPU_PROCESS_COUNT["$gpu_uuid"]=$(( ${GPU_PROCESS_COUNT[$gpu_uuid]:-0} + 1 ))

    printf 'getouch_gpu_process_info{gpu="%s",gpu_uuid="%s",pid="%s",process_name="%s",process_basename="%s",owner_kind="%s",owner_name="%s",owner_service="%s",container_name="%s",service="%s",runtime="%s",runtime_hint="%s"} 1\n' \
      "$(escape_label "$gpu_index")" \
      "$(escape_label "$gpu_uuid")" \
      "$(escape_label "$pid")" \
      "$(escape_label "$process_name")" \
      "$(escape_label "$process_basename")" \
      "$(escape_label "$owner_kind")" \
      "$(escape_label "$owner_name")" \
      "$(escape_label "$owner_service")" \
      "$(escape_label "$container_name")" \
      "$(escape_label "$service")" \
      "$(escape_label "$runtime")" \
      "$(escape_label "$runtime_hint")" >>"$TMP_FILE"
    printf 'getouch_gpu_process_memory_mib{gpu="%s",gpu_uuid="%s",pid="%s",process_name="%s",process_basename="%s",owner_kind="%s",owner_name="%s",owner_service="%s",container_name="%s",service="%s",runtime="%s",runtime_hint="%s"} %s\n' \
      "$(escape_label "$gpu_index")" \
      "$(escape_label "$gpu_uuid")" \
      "$(escape_label "$pid")" \
      "$(escape_label "$process_name")" \
      "$(escape_label "$process_basename")" \
      "$(escape_label "$owner_kind")" \
      "$(escape_label "$owner_name")" \
      "$(escape_label "$owner_service")" \
      "$(escape_label "$container_name")" \
      "$(escape_label "$service")" \
      "$(escape_label "$runtime")" \
      "$(escape_label "$runtime_hint")" \
      "$used_memory_mib" >>"$TMP_FILE"
    printf 'getouch_gpu_process_memory_bytes{gpu="%s",gpu_uuid="%s",pid="%s",process_name="%s",process_basename="%s",owner_kind="%s",owner_name="%s",owner_service="%s",container_name="%s",service="%s",runtime="%s",runtime_hint="%s"} %s\n' \
      "$(escape_label "$gpu_index")" \
      "$(escape_label "$gpu_uuid")" \
      "$(escape_label "$pid")" \
      "$(escape_label "$process_name")" \
      "$(escape_label "$process_basename")" \
      "$(escape_label "$owner_kind")" \
      "$(escape_label "$owner_name")" \
      "$(escape_label "$owner_service")" \
      "$(escape_label "$container_name")" \
      "$(escape_label "$service")" \
      "$(escape_label "$runtime")" \
      "$(escape_label "$runtime_hint")" \
      "$(to_bytes_from_mib "$used_memory_mib")" >>"$TMP_FILE"
  done <<<"$process_output"
fi

ollama_ps_output="$(get_ollama_ps_output)"
if [[ -n "$ollama_ps_output" ]]; then
  while IFS='|' read -r model model_id size processor context until; do
    [[ -n "${model:-}" ]] || continue
    gpu_index="${RUNTIME_GPU["ollama|ollama|ollama"]:-unknown}"
    printf 'getouch_gpu_loaded_model_info{gpu="%s",runtime="ollama",container_name="ollama",service="ollama",model="%s",model_id="%s",size="%s",processor="%s",context="%s",until="%s"} 1\n' \
      "$(escape_label "$gpu_index")" \
      "$(escape_label "$model")" \
      "$(escape_label "$model_id")" \
      "$(escape_label "$size")" \
      "$(escape_label "$processor")" \
      "$(escape_label "$context")" \
      "$(escape_label "$until")" >>"$TMP_FILE"
  done < <(printf '%s\n' "$ollama_ps_output" | tail -n +2 | sed -E 's/[[:space:]]{2,}/|/g')
elif [[ -n "${RUNTIME_GPU["ollama|ollama|ollama"]:-}" ]]; then
  printf 'getouch_gpu_loaded_model_info{gpu="%s",runtime="ollama",container_name="ollama",service="ollama",model="unknown",model_id="unknown",size="unknown",processor="unknown",context="",until="unknown"} 1\n' \
    "$(escape_label "${RUNTIME_GPU["ollama|ollama|ollama"]}")" >>"$TMP_FILE"
fi

for gpu_uuid in "${!GPU_INDEX[@]}"; do
  printf 'getouch_gpu_process_count{gpu="%s",gpu_uuid="%s",gpu_name="%s"} %s\n' \
    "$(escape_label "${GPU_INDEX[$gpu_uuid]}")" \
    "$(escape_label "$gpu_uuid")" \
    "$(escape_label "${GPU_NAME[$gpu_uuid]}")" \
    "${GPU_PROCESS_COUNT[$gpu_uuid]:-0}" >>"$TMP_FILE"
done

chmod 0644 "$TMP_FILE"
mv "$TMP_FILE" "$OUTPUT_FILE"