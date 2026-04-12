-- Set passwords for service roles using the POSTGRES_PASSWORD env var.
-- This file is mounted as a late-running migration (99-) so it runs
-- AFTER all roles have been created by the image's built-in init scripts.

\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
