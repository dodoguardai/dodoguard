-- Create integration_configs table for MySQL
CREATE TABLE IF NOT EXISTS integration_configs (
  id VARCHAR(36) PRIMARY KEY,
  type VARCHAR(50) NOT NULL COMMENT 'llm, vector_db, payment, sso, webhook, email, sms',
  name VARCHAR(255) NOT NULL,
  provider VARCHAR(100),
  config JSON,
  enabled BOOLEAN DEFAULT false,
  test_status VARCHAR(20) COMMENT 'success, failed, pending',
  last_tested TIMESTAMP NULL,
  updated_by VARCHAR(36),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,

  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX integration_configs_type_idx (type),
  INDEX integration_configs_enabled_idx (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

