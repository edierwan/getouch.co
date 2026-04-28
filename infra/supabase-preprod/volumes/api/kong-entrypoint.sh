#!/bin/bash
set -e
cd /home/kong
sed \
  -e "s|\${SUPABASE_ANON_KEY}|${SUPABASE_ANON_KEY}|g" \
  -e "s|\${SUPABASE_SERVICE_KEY}|${SUPABASE_SERVICE_KEY}|g" \
  temp.yml > kong.yml
exec /docker-entrypoint.sh kong docker-start
