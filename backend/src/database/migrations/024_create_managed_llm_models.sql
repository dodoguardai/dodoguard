-- Managed LLM model registry (per organization)
CREATE TABLE IF NOT EXISTS managed_llm_models (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  model_key VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  health_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
  quota_monthly INT NOT NULL DEFAULT 100000,
  quota_used INT NOT NULL DEFAULT 0,
  provider_config JSON,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,

  INDEX managed_llm_models_org_idx (organization_id),
  INDEX managed_llm_models_org_status_idx (organization_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
