#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
CADDYFILE=${CADDYFILE:-"$REPO_ROOT/infra/Caddyfile"}
CADDY_CONTAINER=${CADDY_CONTAINER:-caddy}

prod_name=$(docker ps \
  --filter label=coolify.projectName=wapi \
  --filter label=coolify.environmentName=production \
  --format '{{.Names}}' \
  | head -n 1)

dev_name=$(docker ps \
  --filter label=coolify.projectName=wapi \
  --filter label=coolify.environmentName=development \
  --format '{{.Names}}' \
  | head -n 1)

if [[ -z "$prod_name" || -z "$dev_name" ]]; then
  echo "Unable to detect current WAPI Coolify containers" >&2
  exit 1
fi

before=$(shasum "$CADDYFILE" | awk '{print $1}')

perl -0pi -e 's#(http://wapi\.getouch\.co\s*\{.*?handle\s*\{\s*reverse_proxy\s+)[^:\s]+(:3000\s*\}\s*\})#$1'"$prod_name"'$2#s' "$CADDYFILE"
perl -0pi -e 's#(http://wapi-dev\.getouch\.co\s*\{.*?handle\s*\{\s*reverse_proxy\s+)[^:\s]+(:3000\s*\}\s*\})#$1'"$dev_name"'$2#s' "$CADDYFILE"

after=$(shasum "$CADDYFILE" | awk '{print $1}')

if [[ "$before" == "$after" ]]; then
  echo "Caddy upstreams already match Coolify containers"
  exit 0
fi

docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null
docker restart "$CADDY_CONTAINER" >/dev/null

echo "Updated WAPI upstreams:"
echo "  prod -> $prod_name"
echo "  dev  -> $dev_name"