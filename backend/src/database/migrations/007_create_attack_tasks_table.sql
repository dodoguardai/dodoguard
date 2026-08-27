-- Create attack_tasks table for MySQL
CREATE TABLE IF NOT EXISTS attack_tasks (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  team_id VARCHAR(36),
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  target_type VARCHAR(50),
  target_config JSON,
  vulnerabilities JSON,
  attack_mode VARCHAR(20),
  composite_attack_config JSON,
  detection_config JSON,
  agent_config JSON,
  status VARCHAR(20),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  INDEX attack_tasks_organization_id_idx (organization_id),
  INDEX attack_tasks_status_idx (status),
  INDEX attack_tasks_org_status_created_idx (organization_id, status, created_at),
  INDEX attack_tasks_user_id_idx (user_id),
  INDEX attack_tasks_created_at_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
