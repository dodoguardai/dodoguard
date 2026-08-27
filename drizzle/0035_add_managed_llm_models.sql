-- Managed LLM model registry (per organization). Provider config JSON aligns with DodoGuard ProviderOptions subset.
-- MySQL

CREATE TABLE `managed_llm_models` (
  `id` VARCHAR(36) NOT NULL,
  `organization_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `model_key` VARCHAR(512) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `health_status` VARCHAR(20) NOT NULL DEFAULT 'unknown',
  `quota_monthly` INT NOT NULL DEFAULT 100000,
  `quota_used` INT NOT NULL DEFAULT 0,
  `provider_config` JSON NULL,
  `metadata` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `managed_llm_models_id` PRIMARY KEY (`id`),
  CONSTRAINT `managed_llm_models_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
);

CREATE INDEX `managed_llm_models_organization_id_idx` ON `managed_llm_models` (`organization_id`);
