-- Charset/collation must match referenced columns on `organizations.id` / `users.id`.
-- Align with `attack_tasks` in migrate.ts (utf8mb4_unicode_ci) to avoid ER_FOREIGN_KEY_CANNOT_USE_PARENT_KEY (3780).
-- If CREATE still fails, run: SHOW CREATE TABLE `organizations`\G and match COLLATE on FK columns or DB default.

CREATE TABLE IF NOT EXISTS `workflow_config_assets` (
  `id` VARCHAR(36) NOT NULL,
  `organization_id` VARCHAR(36) NOT NULL,
  `created_by_user_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `source_type` VARCHAR(32) NOT NULL,
  `file_name` VARCHAR(512),
  `content_hash` VARCHAR(64) NOT NULL,
  `raw_format` VARCHAR(16) NOT NULL,
  `raw_content` MEDIUMTEXT NOT NULL,
  `parse_status` VARCHAR(20) NOT NULL,
  `parse_error` TEXT,
  `parse_summary` JSON,
  `graph_snapshot` JSON,
  `parser_version` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `workflow_config_assets_org_source_hash_uidx` (`organization_id`, `source_type`, `content_hash`),
  KEY `workflow_config_assets_org_idx` (`organization_id`),
  KEY `workflow_config_assets_org_created_idx` (`organization_id`, `created_at`),
  CONSTRAINT `workflow_config_assets_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `workflow_config_assets_user_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
