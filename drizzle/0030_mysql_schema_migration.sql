-- MySQL schema migration for all tables
-- Generated from tables-mysql.ts schema

-- Organizations and Users
CREATE TABLE IF NOT EXISTS `organizations` (
    `id` VARCHAR(36) PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `plan_id` VARCHAR(36),
    `subscription_id` VARCHAR(36),
    `status` VARCHAR(20),
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `slug_idx` (`slug`),
    KEY `status_idx` (`status`)
);

CREATE TABLE IF NOT EXISTS `teams` (
    `id` VARCHAR(36) PRIMARY KEY,
    `organization_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `organization_id_idx` (`organization_id`),
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `users` (
    `id` VARCHAR(36) PRIMARY KEY,
    `organization_id` VARCHAR(36),
    `email` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255),
    `avatar` VARCHAR(500),
    `role` VARCHAR(50),
    `status` VARCHAR(20),
    `email_verified` BOOLEAN DEFAULT FALSE,
    `password_hash` VARCHAR(255),
    `mfa_enabled` BOOLEAN DEFAULT FALSE,
    `mfa_secret` VARCHAR(255),
    `last_login_at` TIMESTAMP,
    `last_activity_at` TIMESTAMP,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `email_idx` (`email`),
    KEY `organization_id_idx` (`organization_id`),
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `roles` (
    `id` VARCHAR(36) PRIMARY KEY,
    `organization_id` VARCHAR(36),
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `type` VARCHAR(20),
    `permissions` JSON,
    `is_default` BOOLEAN DEFAULT FALSE,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `organization_name_idx` (`organization_id`, `name`),
    KEY `organization_id_idx` (`organization_id`),
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `permissions` (
    `id` VARCHAR(36) PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `resource` VARCHAR(100),
    `action` VARCHAR(50),
    `scope` VARCHAR(20),
    `description` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `name_idx` (`name`)
);

-- Subscription and Billing
CREATE TABLE IF NOT EXISTS `subscription_plans` (
    `id` VARCHAR(36) PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `price_monthly` DECIMAL(10,2),
    `price_quarterly` DECIMAL(10,2),
    `price_yearly` DECIMAL(10,2),
    `quotas` JSON,
    `features` JSON,
    `enabled` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `type_idx` (`type`),
    KEY `enabled_idx` (`enabled`)
);

CREATE TABLE IF NOT EXISTS `organization_subscriptions` (
    `id` VARCHAR(36) PRIMARY KEY,
    `organization_id` VARCHAR(36) NOT NULL,
    `plan_id` VARCHAR(36) NOT NULL,
    `billing_cycle` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `current_period_start` TIMESTAMP,
    `current_period_end` TIMESTAMP,
    `cancel_at_period_end` BOOLEAN DEFAULT FALSE,
    `price` DECIMAL(10,2) NOT NULL,
    `currency` VARCHAR(10) DEFAULT 'USD',
    `payment_method_id` VARCHAR(255),
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `organization_id_idx` (`organization_id`),
    KEY `plan_id_idx` (`plan_id`),
    KEY `status_idx` (`status`),
    KEY `period_idx` (`current_period_start`, `current_period_end`),
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS `usage_records` (
    `id` VARCHAR(36) PRIMARY KEY,
    `organization_id` VARCHAR(36) NOT NULL,
    `team_id` VARCHAR(36),
    `user_id` VARCHAR(36),
    `metric` VARCHAR(100) NOT NULL,
    `quantity` INT NOT NULL,
    `period` VARCHAR(7) NOT NULL,
    `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `metadata` JSON,
    KEY `org_period_idx` (`organization_id`, `period`),
    KEY `metric_idx` (`metric`),
    KEY `timestamp_idx` (`timestamp`),
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `quota_usage` (
    `organization_id` VARCHAR(36) PRIMARY KEY,
    `period` VARCHAR(7) NOT NULL,
    `quotas` JSON NOT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `period_idx` (`period`),
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);

-- Vulnerabilities Management
CREATE TABLE IF NOT EXISTS `vulnerabilities` (
    `id` VARCHAR(36) PRIMARY KEY,
    `avd_id` VARCHAR(50) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `category` VARCHAR(100),
    `risk_level` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `disclosed_at` TIMESTAMP,
    `description` TEXT,
    `affected_targets` JSON,
    `impact_scope` TEXT,
    `cwe_id` VARCHAR(20),
    `mitre_id` VARCHAR(50),
    `owasp_id` VARCHAR(50),
    `owasp_llm_top10_mapping` JSON,
    `exploitability` JSON,
    `patch_status` JSON,
    `audit_notes` TEXT,
    `tags` JSON,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `created_by` VARCHAR(36),
    `updated_by` VARCHAR(36),
    UNIQUE KEY `avd_id_idx` (`avd_id`),
    KEY `type_idx` (`type`),
    KEY `risk_level_idx` (`risk_level`),
    KEY `status_idx` (`status`),
    KEY `category_idx` (`category`),
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `attack_commands` (
    `id` VARCHAR(36) PRIMARY KEY,
    `vulnerability_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `attack_mode` VARCHAR(20) NOT NULL,
    `expected_success` TEXT,
    `non_vulnerability` TEXT,
    `risk_level` VARCHAR(20),
    `enabled` BOOLEAN DEFAULT TRUE,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `vulnerability_id_idx` (`vulnerability_id`),
    KEY `attack_mode_idx` (`attack_mode`),
    KEY `enabled_idx` (`enabled`),
    FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `detection_rules` (
    `id` VARCHAR(36) PRIMARY KEY,
    `vulnerability_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `pattern` TEXT NOT NULL,
    `severity` VARCHAR(20),
    `confidence` DECIMAL(3,2),
    `enabled` BOOLEAN DEFAULT TRUE,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `vulnerability_id_idx` (`vulnerability_id`),
    KEY `type_idx` (`type`),
    KEY `enabled_idx` (`enabled`),
    FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `solutions` (
    `id` VARCHAR(36) PRIMARY KEY,
    `vulnerability_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `steps` JSON,
    `references` JSON,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `vulnerability_id_idx` (`vulnerability_id`),
    FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `success_indicators` (
    `id` VARCHAR(36) PRIMARY KEY,
    `vulnerability_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `pattern` TEXT,
    `description` TEXT,
    `confidence` DECIMAL(3,2),
    `severity` VARCHAR(20),
    `enabled` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `vulnerability_id_idx` (`vulnerability_id`),
    KEY `type_idx` (`type`),
    KEY `enabled_idx` (`enabled`),
    FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `failure_indicators` (
    `id` VARCHAR(36) PRIMARY KEY,
    `vulnerability_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `pattern` TEXT,
    `description` TEXT,
    `enabled` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `vulnerability_id_idx` (`vulnerability_id`),
    KEY `type_idx` (`type`),
    KEY `enabled_idx` (`enabled`),
    FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `waf_rules` (
    `id` VARCHAR(36) PRIMARY KEY,
    `vulnerability_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `rule` TEXT NOT NULL,
    `description` TEXT,
    `text_pattern` TEXT,
    `text_match_type` VARCHAR(20),
    `semantic_prompt` TEXT,
    `semantic_threshold` DECIMAL(3,2),
    `enabled` BOOLEAN DEFAULT TRUE,
    `priority` INT DEFAULT 0,
    `action` VARCHAR(20) DEFAULT 'block',
    `applicable_scenarios` JSON,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `vulnerability_id_idx` (`vulnerability_id`),
    KEY `type_idx` (`type`),
    KEY `enabled_idx` (`enabled`),
    KEY `priority_idx` (`priority`),
    FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `agent_guard_strategies` (
    `id` VARCHAR(36) PRIMARY KEY,
    `vulnerability_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `strategy_type` VARCHAR(50) NOT NULL,
    `description` TEXT,
    `config` JSON,
    `enabled` BOOLEAN DEFAULT TRUE,
    `priority` INT DEFAULT 0,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `vulnerability_id_idx` (`vulnerability_id`),
    KEY `strategy_type_idx` (`strategy_type`),
    KEY `enabled_idx` (`enabled`),
    KEY `priority_idx` (`priority`),
    FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `soc_alert_rules` (
    `id` VARCHAR(36) PRIMARY KEY,
    `vulnerability_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `conditions` JSON,
    `actions` JSON,
    `enabled` BOOLEAN DEFAULT TRUE,
    `priority` INT DEFAULT 0,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `vulnerability_id_idx` (`vulnerability_id`),
    KEY `enabled_idx` (`enabled`),
    KEY `priority_idx` (`priority`),
    FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `compliance_statements` (
    `id` VARCHAR(36) PRIMARY KEY,
    `vulnerability_id` VARCHAR(36) NOT NULL,
    `standard` VARCHAR(50) NOT NULL,
    `statement` TEXT NOT NULL,
    `clause` VARCHAR(100),
    `description` TEXT,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `vulnerability_id_idx` (`vulnerability_id`),
    KEY `standard_idx` (`standard`),
    FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON DELETE CASCADE
);

-- Reports
CREATE TABLE IF NOT EXISTS `report_templates` (
    `id` VARCHAR(36) PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `html_template` TEXT,
    `styles` TEXT,
    `sections` JSON,
    `enabled` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `enabled_idx` (`enabled`)
);

CREATE TABLE IF NOT EXISTS `reports` (
    `id` VARCHAR(36) PRIMARY KEY,
    `task_id` VARCHAR(36) NOT NULL,
    `organization_id` VARCHAR(36) NOT NULL,
    `template_id` VARCHAR(36),
    `format` VARCHAR(10) NOT NULL,
    `content` TEXT,
    `file_path` VARCHAR(500),
    `file_size` BIGINT,
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY `task_id_idx` (`task_id`),
    KEY `organization_id_idx` (`organization_id`),
    KEY `template_id_idx` (`template_id`),
    KEY `format_idx` (`format`),
    FOREIGN KEY (`task_id`) REFERENCES `attack_tasks`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`template_id`) REFERENCES `report_templates`(`id`) ON DELETE SET NULL
);

-- System Configuration
CREATE TABLE IF NOT EXISTS `system_configs` (
    `id` VARCHAR(36) PRIMARY KEY,
    `category` VARCHAR(50) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `value` JSON,
    `type` VARCHAR(20) NOT NULL,
    `description` TEXT,
    `editable` BOOLEAN DEFAULT TRUE,
    `requires_restart` BOOLEAN DEFAULT FALSE,
    `updated_by` VARCHAR(36),
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `category_idx` (`category`),
    UNIQUE KEY `key_idx` (`key`),
    FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `feature_flags` (
    `id` VARCHAR(36) PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `enabled` BOOLEAN DEFAULT FALSE,
    `description` TEXT,
    `affects` JSON,
    `updated_by` VARCHAR(36),
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `name_idx` (`name`),
    KEY `enabled_idx` (`enabled`),
    FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `integration_configs` (
    `id` VARCHAR(36) PRIMARY KEY,
    `type` VARCHAR(50) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `provider` VARCHAR(100),
    `config` JSON,
    `enabled` BOOLEAN DEFAULT FALSE,
    `test_status` VARCHAR(20),
    `last_tested` TIMESTAMP,
    `updated_by` VARCHAR(36),
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `type_idx` (`type`),
    KEY `enabled_idx` (`enabled`),
    FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `notification_configs` (
    `id` VARCHAR(36) PRIMARY KEY,
    `type` VARCHAR(50) NOT NULL,
    `enabled` BOOLEAN DEFAULT FALSE,
    `config` JSON,
    `templates` JSON,
    `rules` JSON,
    `updated_by` VARCHAR(36),
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `type_idx` (`type`),
    KEY `enabled_idx` (`enabled`),
    FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `security_policies` (
    `id` VARCHAR(36) PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `config` JSON,
    `enabled` BOOLEAN DEFAULT FALSE,
    `updated_by` VARCHAR(36),
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `type_idx` (`type`),
    KEY `enabled_idx` (`enabled`),
    FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

-- Additional user-related tables
CREATE TABLE IF NOT EXISTS `user_invitations` (
    `id` VARCHAR(36) PRIMARY KEY,
    `organization_id` VARCHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `role` VARCHAR(50),
    `team_ids` JSON,
    `invited_by` VARCHAR(36),
    `token` VARCHAR(255) NOT NULL,
    `expires_at` TIMESTAMP,
    `status` VARCHAR(20) DEFAULT 'pending',
    `accepted_at` TIMESTAMP,
    `accepted_by` VARCHAR(36),
    `metadata` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `token_idx` (`token`),
    KEY `organization_id_idx` (`organization_id`),
    KEY `status_idx` (`status`),
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`accepted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `user_activities` (
    `id` VARCHAR(36) PRIMARY KEY,
    `user_id` VARCHAR(36),
    `organization_id` VARCHAR(36),
    `action` VARCHAR(100),
    `resource_type` VARCHAR(100),
    `resource_id` VARCHAR(36),
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `details` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY `user_id_idx` (`user_id`),
    KEY `organization_id_idx` (`organization_id`),
    KEY `action_idx` (`action`),
    KEY `created_at_idx` (`created_at`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `user_teams` (
    `user_id` VARCHAR(36) NOT NULL,
    `team_id` VARCHAR(36) NOT NULL,
    `role` VARCHAR(50),
    `permissions` JSON,
    `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`, `team_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` VARCHAR(36) PRIMARY KEY,
    `organization_id` VARCHAR(36),
    `user_id` VARCHAR(36),
    `team_id` VARCHAR(36),
    `action` VARCHAR(100),
    `resource_type` VARCHAR(100),
    `resource_id` VARCHAR(36),
    `details` JSON,
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY `organization_id_idx` (`organization_id`),
    KEY `user_id_idx` (`user_id`),
    KEY `team_id_idx` (`team_id`),
    KEY `action_idx` (`action`),
    KEY `created_at_idx` (`created_at`),
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE
);
