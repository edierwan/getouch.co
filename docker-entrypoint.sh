#!/bin/sh
set -e

# Ensure ~/.ssh exists with correct ownership/permissions for nextjs user.
mkdir -p /home/nextjs/.ssh
chown nextjs:nodejs /home/nextjs/.ssh
chmod 700 /home/nextjs/.ssh

# Source 1: bind-mounted SSH key files (preferred for docker-compose deploys)
if [ -f /tmp/ssh-keys/id_ed25519 ]; then
  cp /tmp/ssh-keys/id_ed25519 /home/nextjs/.ssh/id_ed25519
  chown nextjs:nodejs /home/nextjs/.ssh/id_ed25519
  chmod 600 /home/nextjs/.ssh/id_ed25519
fi
if [ -f /tmp/ssh-keys/known_hosts ]; then
  cp /tmp/ssh-keys/known_hosts /home/nextjs/.ssh/known_hosts
  chown nextjs:nodejs /home/nextjs/.ssh/known_hosts
  chmod 644 /home/nextjs/.ssh/known_hosts
fi

# Source 2: env-var-based SSH material (preferred for Coolify deploys where
# host bind mounts are not configured). Only writes if no file already exists
# from the bind-mount path above. Both vars expect base64-encoded contents
# so multi-line files survive container env transport.
if [ ! -f /home/nextjs/.ssh/id_ed25519 ] && [ -n "${SSH_PRIVATE_KEY_B64:-}" ]; then
  echo "$SSH_PRIVATE_KEY_B64" | base64 -d > /home/nextjs/.ssh/id_ed25519
  chown nextjs:nodejs /home/nextjs/.ssh/id_ed25519
  chmod 600 /home/nextjs/.ssh/id_ed25519
fi
if [ ! -f /home/nextjs/.ssh/known_hosts ] && [ -n "${SSH_KNOWN_HOSTS_B64:-}" ]; then
  echo "$SSH_KNOWN_HOSTS_B64" | base64 -d > /home/nextjs/.ssh/known_hosts
  chown nextjs:nodejs /home/nextjs/.ssh/known_hosts
  chmod 644 /home/nextjs/.ssh/known_hosts
fi

exec su-exec nextjs node server.js
