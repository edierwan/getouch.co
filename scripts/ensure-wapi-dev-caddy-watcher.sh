#!/usr/bin/env bash

set -euo pipefail

WATCH_SCRIPT="${WATCH_SCRIPT:-/home/deploy/apps/getouch.co/scripts/watch-wapi-dev-caddy-upstream.sh}"
LOG_FILE="${LOG_FILE:-/home/deploy/apps/getouch.co/logs/wapi-dev-caddy-upstream-watcher.log}"
PROCESS_PATTERN="${PROCESS_PATTERN:-/bin/bash /home/deploy/apps/getouch.co/scripts/watch-wapi-dev-caddy-upstream.sh$}"

mkdir -p "$(dirname "$LOG_FILE")"

if /usr/bin/pgrep -f "$PROCESS_PATTERN" >/dev/null; then
  exit 0
fi

printf '[%s] Starting WAPI dev Caddy watcher.\n' "$(date -Is)" >> "$LOG_FILE"
/usr/bin/nohup /bin/bash "$WATCH_SCRIPT" >> "$LOG_FILE" 2>&1 < /dev/null &