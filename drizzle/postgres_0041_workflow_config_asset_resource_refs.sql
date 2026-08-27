-- Resource fingerprints per workflow asset for cross-asset / cross-agent correlation.

CREATE TABLE IF NOT EXISTS workflow_config_asset_resource_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES workflow_config_assets(id) ON DELETE CASCADE,
  target_agent_id VARCHAR(36) NOT NULL DEFAULT '',
  node_type VARCHAR(128) NOT NULL,
  resource_fingerprint VARCHAR(64) NOT NULL,
  resource_label VARCHAR(512) NOT NULL,
  node_ids JSONB NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS wf_asset_res_ref_asset_type_fp_uidx
  ON workflow_config_asset_resource_refs (asset_id, node_type, resource_fingerprint);

CREATE INDEX IF NOT EXISTS wf_asset_res_ref_org_fp_idx
  ON workflow_config_asset_resource_refs (organization_id, resource_fingerprint);

CREATE INDEX IF NOT EXISTS wf_asset_res_ref_asset_idx
  ON workflow_config_asset_resource_refs (asset_id);
