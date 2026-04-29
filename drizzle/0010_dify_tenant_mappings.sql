CREATE TYPE dify_tenant_mapping_status AS ENUM ('pending', 'active', 'disabled');

CREATE TABLE dify_tenant_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  dify_workspace_id VARCHAR(120),
  dify_app_id VARCHAR(120),
  dify_workflow_id VARCHAR(120),
  status dify_tenant_mapping_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dify_tenant_mappings_status_idx
  ON dify_tenant_mappings (status);