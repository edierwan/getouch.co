#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
VERIFY_HOST="${VERIFY_HOST:-deploy@100.84.14.93}"
REMOTE_REPO_DIR="${REMOTE_REPO_DIR:-/home/deploy/apps/getouch.co}"
EXPECTED_UPSTREAM="${EXPECTED_UPSTREAM:-getouch-coolify-app}"
CADDY_CONTAINER="${CADDY_CONTAINER:-caddy}"
FORBIDDEN_SERVICE_PATTERN='^(web|getouch-web|portal-web|nextjs|frontend)$'

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

pass() {
  echo "OK: $1"
}

remote_sh() {
  ssh "$VERIFY_HOST" "$1"
}

check_local_compose_file() {
  local compose_file="$1"

  [[ -f "$compose_file" ]] || return 0

  if grep -Eq '^[[:space:]]{2}(web|getouch-web|portal-web|nextjs|frontend):[[:space:]]*$' "$compose_file"; then
    fail "${compose_file} still defines a legacy portal service"
  fi

  if grep -Eq 'container_name:[[:space:]]*(getouch-web|getouch-web-prod)([[:alnum:]_.-]*)?$' "$compose_file"; then
    fail "${compose_file} still defines a legacy portal container name"
  fi
}

search_forbidden_deploy_refs() {
  local search_root="$1"
  [[ -d "$search_root" ]] || return 0

  find "$search_root" -type f ! -name 'verify-*' -exec grep -n -E 'docker compose .*\bweb\b|docker-compose .*\bweb\b|--build web\b|compose-served' {} + 2>/dev/null || true
}

cd "$REPO_DIR"

[[ -d .git ]] || fail "${REPO_DIR} is not a git checkout"
[[ -f infra/Caddyfile ]] || fail 'infra/Caddyfile is missing'
[[ -f compose.yaml ]] || fail 'compose.yaml is missing'
command -v ssh >/dev/null 2>&1 || fail 'ssh is required'
command -v curl >/dev/null 2>&1 || fail 'curl is required'

check_local_compose_file compose.yaml
check_local_compose_file docker-compose.yml
pass 'local compose files do not define a legacy portal web service'

if grep -Eq 'getouch-web|getouch-web-prod' infra/Caddyfile; then
  fail 'infra/Caddyfile still mentions a legacy portal upstream'
fi
pass 'local infra/Caddyfile does not mention legacy portal upstreams'

local_script_hits="$(
  {
    search_forbidden_deploy_refs scripts
    search_forbidden_deploy_refs infra/scripts
  } | sed '/^$/d'
)"
if [[ -n "$local_script_hits" ]]; then
  printf '%s\n' "$local_script_hits"
  fail 'local deploy scripts still reference a legacy compose web path'
fi
pass 'local deploy scripts do not reference the retired compose web path'

legacy_containers="$(remote_sh "docker ps -a --format '{{.Names}}' | grep -Ei 'getouch-web|getouch-web-prod' || true")"
if [[ -n "$legacy_containers" ]]; then
  printf '%s\n' "$legacy_containers"
  fail 'legacy portal containers still exist on the host'
fi
pass 'no legacy portal containers exist on the host'

remote_services="$(remote_sh "docker compose -f '$REMOTE_REPO_DIR/compose.yaml' config --services 2>/dev/null || true")"
if [[ -z "$remote_services" ]]; then
  fail 'could not read remote compose services from compose.yaml'
fi
printf 'remote_compose_services=%s\n' "$(tr '\n' ',' <<<"$remote_services" | sed 's/,$//')"
if grep -Eq "$FORBIDDEN_SERVICE_PATTERN" <<<"$remote_services"; then
  fail 'remote compose.yaml still defines a legacy portal service'
fi

remote_alt_services="$(remote_sh "if [ -f '$REMOTE_REPO_DIR/docker-compose.yml' ]; then docker compose -f '$REMOTE_REPO_DIR/docker-compose.yml' config --services 2>/dev/null; fi")"
if [[ -n "$remote_alt_services" ]] && grep -Eq "$FORBIDDEN_SERVICE_PATTERN" <<<"$remote_alt_services"; then
  fail 'remote docker-compose.yml still defines a legacy portal service'
fi
pass 'remote compose configs do not define a legacy portal service'

project_service_hits="$(remote_sh "docker ps -a --filter label=com.docker.compose.project=getouchco --format '{{.Names}} {{.Label \"com.docker.compose.service\"}}' | grep -E ' (web|getouch-web|portal-web|nextjs|frontend)$' || true")"
if [[ -n "$project_service_hits" ]]; then
  printf '%s\n' "$project_service_hits"
  fail 'active getouchco containers still expose a legacy portal service label'
fi
pass 'active getouchco containers do not expose a legacy portal service label'

resolved_upstream="$(remote_sh "docker exec '$CADDY_CONTAINER' getent hosts '$EXPECTED_UPSTREAM' 2>/dev/null || true")"
if [[ -z "$resolved_upstream" ]]; then
  fail "caddy cannot resolve ${EXPECTED_UPSTREAM}"
fi
printf 'resolved_%s=%s\n' "$EXPECTED_UPSTREAM" "$(tr -s ' ' <<<"$resolved_upstream")"
pass "caddy resolves ${EXPECTED_UPSTREAM}"

if remote_sh "docker exec '$CADDY_CONTAINER' getent hosts getouch-web >/dev/null 2>&1"; then
  fail 'caddy still resolves getouch-web'
fi
if remote_sh "docker exec '$CADDY_CONTAINER' getent hosts getouch-web-prod >/dev/null 2>&1"; then
  fail 'caddy still resolves getouch-web-prod'
fi
pass 'caddy does not resolve legacy portal aliases'

active_caddy_hits="$(remote_sh "docker exec '$CADDY_CONTAINER' grep -n -E 'getouch-web|getouch-web-prod' /etc/caddy/Caddyfile 2>/dev/null || true")"
if [[ -n "$active_caddy_hits" ]]; then
  printf '%s\n' "$active_caddy_hits"
  fail 'active Caddy config still mentions a legacy portal upstream'
fi
pass 'active Caddy config does not mention legacy portal upstreams'

remote_script_hits="$(remote_sh "find '$REMOTE_REPO_DIR/scripts' '$REMOTE_REPO_DIR/infra/scripts' -type f ! -name 'verify-*' -exec grep -n -E 'docker compose .*\\bweb\\b|docker-compose .*\\bweb\\b|--build web\\b|compose-served' {} + 2>/dev/null || true; grep -R -n -E 'docker compose .*\\bweb\\b|docker-compose .*\\bweb\\b|--build web\\b|compose-served' /data/coolify 2>/dev/null || true")"
if [[ -n "$remote_script_hits" ]]; then
  printf '%s\n' "$remote_script_hits"
  fail 'active host deploy scripts still reference a legacy compose web path'
fi
pass 'active host deploy scripts do not reference the retired compose web path'

build_info="$(curl -fsS https://portal.getouch.co/api/build-info)"
portal_commit="$(printf '%s' "$build_info" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("commit", ""))')"
[[ -n "$portal_commit" ]] || fail 'live build-info is missing commit metadata'
printf 'portal_commit=%s\n' "$portal_commit"
pass 'portal build-info is reachable'