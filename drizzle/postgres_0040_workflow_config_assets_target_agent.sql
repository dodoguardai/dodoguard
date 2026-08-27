-- Scope workflow_config_assets to a target agent. '' = org-wide library.

ALTER TABLE workflow_config_assets
  ADD COLUMN IF NOT EXISTS target_agent_id VARCHAR(36) NOT NULL DEFAULT '';

ALTER TABLE workflow_config_assets DROP CONSTRAINT IF EXISTS workflow_config_assets_org_source_hash_uidx;

ALTER TABLE workflow_config_assets
  ADD CONSTRAINT workflow_config_assets_org_src_hash_agent_uidx UNIQUE (organization_id, source_type, content_hash, target_agent_id);

CREATE INDEX IF NOT EXISTS workflow_config_assets_org_agent_idx ON workflow_config_assets (organization_id, target_agent_id);
