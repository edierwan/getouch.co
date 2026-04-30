CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  transport text NOT NULL DEFAULT 'streamable_http',
  endpoint_path text NOT NULL DEFAULT '/mcp',
  origin_type text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'enabled',
  health_status text NOT NULL DEFAULT 'unknown',
  description text,
  runtime_target text,
  auth_mode text NOT NULL DEFAULT 'bearer',
  tenant_mode text NOT NULL DEFAULT 'shared',
  last_heartbeat_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  safe_default boolean NOT NULL DEFAULT true,
  availability text NOT NULL DEFAULT 'registered',
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, name)
);

CREATE TABLE IF NOT EXISTS mcp_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_type text NOT NULL DEFAULT 'external',
  tenant_id text,
  api_key_id uuid,
  key_prefix text,
  status text NOT NULL DEFAULT 'active',
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_access_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL UNIQUE,
  client_id uuid REFERENCES mcp_clients(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  key_prefix text NOT NULL,
  tenant_id text,
  status text NOT NULL DEFAULT 'active',
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  services jsonb NOT NULL DEFAULT '["mcp"]'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz,
  last_used_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  event_type text NOT NULL,
  summary text NOT NULL,
  client_id uuid,
  api_key_id uuid,
  key_prefix text,
  tenant_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid REFERENCES mcp_servers(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  client_id uuid,
  api_key_id uuid,
  key_prefix text,
  tenant_id text,
  status text NOT NULL,
  error_code text,
  latency_ms integer,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_preview text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_tenant_mappings (
  tenant_id text PRIMARY KEY,
  display_name text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_settings (
  setting_key text PRIMARY KEY,
  setting_value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_health ON mcp_servers (health_status, status);
CREATE INDEX IF NOT EXISTS idx_mcp_tools_server_enabled ON mcp_tools (server_id, enabled);
CREATE INDEX IF NOT EXISTS idx_mcp_clients_tenant ON mcp_clients (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mcp_access_keys_prefix ON mcp_access_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_mcp_access_keys_tenant ON mcp_access_keys (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mcp_activity_logs_created ON mcp_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_created ON mcp_tool_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_tenant_created ON mcp_tool_calls (tenant_id, created_at DESC);

INSERT INTO mcp_tenant_mappings (tenant_id, display_name, status, metadata, created_at, updated_at)
VALUES ('platform', 'Getouch Platform', 'active', '{}'::jsonb, now(), now())
ON CONFLICT (tenant_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO mcp_settings (setting_key, setting_value, updated_at)
VALUES
  ('public_base_url', '"https://mcp.getouch.co"'::jsonb, now()),
  ('endpoint_path', '"/mcp"'::jsonb, now()),
  ('transport', '"streamable_http"'::jsonb, now()),
  ('auth_mode', '"bearer"'::jsonb, now()),
  ('default_scopes', '["mcp:connect","mcp:tools:list","mcp:tools:call","mcp:resources:read"]'::jsonb, now()),
  ('status_page_enabled', 'true'::jsonb, now())
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    updated_at = now();

INSERT INTO mcp_servers (
  slug,
  display_name,
  transport,
  endpoint_path,
  origin_type,
  status,
  health_status,
  description,
  runtime_target,
  auth_mode,
  tenant_mode,
  metadata,
  last_heartbeat_at,
  created_at,
  updated_at
)
VALUES
  (
    'getouch-core',
    'Getouch Core Runtime',
    'streamable_http',
    '/mcp',
    'internal',
    'enabled',
    'healthy',
    'Integrated Getouch MCP runtime served by the web application.',
    'getouch-web:/api/mcp',
    'bearer',
    'shared',
    '{"category":"core","safe":true}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    'filesystem',
    'Filesystem Scaffold',
    'streamable_http',
    '/mcp',
    'scaffold',
    'disabled',
    'disabled',
    'Disabled scaffold reserved for a future constrained filesystem adapter.',
    null,
    'bearer',
    'tenant_isolated',
    '{"category":"scaffold","requiresReview":true}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    'postgres',
    'Postgres Scaffold',
    'streamable_http',
    '/mcp',
    'scaffold',
    'disabled',
    'disabled',
    'Disabled scaffold reserved for a future read-only Postgres adapter.',
    null,
    'bearer',
    'tenant_isolated',
    '{"category":"scaffold","requiresReview":true}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    'git',
    'Git Scaffold',
    'streamable_http',
    '/mcp',
    'scaffold',
    'disabled',
    'disabled',
    'Disabled scaffold reserved for a future repository-inspection adapter.',
    null,
    'bearer',
    'tenant_isolated',
    '{"category":"scaffold","requiresReview":true}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    'browser',
    'Browser Scaffold',
    'streamable_http',
    '/mcp',
    'scaffold',
    'disabled',
    'disabled',
    'Disabled scaffold reserved for a future approved browser automation adapter.',
    null,
    'bearer',
    'tenant_isolated',
    '{"category":"scaffold","requiresReview":true}'::jsonb,
    null,
    now(),
    now()
  )
ON CONFLICT (slug) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    runtime_target = EXCLUDED.runtime_target,
    auth_mode = EXCLUDED.auth_mode,
    tenant_mode = EXCLUDED.tenant_mode,
    metadata = EXCLUDED.metadata,
    updated_at = now();

INSERT INTO mcp_tools (
  server_id,
  name,
  display_name,
  description,
  enabled,
  safe_default,
  availability,
  input_schema,
  metadata,
  created_at,
  updated_at
)
VALUES
  (
    (SELECT id FROM mcp_servers WHERE slug = 'getouch-core'),
    'get_status',
    'Get Status',
    'Return current MCP endpoint health, auth mode, and tool availability.',
    true,
    true,
    'enabled',
    '{"type":"object","properties":{"verbose":{"type":"boolean"}},"additionalProperties":false}'::jsonb,
    '{"readOnly":true}'::jsonb,
    now(),
    now()
  ),
  (
    (SELECT id FROM mcp_servers WHERE slug = 'getouch-core'),
    'list_available_services',
    'List Available Services',
    'List the managed Getouch service endpoints exposed for MCP discovery.',
    true,
    true,
    'enabled',
    '{"type":"object","properties":{"kind":{"type":"string","enum":["all","ai","messaging","operations"]}},"additionalProperties":false}'::jsonb,
    '{"readOnly":true}'::jsonb,
    now(),
    now()
  ),
  (
    (SELECT id FROM mcp_servers WHERE slug = 'getouch-core'),
    'get_service_endpoint_info',
    'Get Service Endpoint Info',
    'Return details for a managed Getouch service endpoint by identifier.',
    true,
    true,
    'enabled',
    '{"type":"object","properties":{"serviceId":{"type":"string"}},"required":["serviceId"],"additionalProperties":false}'::jsonb,
    '{"readOnly":true}'::jsonb,
    now(),
    now()
  ),
  (
    (SELECT id FROM mcp_servers WHERE slug = 'getouch-core'),
    'get_tenant_context',
    'Get Tenant Context',
    'Return MCP tenant metadata, key counts, and recent usage for a tenant.',
    true,
    true,
    'enabled',
    '{"type":"object","properties":{"tenantId":{"type":"string"}},"additionalProperties":false}'::jsonb,
    '{"readOnly":true}'::jsonb,
    now(),
    now()
  )
ON CONFLICT (server_id, name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    enabled = EXCLUDED.enabled,
    safe_default = EXCLUDED.safe_default,
    availability = EXCLUDED.availability,
    input_schema = EXCLUDED.input_schema,
    metadata = EXCLUDED.metadata,
    updated_at = now();