#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(pwd)}"
EXPECTED_REMOTE="${EXPECTED_REMOTE:-https://github.com/edierwan/getouch.co.git}"
EXPECTED_BRANCH="${EXPECTED_BRANCH:-}"
EXPECTED_COMMIT="${EXPECTED_COMMIT:-}"
EXPECTED_UPSTREAM="${EXPECTED_UPSTREAM:-getouch-web}"
EXPECTED_APP_DB_NAME="${EXPECTED_APP_DB_NAME:-getouch.co}"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

pass() {
  echo "OK: $1"
}

extract_upstreams() {
  local host="$1"
  python3 - "$host" <<'PY'
import pathlib
import sys

host = sys.argv[1]
content = pathlib.Path('infra/Caddyfile').read_text()
marker = f'http://{host} {{'
start = content.find(marker)
if start == -1:
    raise SystemExit(2)
rest = content[start:]
end = rest.find('\n}\n')
block = rest if end == -1 else rest[:end + 3]
targets = []
for line in block.splitlines():
    line = line.strip()
    if line.startswith('reverse_proxy '):
        target = line.split()[1]
        targets.append(target.split(':')[0])
if targets:
    print('\n'.join(targets))
else:
    raise SystemExit(3)
PY
}

cd "$REPO_DIR"

[[ -d .git ]] || fail "${REPO_DIR} is not a git checkout"
[[ -f infra/Caddyfile ]] || fail "infra/Caddyfile is missing"
[[ -f compose.yaml ]] || fail "compose.yaml is missing"

remote_url="$(git remote get-url origin)"
branch="$(git branch --show-current)"
commit="$(git rev-parse HEAD)"

echo "repo_path=$PWD"
echo "remote=$remote_url"
echo "branch=$branch"
echo "commit=$commit"

[[ "$remote_url" == "$EXPECTED_REMOTE" ]] || fail "origin remote does not match ${EXPECTED_REMOTE}"
pass "origin remote matches ${EXPECTED_REMOTE}"

if [[ -n "$EXPECTED_BRANCH" && "$branch" != "$EXPECTED_BRANCH" ]]; then
  fail "branch ${branch} does not match EXPECTED_BRANCH=${EXPECTED_BRANCH}"
fi

if [[ -n "$EXPECTED_COMMIT" && "$commit" != "$EXPECTED_COMMIT" ]]; then
  fail "commit ${commit} does not match EXPECTED_COMMIT=${EXPECTED_COMMIT}"
fi

for host in getouch.co auth.getouch.co portal.getouch.co; do
  upstreams="$(extract_upstreams "$host")"
  echo "${host}_upstreams=$(tr '\n' ',' <<<"$upstreams" | sed 's/,$//')"
  grep -qx "$EXPECTED_UPSTREAM" <<<"$upstreams" || fail "${host} does not route to ${EXPECTED_UPSTREAM}"
done
pass "critical hosts share upstream ${EXPECTED_UPSTREAM}"

grep -q 'container_name: getouch-web' compose.yaml || fail 'compose.yaml is missing container_name: getouch-web'
grep -q "APP_DB_NAME:-${EXPECTED_APP_DB_NAME}" compose.yaml || fail "compose.yaml does not default APP_DB_NAME to ${EXPECTED_APP_DB_NAME}"
pass "compose.yaml matches expected web container and default app database"

if [[ -f .env ]]; then
  current_db_name="$(sed -n 's/^APP_DB_NAME=//p' .env | tail -1)"
  echo "env_app_db_name=${current_db_name}"
  [[ "$current_db_name" == "$EXPECTED_APP_DB_NAME" ]] || fail ".env APP_DB_NAME is ${current_db_name}, expected ${EXPECTED_APP_DB_NAME}"
  pass ".env APP_DB_NAME matches ${EXPECTED_APP_DB_NAME}"
else
  echo "WARN: .env not found, skipped live env database check"
fi

if command -v docker >/dev/null 2>&1; then
  caddy_id="$(docker ps -q -f name='^/caddy$')"
  web_id="$(docker ps -q -f name='^/getouch-web$')"
  pg_id="$(docker ps -q -f name='^/getouch-postgres$')"

  [[ -n "$caddy_id" ]] || fail 'caddy container is not running'
  [[ -n "$web_id" ]] || fail 'getouch-web container is not running'

  echo "caddy_created=$(docker inspect -f '{{.Created}}' caddy)"
  echo "web_created=$(docker inspect -f '{{.Created}}' getouch-web)"
  echo "web_image=$(docker inspect -f '{{.Config.Image}}' getouch-web)"
  echo "web_networks=$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{printf "%s " $name}}{{end}}' getouch-web)"

  docker exec caddy getent hosts "$EXPECTED_UPSTREAM" >/tmp/getouch-live-upstream.txt || fail "caddy cannot resolve ${EXPECTED_UPSTREAM}"
  echo "resolved_${EXPECTED_UPSTREAM}=$(tr -s ' ' < /tmp/getouch-live-upstream.txt | tr '\n' ';')"
  pass "caddy resolves ${EXPECTED_UPSTREAM}"

  running_caddyfile="$(docker exec caddy sh -lc 'cat /etc/caddy/Caddyfile')"
  grep -q "reverse_proxy ${EXPECTED_UPSTREAM}:3000" <<<"$running_caddyfile" || fail "running caddy config does not reference ${EXPECTED_UPSTREAM}:3000"
  pass "running caddy config references ${EXPECTED_UPSTREAM}:3000"

  if [[ -n "$pg_id" && -f .env ]]; then
    app_db_password="$(sed -n 's/^APP_DB_PASSWORD=//p' .env | tail -1)"
    db_table_check="$(docker exec -e PGPASSWORD="$app_db_password" getouch-postgres psql -U getouch -d "$EXPECTED_APP_DB_NAME" -Atqc "select to_regclass('public.users') is not null;")"
    [[ "$db_table_check" == "t" ]] || fail "public.users is missing in database ${EXPECTED_APP_DB_NAME}"
    pass "database ${EXPECTED_APP_DB_NAME} contains public.users"
  fi
fi