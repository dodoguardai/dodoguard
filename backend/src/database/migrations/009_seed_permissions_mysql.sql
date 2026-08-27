-- Migration: Seed permissions data for MySQL
-- This migration inserts all default permissions used in the system

-- Insert default permissions
INSERT INTO permissions (id, name, resource, action, scope, description, created_at) VALUES
-- Organization permissions
(UUID(), 'organization:read', 'organization', 'read', 'organization', 'View organization details', NOW()),
(UUID(), 'organization:update', 'organization', 'update', 'organization', 'Update organization settings', NOW()),

-- Team permissions
(UUID(), 'team:create', 'team', 'create', 'organization', 'Create teams', NOW()),
(UUID(), 'team:read', 'team', 'read', 'team', 'View team details', NOW()),
(UUID(), 'team:update', 'team', 'update', 'team', 'Update team settings', NOW()),
(UUID(), 'team:delete', 'team', 'delete', 'team', 'Delete teams', NOW()),
(UUID(), 'team:manage_members', 'team', 'manage_members', 'team', 'Manage team members', NOW()),
(UUID(), 'team:manage', 'team', 'manage', 'organization', 'Manage teams', NOW()),

-- User permissions
(UUID(), 'user:create', 'user', 'create', 'organization', 'Create users', NOW()),
(UUID(), 'user:read', 'user', 'read', 'organization', 'View user details', NOW()),
(UUID(), 'user:update', 'user', 'update', 'organization', 'Update user information', NOW()),
(UUID(), 'user:delete', 'user', 'delete', 'organization', 'Delete users', NOW()),
(UUID(), 'user:manage_roles', 'user', 'manage_roles', 'organization', 'Assign user roles', NOW()),
(UUID(), 'user:manage', 'user', 'manage', 'organization', 'Manage users', NOW()),

-- Agent permissions
(UUID(), 'agent:create', 'agent', 'create', 'organization', 'Create target agents', NOW()),
(UUID(), 'agent:read', 'agent', 'read', 'team', 'View agent details', NOW()),
(UUID(), 'agent:update', 'agent', 'update', 'team', 'Update agent settings', NOW()),
(UUID(), 'agent:delete', 'agent', 'delete', 'team', 'Delete agents', NOW()),
(UUID(), 'agent:test', 'agent', 'test', 'team', 'Test agent connections', NOW()),

-- Task permissions
(UUID(), 'task:create', 'task', 'create', 'organization', 'Create attack tasks', NOW()),
(UUID(), 'task:read', 'task', 'read', 'team', 'View task details', NOW()),
(UUID(), 'task:update', 'task', 'update', 'own', 'Update own tasks', NOW()),
(UUID(), 'task:delete', 'task', 'delete', 'own', 'Delete own tasks', NOW()),
(UUID(), 'task:execute', 'task', 'execute', 'team', 'Execute attack tasks', NOW()),
(UUID(), 'task:manage', 'task', 'manage', 'organization', 'Manage attack tasks', NOW()),

-- Vulnerability permissions
(UUID(), 'vulnerability:read', 'vulnerability', 'read', 'organization', 'View vulnerabilities', NOW()),
(UUID(), 'vulnerability:create', 'vulnerability', 'create', 'organization', 'Create vulnerabilities', NOW()),
(UUID(), 'vulnerability:update', 'vulnerability', 'update', 'organization', 'Update vulnerabilities', NOW()),
(UUID(), 'vulnerability:delete', 'vulnerability', 'delete', 'organization', 'Delete vulnerabilities', NOW()),
(UUID(), 'vulnerability:manage', 'vulnerability', 'manage', 'organization', 'Manage vulnerabilities', NOW()),

-- Report permissions
(UUID(), 'report:read', 'report', 'read', 'organization', 'View reports', NOW()),
(UUID(), 'report:create', 'report', 'create', 'organization', 'Generate reports', NOW()),
(UUID(), 'report:delete', 'report', 'delete', 'organization', 'Delete reports', NOW()),

-- Audit permissions
(UUID(), 'audit:read', 'audit', 'read', 'organization', 'View audit logs', NOW()),

-- Subscription permissions
(UUID(), 'subscription:read', 'subscription', 'read', 'organization', 'View subscription details', NOW()),
(UUID(), 'subscription:update', 'subscription', 'update', 'organization', 'Update subscription', NOW()),

-- System permissions
(UUID(), 'system:read', 'system', 'read', 'organization', 'View system settings', NOW()),
(UUID(), 'system:update', 'system', 'update', 'organization', 'Update system settings', NOW()),

-- Dashboard permissions
(UUID(), 'dashboard:read', 'dashboard', 'read', 'organization', 'View dashboard', NOW())
ON DUPLICATE KEY UPDATE name = name;

