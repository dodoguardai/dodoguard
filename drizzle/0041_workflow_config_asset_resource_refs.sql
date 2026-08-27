-- Indexes resource fingerprints extracted from workflow graph nodes for cross-asset / cross-agent lookup.

CREATE TABLE IF NOT EXISTS `workflow_config_asset_resource_refs` (
  `id` VARCHAR(36) NOT NULL,
  `organization_id` VARCHAR(36) NOT NULL,
  `asset_id` VARCHAR(36) NOT NULL,
  `target_agent_id` VARCHAR(36) NOT NULL DEFAULT '',
  `node_type` VARCHAR(128) NOT NULL,
  `resource_fingerprint` VARCHAR(64) NOT NULL,
  `resource_label` VARCHAR(512) NOT NULL,
  `node_ids` JSON NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wf_asset_res_ref_asset_type_fp_uidx` (`asset_id`, `node_type`, `resource_fingerprint`),
  KEY `wf_asset_res_ref_org_fp_idx` (`organization_id`, `resource_fingerprint`),
  KEY `wf_asset_res_ref_asset_idx` (`asset_id`),
  CONSTRAINT `wf_asset_res_ref_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `wf_asset_res_ref_asset_fk` FOREIGN KEY (`asset_id`) REFERENCES `workflow_config_assets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
