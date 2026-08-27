CREATE TABLE IF NOT EXISTS `capability_component_registry` (
  `id` varchar(36) NOT NULL,
  `organization_id` varchar(36) NOT NULL,
  `component_kind` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `component_key` varchar(255) DEFAULT NULL,
  `version` varchar(64) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `source` varchar(255) DEFAULT NULL,
  `permission_scope` json DEFAULT NULL,
  `checks` json DEFAULT NULL,
  `risk_level` varchar(32) NOT NULL DEFAULT 'medium',
  `risk_title` varchar(255) DEFAULT NULL,
  `enabled` boolean NOT NULL DEFAULT TRUE,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `has_package` boolean NOT NULL DEFAULT FALSE,
  `last_detected_at` timestamp NULL DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_by` varchar(36) DEFAULT NULL,
  `updated_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `cap_comp_reg_org_kind_idx` (`organization_id`, `component_kind`),
  KEY `cap_comp_reg_org_key_idx` (`organization_id`, `component_key`),
  KEY `cap_comp_reg_org_level_idx` (`organization_id`, `risk_level`),
  CONSTRAINT `cap_comp_reg_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cap_comp_reg_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `cap_comp_reg_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `capability_component_artifacts` (
  `id` varchar(36) NOT NULL,
  `organization_id` varchar(36) NOT NULL,
  `registry_id` varchar(36) NOT NULL,
  `file_name` varchar(512) NOT NULL,
  `content_hash` varchar(128) NOT NULL,
  `storage_path` varchar(1024) NOT NULL,
  `file_size` int NOT NULL DEFAULT 0,
  `file_tree_json` json DEFAULT NULL,
  `skill_md_excerpt` text DEFAULT NULL,
  `is_current` boolean NOT NULL DEFAULT TRUE,
  `metadata` json DEFAULT NULL,
  `created_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `cap_comp_art_org_reg_idx` (`organization_id`, `registry_id`),
  KEY `cap_comp_art_hash_idx` (`organization_id`, `content_hash`),
  CONSTRAINT `cap_comp_art_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cap_comp_art_registry_fk` FOREIGN KEY (`registry_id`) REFERENCES `capability_component_registry` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cap_comp_art_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `capability_risk_libraries`
  ADD COLUMN `registry_id` varchar(36) DEFAULT NULL AFTER `organization_id`;

ALTER TABLE `capability_risk_libraries`
  ADD KEY `capability_risk_libraries_registry_idx` (`organization_id`, `registry_id`);
