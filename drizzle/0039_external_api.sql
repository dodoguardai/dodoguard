CREATE TABLE IF NOT EXISTS `external_api_keys` (
  `id` VARCHAR(36) NOT NULL,
  `organization_id` VARCHAR(36) NOT NULL,
  `created_by_user_id` VARCHAR(36) NULL,
  `name` VARCHAR(255) NOT NULL,
  `secret_hash` VARCHAR(255) NOT NULL,
  `scopes` JSON NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `expires_at` TIMESTAMP NULL DEFAULT NULL,
  `last_used_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `external_api_keys_org_idx` (`organization_id`),
  KEY `external_api_keys_org_status_idx` (`organization_id`, `status`),
  CONSTRAINT `external_api_keys_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `external_api_keys_user_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `external_idempotency` (
  `id` VARCHAR(36) NOT NULL,
  `organization_id` VARCHAR(36) NOT NULL,
  `idempotency_key_hash` VARCHAR(64) NOT NULL,
  `request_path` VARCHAR(255) NOT NULL,
  `response_status` VARCHAR(3) NOT NULL,
  `response_body` LONGTEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `external_idempotency_org_key_uidx` (`organization_id`, `idempotency_key_hash`),
  KEY `external_idempotency_org_idx` (`organization_id`),
  CONSTRAINT `external_idempotency_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
