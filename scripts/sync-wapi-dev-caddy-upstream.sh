#!/usr/bin/env bash

set -euo pipefail

CADDYFILE="${CADDYFILE:-/home/deploy/apps/getouch.co/infra/Caddyfile}"
CADDY_CONTAINER="${CADDY_CONTAINER:-caddy}"
COOLIFY_PROJECT="${COOLIFY_PROJECT:-wapi}"
COOLIFY_ENVIRONMENT="${COOLIFY_ENVIRONMENT:-development}"
TARGET_HOSTNAME="wapi-dev.getouch.co"
TARGET_PORT="3000"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

extract_upstream() {
  perl -0ne 'if (/http:\/\/wapi-dev\.getouch\.co\s*\{.*?handle\s*\{\s*reverse_proxy\s+([^\s]+)\s*\}\s*\}/s) { print $1 }' "$1"
}

current_container_name() {
  docker ps \
    --filter "label=coolify.projectName=${COOLIFY_PROJECT}" \
    --filter "label=coolify.environmentName=${COOLIFY_ENVIRONMENT}" \
    --format '{{.Names}}' \
    | head -n 1
}

validate_candidate() {
  local candidate_file="$1"
  docker exec -i "$CADDY_CONTAINER" sh -lc '
    cat > /tmp/Caddyfile.candidate
    caddy validate --config /tmp/Caddyfile.candidate --adapter caddyfile
  ' < "$candidate_file"
}

main() {
  if [[ ! -f "$CADDYFILE" ]]; then
    log "Caddyfile not found at $CADDYFILE"
    exit 1
  fi

  local container_name
  container_name="$(current_container_name)"
  if [[ -z "$container_name" ]]; then
    log "No running Coolify container found for project=${COOLIFY_PROJECT} env=${COOLIFY_ENVIRONMENT}"
    exit 1
  fi

  local desired_upstream="${container_name}:${TARGET_PORT}"
  local existing_upstream
  existing_upstream="$(extract_upstream "$CADDYFILE")"
  if [[ -z "$existing_upstream" ]]; then
    log "Unable to locate ${TARGET_HOSTNAME} reverse_proxy block in $CADDYFILE"
    exit 1
  fi

  if [[ "$existing_upstream" == "$desired_upstream" ]]; then
    log "No change required for ${TARGET_HOSTNAME}; already pointing to ${desired_upstream}"
    exit 0
  fi

  local candidate_file
  candidate_file="$(mktemp "${TMPDIR:-/tmp}/wapi-dev-caddy.XXXXXX")"
  trap 'rm -f "${candidate_file:-}"' EXIT
  cp "$CADDYFILE" "$candidate_file"

  TARGET_UPSTREAM="$desired_upstream" perl -0pi -e '
    s#(http://wapi-dev\.getouch\.co\s*\{.*?handle\s*\{\s*reverse_proxy\s+)[^\s]+(\s*\}\s*\})#$1$ENV{TARGET_UPSTREAM}$2#s
      or die "Failed to update wapi-dev.getouch.co reverse_proxy block\\n";
  ' "$candidate_file"

  validate_candidate "$candidate_file"
  cp "$candidate_file" "$CADDYFILE"

  log "Validated new ${TARGET_HOSTNAME} upstream; reloading ${CADDY_CONTAINER} via SIGUSR1 because the Caddy admin API is disabled."
  docker kill -s SIGUSR1 "$CADDY_CONTAINER" >/dev/null

  log "Updated ${TARGET_HOSTNAME}: ${existing_upstream} -> ${desired_upstream}"
}

main "$@"