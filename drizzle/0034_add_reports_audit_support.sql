-- Add support for Dify Config Audit reports (no attack task)
-- report_type: 'attack_task' | 'dify_config_audit'
-- task_id: nullable for dify_config_audit
-- title: display name for audit reports

-- MySQL
ALTER TABLE `reports` ADD COLUMN `report_type` VARCHAR(30) NOT NULL DEFAULT 'attack_task';
ALTER TABLE `reports` ADD COLUMN `title` VARCHAR(255) NULL;
ALTER TABLE `reports` MODIFY COLUMN `task_id` VARCHAR(36) NULL;
