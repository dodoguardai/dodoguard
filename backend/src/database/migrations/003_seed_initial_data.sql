-- Migration: Seed initial data
-- This migration adds initial data for permissions, roles, subscription plans, and system configs

-- Insert default permissions
INSERT INTO permissions (name, resource, action, scope, description) VALUES
-- Organization permissions
('organization:read', 'organization', 'read', 'organization', 'View organization details'),
('organization:update', 'organization', 'update', 'organization', 'Update organization settings'),

-- Team permissions
('team:create', 'team', 'create', 'organization', 'Create teams'),
('team:read', 'team', 'read', 'team', 'View team details'),
('team:update', 'team', 'update', 'team', 'Update team settings'),
('team:delete', 'team', 'delete', 'team', 'Delete teams'),
('team:manage_members', 'team', 'manage_members', 'team', 'Manage team members'),

-- User permissions
('user:create', 'user', 'create', 'organization', 'Create users'),
('user:read', 'user', 'read', 'organization', 'View user details'),
('user:update', 'user', 'update', 'organization', 'Update user information'),
('user:delete', 'user', 'delete', 'organization', 'Delete users'),
('user:manage_roles', 'user', 'manage_roles', 'organization', 'Assign user roles'),

-- Agent permissions
('agent:create', 'agent', 'create', 'organization', 'Create target agents'),
('agent:read', 'agent', 'read', 'team', 'View agent details'),
('agent:update', 'agent', 'update', 'team', 'Update agent settings'),
('agent:delete', 'agent', 'delete', 'team', 'Delete agents'),
('agent:test', 'agent', 'test', 'team', 'Test agent connections'),

-- Task permissions
('task:create', 'task', 'create', 'organization', 'Create attack tasks'),
('task:read', 'task', 'read', 'team', 'View task details'),
('task:update', 'task', 'update', 'own', 'Update own tasks'),
('task:delete', 'task', 'delete', 'own', 'Delete own tasks'),
('task:execute', 'task', 'execute', 'team', 'Execute attack tasks'),

-- Vulnerability permissions
('vulnerability:read', 'vulnerability', 'read', 'organization', 'View vulnerabilities'),
('vulnerability:create', 'vulnerability', 'create', 'organization', 'Create vulnerabilities'),
('vulnerability:update', 'vulnerability', 'update', 'organization', 'Update vulnerabilities'),
('vulnerability:delete', 'vulnerability', 'delete', 'organization', 'Delete vulnerabilities'),

-- Report permissions
('report:read', 'report', 'read', 'organization', 'View reports'),
('report:create', 'report', 'create', 'organization', 'Generate reports'),
('report:delete', 'report', 'delete', 'organization', 'Delete reports'),

-- Audit permissions
('audit:read', 'audit', 'read', 'organization', 'View audit logs'),

-- Subscription permissions
('subscription:read', 'subscription', 'read', 'organization', 'View subscription details'),
('subscription:update', 'subscription', 'update', 'organization', 'Update subscription'),

-- System permissions
('system:read', 'system', 'read', 'organization', 'View system settings'),
('system:update', 'system', 'update', 'organization', 'Update system settings')
ON CONFLICT (name) DO NOTHING;

-- Insert default roles
INSERT INTO roles (organization_id, name, description, type, permissions, is_default) VALUES
-- System roles (organization_id will be set to null for global roles)
('00000000-0000-0000-0000-000000000000', 'admin', 'Administrator with full access', 'system',
 '["organization:*","team:*","user:*","agent:*","task:*","vulnerability:*","report:*","audit:*","subscription:*","system:*"]'::jsonb,
 false),
('00000000-0000-0000-0000-000000000000', 'security_analyst', 'Security analyst with read and execute permissions', 'system',
 '["organization:read","team:read","user:read","agent:read","agent:test","task:create","task:read","task:execute","vulnerability:read","report:read","report:create","audit:read","subscription:read"]'::jsonb,
 false),
('00000000-0000-0000-0000-000000000000', 'member', 'Standard member with basic permissions', 'system',
 '["organization:read","team:read","user:read","agent:read","task:create","task:read","task:update","task:delete","report:read","audit:read"]'::jsonb,
 true)
ON CONFLICT (organization_id, name) DO NOTHING;

