#!/bin/sh
set -e

# Copy mounted SSH keys with correct ownership for nextjs user
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

exec su-exec nextjs node server.js
