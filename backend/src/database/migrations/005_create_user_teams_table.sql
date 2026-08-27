-- Migration: Create user_teams table for MySQL
-- This migration creates the user_teams junction table to link users and teams

CREATE TABLE IF NOT EXISTS user_teams (
  user_id VARCHAR(36) NOT NULL,
  team_id VARCHAR(36) NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  permissions JSON,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, team_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  INDEX idx_user_teams_user_id (user_id),
  INDEX idx_user_teams_team_id (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

