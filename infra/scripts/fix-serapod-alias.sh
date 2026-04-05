#!/bin/bash
# Ensures the serapod staging container always has the stable
# "serapod-web-stg" alias on the coolify Docker network.
# Run via cron every minute.

APP_PREFIX="m85fvkzz5lgmq36kdvzc2jvh"
ALIAS="serapod-web-stg"
NETWORK="coolify"

CONTAINER=$(docker ps --filter "name=${APP_PREFIX}" --format "{{.Names}}" | head -1)
[ -z "$CONTAINER" ] && exit 0

# Check if this container already has the alias
CURRENT=$(docker inspect "$CONTAINER" --format "{{json .NetworkSettings.Networks}}" 2>/dev/null)
if echo "$CURRENT" | grep -q "\"$ALIAS\""; then
  exit 0
fi

# Remove alias from any old container that might still have it
for OLD in $(docker ps -a --filter "name=${APP_PREFIX}" --format "{{.Names}}"); do
  [ "$OLD" = "$CONTAINER" ] && continue
  docker network disconnect "$NETWORK" "$OLD" 2>/dev/null
done

# Disconnect and reconnect with alias
docker network disconnect "$NETWORK" "$CONTAINER" 2>/dev/null
docker network connect --alias "$ALIAS" "$NETWORK" "$CONTAINER" 2>/dev/null

logger "fix-serapod-alias: assigned $ALIAS to $CONTAINER"
