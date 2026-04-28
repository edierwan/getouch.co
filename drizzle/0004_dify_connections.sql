CREATE TYPE dify_setup_status AS ENUM ('active', 'inactive', 'draft');

CREATE TABLE dify_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(160) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  environment VARCHAR(40) NOT NULL,
  assistant_name VARCHAR(160) NOT NULL,
  dify_app_id VARCHAR(120),
  dify_app_type VARCHAR(40) NOT NULL DEFAULT 'chatbot',
  base_url TEXT NOT NULL,
  console_url TEXT,
  api_key TEXT,
  api_key_label VARCHAR(120),
  trigger_name VARCHAR(80),
  routing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status dify_setup_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_test_ok BOOLEAN,
  last_test_status INTEGER,
  last_test_message TEXT,
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dify_connections_domain_environment_idx
  ON dify_connections (domain, environment);

CREATE INDEX dify_connections_status_idx
  ON dify_connections (status);