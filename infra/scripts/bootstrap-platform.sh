#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CLOUDFLARED_TOKEN:-}" ]]; then
  echo "CLOUDFLARED_TOKEN is required" >&2
  exit 1
fi

platform_root="/data/getouch"
platform_env="${platform_root}/platform.env"
credentials_file="${platform_root}/secrets/initial-credentials.txt"
admin_email="${GETOUCH_ADMIN_EMAIL:-admin@getouch.co}"
admin_password="${GETOUCH_ADMIN_PASSWORD:-Turun@2020}"

mkdir -p \
  "${platform_root}/caddy/data" \
  "${platform_root}/caddy/config" \
  "${platform_root}/postgres" \
  "${platform_root}/pgadmin" \
  "${platform_root}/secrets"

# ── System hardening ──
apt-get install -y -qq fail2ban >/dev/null 2>&1
systemctl enable --now fail2ban

# Allow Docker bridge subnets to SSH to host (required by Coolify).
# Insert before the global LIMIT rule so Docker traffic is not rate-limited.
if ! ufw status numbered | grep -q 'Docker.*SSH'; then
  ufw insert 1 allow from 172.30.0.0/16 to any port 22 proto tcp comment 'Docker coolify network SSH'
  ufw insert 2 allow from 172.17.0.0/16 to any port 22 proto tcp comment 'Docker bridge SSH for Coolify'
fi

docker network inspect coolify >/dev/null 2>&1 || docker network create coolify >/dev/null

if [[ ! -f "${platform_env}" ]]; then
  docker image inspect caddy:2-alpine >/dev/null 2>&1 || docker pull caddy:2-alpine >/dev/null

  admin_hash="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "${admin_password}")"
  app_db_password="$(openssl rand -hex 16)"

  cat >"${platform_env}" <<EOF
CLOUDFLARED_TOKEN=${CLOUDFLARED_TOKEN}
ADMIN_AUTH_USER=${admin_email}
ADMIN_AUTH_HASH=${admin_hash}
APP_DB_NAME=getouch
APP_DB_USER=getouch
APP_DB_PASSWORD=${app_db_password}
PGADMIN_DEFAULT_EMAIL=${admin_email}
PGADMIN_DEFAULT_PASSWORD=${admin_password}
WA_PORT=3001
EOF

  chmod 600 "${platform_env}"

  cat >"${credentials_file}" <<EOF
Getouch platform initial credentials
===================================
Caddy admin username: ${admin_email}
Caddy admin password: ${admin_password}
pgAdmin email: ${admin_email}
pgAdmin password: ${admin_password}
PostgreSQL database: getouch
PostgreSQL user: getouch
PostgreSQL password: ${app_db_password}
EOF

  chmod 600 "${credentials_file}"
fi

echo "Platform bootstrap complete"