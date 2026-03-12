#!/usr/bin/env bash
set -euo pipefail

coolify_root="/data/coolify"
coolify_source="${coolify_root}/source"
coolify_env="${coolify_source}/.env"
coolify_credentials="/data/getouch/secrets/coolify-initial-credentials.txt"
admin_email="${GETOUCH_ADMIN_EMAIL:-admin@getouch.co}"
admin_password="${GETOUCH_ADMIN_PASSWORD:-Turun@2020}"

mkdir -p \
  "${coolify_root}/source" \
  "${coolify_root}/ssh/keys" \
  "${coolify_root}/ssh/mux" \
  "${coolify_root}/applications" \
  "${coolify_root}/databases" \
  "${coolify_root}/backups" \
  "${coolify_root}/services" \
  "${coolify_root}/proxy/dynamic" \
  "${coolify_root}/webhooks-during-maintenance" \
  "/data/getouch/secrets"

docker network inspect coolify >/dev/null 2>&1 || docker network create coolify >/dev/null

curl -fsSL https://cdn.coollabs.io/coolify/docker-compose.yml -o "${coolify_source}/docker-compose.yml"
curl -fsSL https://cdn.coollabs.io/coolify/docker-compose.prod.yml -o "${coolify_source}/docker-compose.prod.yml"
curl -fsSL https://cdn.coollabs.io/coolify/.env.production -o "${coolify_env}"
curl -fsSL https://cdn.coollabs.io/coolify/upgrade.sh -o "${coolify_source}/upgrade.sh"
chmod +x "${coolify_source}/upgrade.sh"

# Keep Coolify reachable through Caddy while avoiding direct public host exposure.
sed -i 's|"${APP_PORT:-8000}:8080"|"127.0.0.1:${APP_PORT:-8000}:8080"|g' "${coolify_source}/docker-compose.prod.yml"
sed -i 's|"${SOKETI_PORT:-6001}:6001"|"127.0.0.1:${SOKETI_PORT:-6001}:6001"|g' "${coolify_source}/docker-compose.prod.yml"
sed -i 's|"6002:6002"|"127.0.0.1:6002:6002"|g' "${coolify_source}/docker-compose.prod.yml"

if [[ ! -f "${coolify_root}/ssh/keys/id.root@host.docker.internal" ]]; then
  ssh-keygen -f "${coolify_root}/ssh/keys/id.root@host.docker.internal" -t ed25519 -N '' -C root@coolify >/dev/null
fi

mkdir -p /root/.ssh
touch /root/.ssh/authorized_keys
grep -q "root@coolify" /root/.ssh/authorized_keys || cat "${coolify_root}/ssh/keys/id.root@host.docker.internal.pub" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

sed -i "s|APP_ID=.*|APP_ID=$(openssl rand -hex 16)|g" "${coolify_env}"
sed -i "s|APP_KEY=.*|APP_KEY=base64:$(openssl rand -base64 32)|g" "${coolify_env}"
sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -base64 32)|g" "${coolify_env}"
sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -base64 32)|g" "${coolify_env}"
sed -i "s|PUSHER_APP_ID=.*|PUSHER_APP_ID=$(openssl rand -hex 32)|g" "${coolify_env}"
sed -i "s|PUSHER_APP_KEY=.*|PUSHER_APP_KEY=$(openssl rand -hex 32)|g" "${coolify_env}"
sed -i "s|PUSHER_APP_SECRET=.*|PUSHER_APP_SECRET=$(openssl rand -hex 32)|g" "${coolify_env}"
sed -i "s|ROOT_USERNAME=.*|ROOT_USERNAME=AdminGetouch|g" "${coolify_env}"
sed -i "s|ROOT_USER_EMAIL=.*|ROOT_USER_EMAIL=${admin_email}|g" "${coolify_env}"
sed -i "s|ROOT_USER_PASSWORD=.*|ROOT_USER_PASSWORD=${admin_password}|g" "${coolify_env}"
sed -i "s|REGISTRY_URL=.*|REGISTRY_URL=docker.io|g" "${coolify_env}"
if grep -q '^APP_PORT=' "${coolify_env}"; then
  sed -i 's|^APP_PORT=.*|APP_PORT=8000|g' "${coolify_env}"
else
  printf 'APP_PORT=8000\n' >> "${coolify_env}"
fi
if grep -q '^SOKETI_PORT=' "${coolify_env}"; then
  sed -i 's|^SOKETI_PORT=.*|SOKETI_PORT=6001|g' "${coolify_env}"
else
  printf 'SOKETI_PORT=6001\n' >> "${coolify_env}"
fi

docker pull coollabsio/coolify:latest >/dev/null
docker pull coollabsio/coolify-realtime:1.0.11 >/dev/null

chown -R 9999:root "${coolify_root}"
chmod -R 700 "${coolify_root}"

cat >"${coolify_credentials}" <<EOF
Coolify initial credentials
===========================
Email: ${admin_email}
Password: ${admin_password}
EOF

chmod 600 "${coolify_credentials}"

docker compose \
  --env-file "${coolify_env}" \
  -f "${coolify_source}/docker-compose.yml" \
  -f "${coolify_source}/docker-compose.prod.yml" \
  up -d --pull always --remove-orphans --force-recreate

# Wait for Coolify to finish initial migration before modifying DB.
echo "Waiting for Coolify to become healthy..."
for i in $(seq 1 30); do
  if docker inspect coolify --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; then
    break
  fi
  sleep 5
done

# Disable Coolify's built-in Traefik proxy — Caddy handles reverse proxying.
docker exec coolify php artisan tinker --execute="\$s = App\Models\Server::find(0); \$s->proxy->set('type','NONE'); \$s->proxy->set('status','disabled'); \$s->save();" 2>/dev/null || true

echo "Coolify install complete"