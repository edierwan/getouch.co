-- Create the _supabase database used by Logflare analytics
SELECT 'CREATE DATABASE _supabase'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '_supabase')\gexec
