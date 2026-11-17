#!/usr/bin/env bash
# GETOUCH-UAT-001 — live regression checks for both GetTouch-hosted Supabase stacks.
# Run ON the GetTouch host as a docker-group user:
#   ssh deploy@<host> 'bash -s' < scripts/verify-supabase-stacks.sh
# Read-only. Keys are read from each stack's own Studio container and are never printed.
# Exit code = number of FAILed checks. BLOCKED checks do not fail the run.
set -uo pipefail

FAILS=0; BLOCKED=0
pass()    { printf '  PASS     %s\n' "$1"; }
fail()    { printf '  FAIL     %s\n' "$1"; FAILS=$((FAILS+1)); }
blocked() { printf '  BLOCKED  %s\n' "$1"; BLOCKED=$((BLOCKED+1)); }
code()    { curl -s -o /dev/null -m 10 -w '%{http_code}' "$@" 2>/dev/null || echo 000; }

check_stack() {
  local name="$1" prefix="$2" api="$3" studio_host="$4"
  echo "== $name  (containers $prefix-*, API $api, Studio $studio_host)"
  local key
  key=$(docker inspect "$prefix-studio" -f '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sed -n 's/^SUPABASE_ANON_KEY=//p' | head -1)

  c=$(code "$api/");                    [ "$c" = 404 ] && pass "Kong gateway reachable (root 404 'no Route matched')" || fail "Kong gateway root -> $c"
  c=$(code "$api/rest/v1/");            [ "$c" = 401 ] && pass "Missing API key rejected (401)" || fail "Missing API key -> $c"
  c=$(code -H 'apikey: invalid' "$api/rest/v1/"); [ "$c" = 401 ] && pass "Invalid API key rejected (401)" || fail "Invalid API key -> $c"
  if [ -n "$key" ]; then
    c=$(code -H "apikey: $key" -H "Authorization: Bearer $key" "$api/rest/v1/"); [ "$c" = 200 ] && pass "Authorized key accepted by PostgREST (200)" || fail "Authorized key PostgREST -> $c"
    c=$(code -H "apikey: $key" "$api/auth/v1/health"); [ "$c" = 200 ] && pass "GoTrue health with authorized key (200)" || fail "GoTrue health -> $c"
  else
    fail "Anon key not found in $prefix-studio"
  fi
  docker exec "$prefix-db" pg_isready -h 127.0.0.1 -q && pass "Database accepting connections" || fail "Database not ready"
  h=$(docker inspect "$prefix-studio" -f '{{.State.Health.Status}}' 2>/dev/null); [ "$h" = healthy ] && pass "Studio container healthy" || fail "Studio container: ${h:-missing}"

  # --- Studio exposure (security negatives) ---
  local pub loc
  pub=$(curl -s -o /dev/null -m 10 -w '%{http_code} %{redirect_url}' "https://$studio_host/" 2>/dev/null || echo "000 ")
  c=${pub%% *}; loc=${pub#* }
  case "$c" in
    000) blocked "Studio hostname $studio_host not published (no DNS / no Access app) — portal must show 'Studio access not configured'";;
    302|303)
      if [[ "$loc" == https://getouch.cloudflareaccess.com/cdn-cgi/access/login/$studio_host* ]]; then
        pass "Unauthenticated Studio request -> Cloudflare Access login for $studio_host"
        blocked "Authorized Studio login (needs an allowed user to complete Access login — owner UAT)"
      else fail "Studio redirect is not a Cloudflare Access login for $studio_host: $loc"; fi;;
    2??) fail "Studio $studio_host served content WITHOUT Cloudflare Access ($c)";;
    *)   blocked "Studio $studio_host answered $c (route/Access not configured)";;
  esac
  # LAN / origin bypass: the origin must never serve Studio to a non-tunnel client by Host header.
  lan_ip=$(hostname -I | awk '{print $1}')
  c=$(code -H "Host: $studio_host" "http://$lan_ip/")
  [[ "$c" =~ ^2 ]] && fail "Origin serves $studio_host to a LAN client without Access ($c)" || pass "Origin does not serve Studio to LAN clients ($c)"
  # Kong must not proxy the Studio UI.
  c=$(code "$api/project/default"); [[ "$c" =~ ^2 ]] && fail "Kong exposes Studio UI ($c)" || pass "Kong does not expose Studio UI ($c)"
}

check_stack "GetTouch SSO"    getouch-sso     https://sb-sso.getouch.co        studio-sso.getouch.co
check_stack "Serapod Preprod" serapod-preprod https://sb-stg-serapod.getouch.co studio-preprod.getouch.co

echo "== summary: FAIL=$FAILS BLOCKED=$BLOCKED"
exit "$FAILS"
