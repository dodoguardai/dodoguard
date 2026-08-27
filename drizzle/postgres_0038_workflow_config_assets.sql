-- PostgreSQL: run manually when using tables-enterprise (MySQL journal does not apply).

CREATE TABLE IF NOT EXISTS workflow_config_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  file_name VARCHAR(512),
  content_hash VARCHAR(64) NOT NULL,
  raw_format VARCHAR(16) NOT NULL,
  raw_content TEXT NOT NULL,
  parse_status VARCHAR(20) NOT NULL,
  parse_error TEXT,
  parse_summary JSONB,
  graph_snapshot JSONB,
  parser_version VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_config_assets_org_source_hash_uidx UNIQUE (organization_id, source_type, content_hash)
);

CREATE INDEX IF NOT EXISTS workflow_config_assets_org_idx ON workflow_config_assets (organization_id);
CREATE INDEX IF NOT EXISTS workflow_config_assets_org_created_idx ON workflow_config_assets (organization_id, created_at);
