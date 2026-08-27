-- Scope workflow_config_assets to a target agent (upload / task context). Empty string = org-wide library.
-- Replaces unique (org, source_type, content_hash) with (org, source_type, content_hash, target_agent_id).

ALTER TABLE `workflow_config_assets`
  ADD COLUMN `target_agent_id` VARCHAR(36) NOT NULL DEFAULT '' COMMENT 'Empty = org-wide; UUID = belongs to that target agent'
  AFTER `created_by_user_id`;

ALTER TABLE `workflow_config_assets` DROP INDEX `workflow_config_assets_org_source_hash_uidx`;

ALTER TABLE `workflow_config_assets`
  ADD UNIQUE KEY `workflow_config_assets_org_src_hash_agent_uidx` (`organization_id`, `source_type`, `content_hash`, `target_agent_id`);

CREATE INDEX `workflow_config_assets_org_agent_idx` ON `workflow_config_assets` (`organization_id`, `target_agent_id`);
