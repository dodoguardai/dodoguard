-- Add asset version and snapshot anchors to detection and remediation closed-loop tables.

ALTER TABLE `security_scan_tasks`
  ADD COLUMN `asset_version` varchar(64) DEFAULT NULL AFTER `asset_name`,
  ADD COLUMN `asset_snapshot_id` varchar(36) DEFAULT NULL AFTER `asset_version`,
  ADD COLUMN `component_versions` json DEFAULT NULL AFTER `asset_snapshot_id`,
  ADD KEY `security_scan_tasks_org_asset_version_idx` (`organization_id`, `asset_id`, `asset_version`),
  ADD CONSTRAINT `security_scan_tasks_snapshot_fk` FOREIGN KEY (`asset_snapshot_id`) REFERENCES `agent_asset_snapshots` (`id`) ON DELETE SET NULL;

ALTER TABLE `security_scan_findings`
  ADD COLUMN `asset_version` varchar(64) DEFAULT NULL AFTER `asset_id`,
  ADD COLUMN `asset_snapshot_id` varchar(36) DEFAULT NULL AFTER `asset_version`,
  ADD COLUMN `component_versions` json DEFAULT NULL AFTER `asset_snapshot_id`,
  ADD KEY `security_scan_findings_org_asset_version_idx` (`organization_id`, `asset_id`, `asset_version`),
  ADD CONSTRAINT `security_scan_findings_snapshot_fk` FOREIGN KEY (`asset_snapshot_id`) REFERENCES `agent_asset_snapshots` (`id`) ON DELETE SET NULL;

ALTER TABLE `security_remediation_tasks`
  ADD COLUMN `source_asset_version` varchar(64) DEFAULT NULL AFTER `asset_id`,
  ADD COLUMN `source_snapshot_id` varchar(36) DEFAULT NULL AFTER `source_asset_version`,
  ADD COLUMN `target_asset_version` varchar(64) DEFAULT NULL AFTER `source_snapshot_id`,
  ADD COLUMN `target_snapshot_id` varchar(36) DEFAULT NULL AFTER `target_asset_version`,
  ADD KEY `security_remediation_tasks_org_source_version_idx` (`organization_id`, `asset_id`, `source_asset_version`),
  ADD CONSTRAINT `security_remediation_tasks_source_snapshot_fk` FOREIGN KEY (`source_snapshot_id`) REFERENCES `agent_asset_snapshots` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `security_remediation_tasks_target_snapshot_fk` FOREIGN KEY (`target_snapshot_id`) REFERENCES `agent_asset_snapshots` (`id`) ON DELETE SET NULL;

ALTER TABLE `security_retest_records`
  ADD COLUMN `retest_asset_version` varchar(64) DEFAULT NULL AFTER `retest_task_id`,
  ADD COLUMN `retest_snapshot_id` varchar(36) DEFAULT NULL AFTER `retest_asset_version`,
  ADD KEY `security_retest_records_org_version_idx` (`organization_id`, `retest_asset_version`),
  ADD CONSTRAINT `security_retest_records_snapshot_fk` FOREIGN KEY (`retest_snapshot_id`) REFERENCES `agent_asset_snapshots` (`id`) ON DELETE SET NULL;

UPDATE `security_scan_tasks` task
LEFT JOIN `agent_assets` asset ON asset.`id` = task.`asset_id`
SET task.`asset_version` = COALESCE(task.`asset_version`, asset.`version`)
WHERE task.`asset_id` IS NOT NULL;

UPDATE `security_scan_findings` finding
LEFT JOIN `security_scan_tasks` task ON task.`id` = finding.`task_id`
SET
  finding.`asset_version` = COALESCE(finding.`asset_version`, task.`asset_version`),
  finding.`asset_snapshot_id` = COALESCE(finding.`asset_snapshot_id`, task.`asset_snapshot_id`),
  finding.`component_versions` = COALESCE(finding.`component_versions`, task.`component_versions`)
WHERE finding.`task_id` IS NOT NULL;

UPDATE `security_remediation_tasks` remediation
LEFT JOIN `security_scan_findings` finding ON finding.`id` = remediation.`finding_id`
SET
  remediation.`source_asset_version` = COALESCE(remediation.`source_asset_version`, finding.`asset_version`),
  remediation.`source_snapshot_id` = COALESCE(remediation.`source_snapshot_id`, finding.`asset_snapshot_id`)
WHERE remediation.`finding_id` IS NOT NULL;