-- Insert subscription plans
INSERT INTO subscription_plans (name, type, price_monthly, price_quarterly, price_yearly, quotas, features) VALUES
('Free', 'free', 0.00, 0.00, 0.00,
 '{
   "attackTasksPerMonth": 10,
   "reportsPerMonth": 5,
   "apiCallsPerMonth": 1000,
   "targetAgents": 3,
   "teamMembers": 5
 }'::jsonb,
 '["basic_dashboard","basic_reports","community_support"]'::jsonb
),
('Starter', 'starter', 29.99, 79.99, 299.99,
 '{
   "attackTasksPerMonth": 100,
   "reportsPerMonth": 25,
   "apiCallsPerMonth": 10000,
   "targetAgents": 10,
   "teamMembers": 25
 }'::jsonb,
 '["advanced_dashboard","custom_reports","email_support","api_access","basic_integrations"]'::jsonb
),
('Professional', 'professional', 99.99, 269.99, 999.99,
 '{
   "attackTasksPerMonth": 500,
   "reportsPerMonth": 100,
   "apiCallsPerMonth": 50000,
   "targetAgents": 50,
   "teamMembers": 100
 }'::jsonb,
 '["all_starter_features","advanced_integrations","priority_support","sso_auth","audit_logs","custom_integrations"]'::jsonb
),
('Enterprise', 'enterprise', 299.99, 799.99, 2999.99,
 '{
   "attackTasksPerMonth": -1,
   "reportsPerMonth": -1,
   "apiCallsPerMonth": -1,
   "targetAgents": -1,
   "teamMembers": -1
 }'::jsonb,
 '["all_professional_features","white_label","dedicated_support","advanced_security","compliance_reports","custom_features"]'::jsonb
)
ON CONFLICT DO NOTHING;

-- Insert system configurations
INSERT INTO system_configs (category, key, value, type, description, editable, requires_restart) VALUES
('global', 'app_name', '"DodoGuard"', 'string', 'Application name', true, false),
('global', 'app_version', '"1.0.0"', 'string', 'Application version', false, false),
('global', 'max_file_upload_size', '104857600', 'number', 'Maximum file upload size in bytes (100MB)', true, false),
('global', 'session_timeout', '3600000', 'number', 'Session timeout in milliseconds (1 hour)', true, true),
('global', 'maintenance_mode', 'false', 'boolean', 'Enable maintenance mode', true, false),

('feature', 'enable_agent_driven', 'true', 'boolean', 'Enable agent-driven attack execution', true, false),
('feature', 'enable_real_time_updates', 'true', 'boolean', 'Enable real-time task status updates', true, false),
('feature', 'enable_advanced_reporting', 'true', 'boolean', 'Enable advanced reporting features', true, false),
('feature', 'enable_audit_logging', 'true', 'boolean', 'Enable comprehensive audit logging', true, false),

('security', 'password_min_length', '8', 'number', 'Minimum password length', true, false),
('security', 'password_require_uppercase', 'true', 'boolean', 'Require uppercase letters in passwords', true, false),
('security', 'password_require_numbers', 'true', 'boolean', 'Require numbers in passwords', true, false),
('security', 'password_require_special_chars', 'false', 'boolean', 'Require special characters in passwords', true, false),
('security', 'max_login_attempts', '5', 'number', 'Maximum login attempts before lockout', true, false),
('security', 'lockout_duration', '900000', 'number', 'Account lockout duration in milliseconds (15 minutes)', true, false),

('notification', 'email_enabled', 'true', 'boolean', 'Enable email notifications', true, false),
('notification', 'email_from_address', '"noreply@dogoguard.com"', 'string', 'Email sender address', true, false),
('notification', 'slack_enabled', 'false', 'boolean', 'Enable Slack notifications', true, false),
('notification', 'webhook_enabled', 'false', 'boolean', 'Enable webhook notifications', true, false)
ON CONFLICT (key) DO NOTHING;

-- Insert feature flags
INSERT INTO feature_flags (name, enabled, description, affects) VALUES
('agent_driven_attacks', true, 'Enable AI agent-driven attack execution', '["attack_tasks","agents"]'::jsonb),
('real_time_updates', true, 'Enable real-time task status updates via WebSocket', '["dashboard","tasks"]'::jsonb),
('advanced_reporting', true, 'Enable advanced PDF/HTML report generation', '["reports","tasks"]'::jsonb),
('audit_logging', true, 'Enable comprehensive audit logging', '["security","compliance"]'::jsonb),
('multi_tenant', true, 'Enable multi-tenant organization support', '["organizations","users"]'::jsonb),
('sso_integration', false, 'Enable SSO integration', '["auth","organizations"]'::jsonb),
('api_rate_limiting', true, 'Enable API rate limiting', '["api","security"]'::jsonb),
('data_retention', true, 'Enable configurable data retention policies', '["data","compliance"]'::jsonb)
ON CONFLICT (name) DO NOTHING;
