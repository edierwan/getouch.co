#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_SCRIPT="${SYNC_SCRIPT:-$SCRIPT_DIR/sync-wapi-dev-caddy-upstream.sh}"
COOLIFY_PROJECT="${COOLIFY_PROJECT:-wapi}"
COOLIFY_ENVIRONMENT="${COOLIFY_ENVIRONMENT:-development}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-2}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

sync_now() {
  if "$SYNC_SCRIPT"; then
    log "Upstream sync completed."
  else
    log "Upstream sync failed; waiting for the next matching Docker event."
  fi
}

stream_events() {
  docker events \
    --filter 'type=container' \
    --filter "label=coolify.projectName=${COOLIFY_PROJECT}" \
    --filter "label=coolify.environmentName=${COOLIFY_ENVIRONMENT}" \
    --format '{{.Action}}	{{index .Actor.Attributes "name"}}'
}

main() {
  if [[ ! -f "$SYNC_SCRIPT" ]]; then
    log "Sync script not found at $SYNC_SCRIPT"
    exit 1
  fi

  log "Starting initial WAPI dev upstream sync."
  sync_now

  while true; do
    log "Watching Docker events for project=${COOLIFY_PROJECT} env=${COOLIFY_ENVIRONMENT}"
    while IFS=$'\t' read -r status name; do
      case "$status" in
        start|restart|rename|health_status:\ healthy)
          log "Detected Docker event status=${status} container=${name}; syncing Caddy."
          sync_now
          ;;
      esac
    done < <(stream_events)

    log "Docker event stream exited; retrying in ${RETRY_DELAY_SECONDS}s."
    sleep "$RETRY_DELAY_SECONDS"
  done
}

main "$@"