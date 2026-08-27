-- Migration: Update subscription plans with comprehensive quotas and features
-- This migration updates existing subscription plans with new quota items and features

-- Update Free Plan
UPDATE subscription_plans 
SET 
  quotas = '{
    "targetAgents": 3,
    "vulnerabilities": 10,
    "mcpServers": 2,
    "attackTasksPerMonth": 10,
    "reportsPerMonth": 5,
    "apiCallsPerMonth": 1000,
    "teamMembers": 3,
    "teams": 1,
    "attackCommands": 20,
    "detectionRules": 10,
    "solutions": 10,
    "knowledgeBaseItems": 50,
    "auditLogRetentionDays": 7,
    "dataRetentionDays": 30
  }',
  features = '[
    "basic_dashboard",
    "basic_reports",
    "simple_attack_mode",
    "rule_detection",
    "community_support",
    "basic_vulnerability_library"
  ]'
WHERE type = 'free';

-- Update Starter Plan
UPDATE subscription_plans 
SET 
  quotas = '{
    "targetAgents": 10,
    "vulnerabilities": 50,
    "mcpServers": 5,
    "attackTasksPerMonth": 100,
    "reportsPerMonth": 25,
    "apiCallsPerMonth": 10000,
    "teamMembers": 10,
    "teams": 3,
    "attackCommands": 100,
    "detectionRules": 50,
    "solutions": 50,
    "knowledgeBaseItems": 500,
    "auditLogRetentionDays": 30,
    "dataRetentionDays": 90
  }',
  features = '[
    "advanced_dashboard",
    "custom_reports",
    "pdf_reports",
    "conversation_attack_mode",
    "llm_detection",
    "email_support",
    "api_access",
    "webhook_integration",
    "email_notifications",
    "team_collaboration",
    "basic_rbac"
  ]'
WHERE type = 'starter';

-- Update Professional Plan
UPDATE subscription_plans 
SET 
  quotas = '{
    "targetAgents": 50,
    "vulnerabilities": 200,
    "mcpServers": 20,
    "attackTasksPerMonth": 500,
    "reportsPerMonth": 100,
    "apiCallsPerMonth": 50000,
    "teamMembers": 50,
    "teams": 10,
    "attackCommands": 500,
    "detectionRules": 200,
    "solutions": 200,
    "knowledgeBaseItems": 5000,
    "auditLogRetentionDays": 90,
    "dataRetentionDays": 365
  }',
  features = '[
    "all_starter_features",
    "composite_attack_mode",
    "agent_driven_attacks",
    "knowledge_base_detection",
    "advanced_integrations",
    "sso_auth",
    "slack_integration",
    "teams_integration",
    "priority_support",
    "audit_logs",
    "custom_integrations",
    "advanced_reports",
    "data_export",
    "ip_whitelist",
    "advanced_rbac"
  ]'
WHERE type = 'professional';

-- Update Enterprise Plan
UPDATE subscription_plans 
SET 
  quotas = '{
    "targetAgents": -1,
    "vulnerabilities": -1,
    "mcpServers": -1,
    "attackTasksPerMonth": -1,
    "reportsPerMonth": -1,
    "apiCallsPerMonth": -1,
    "teamMembers": -1,
    "teams": -1,
    "attackCommands": -1,
    "detectionRules": -1,
    "solutions": -1,
    "knowledgeBaseItems": -1,
    "auditLogRetentionDays": 365,
    "dataRetentionDays": -1
  }',
  features = '[
    "all_professional_features",
    "unlimited_quotas",
    "white_label",
    "dedicated_support",
    "custom_feature_development",
    "on_premise_deployment",
    "sla_guarantee",
    "compliance_support",
    "soc2_compliance",
    "iso27001_compliance",
    "gdpr_compliance",
    "advanced_analytics",
    "bi_integration",
    "multi_region_deployment",
    "custom_dashboard",
    "advanced_security",
    "4h_support_response"
  ]'
WHERE type = 'enterprise';

-- If plans don't exist, insert them (for MySQL compatibility)
INSERT INTO subscription_plans (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
SELECT 
  'plan-free-001',
  'Free',
  'free',
  0.00,
  0.00,
  0.00,
  '{
    "targetAgents": 3,
    "vulnerabilities": 10,
    "mcpServers": 2,
    "attackTasksPerMonth": 10,
    "reportsPerMonth": 5,
    "apiCallsPerMonth": 1000,
    "teamMembers": 3,
    "teams": 1,
    "attackCommands": 20,
    "detectionRules": 10,
    "solutions": 10,
    "knowledgeBaseItems": 50,
    "auditLogRetentionDays": 7,
    "dataRetentionDays": 30
  }',
  '[
    "basic_dashboard",
    "basic_reports",
    "simple_attack_mode",
    "rule_detection",
    "community_support",
    "basic_vulnerability_library"
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE type = 'free');

INSERT INTO subscription_plans (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
SELECT 
  'plan-starter-001',
  'Starter',
  'starter',
  29.99,
  79.99,
  299.99,
  '{
    "targetAgents": 10,
    "vulnerabilities": 50,
    "mcpServers": 5,
    "attackTasksPerMonth": 100,
    "reportsPerMonth": 25,
    "apiCallsPerMonth": 10000,
    "teamMembers": 10,
    "teams": 3,
    "attackCommands": 100,
    "detectionRules": 50,
    "solutions": 50,
    "knowledgeBaseItems": 500,
    "auditLogRetentionDays": 30,
    "dataRetentionDays": 90
  }',
  '[
    "advanced_dashboard",
    "custom_reports",
    "pdf_reports",
    "conversation_attack_mode",
    "llm_detection",
    "email_support",
    "api_access",
    "webhook_integration",
    "email_notifications",
    "team_collaboration",
    "basic_rbac"
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE type = 'starter');

INSERT INTO subscription_plans (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
SELECT 
  'plan-professional-001',
  'Professional',
  'professional',
  99.99,
  269.99,
  999.99,
  '{
    "targetAgents": 50,
    "vulnerabilities": 200,
    "mcpServers": 20,
    "attackTasksPerMonth": 500,
    "reportsPerMonth": 100,
    "apiCallsPerMonth": 50000,
    "teamMembers": 50,
    "teams": 10,
    "attackCommands": 500,
    "detectionRules": 200,
    "solutions": 200,
    "knowledgeBaseItems": 5000,
    "auditLogRetentionDays": 90,
    "dataRetentionDays": 365
  }',
  '[
    "all_starter_features",
    "composite_attack_mode",
    "agent_driven_attacks",
    "knowledge_base_detection",
    "advanced_integrations",
    "sso_auth",
    "slack_integration",
    "teams_integration",
    "priority_support",
    "audit_logs",
    "custom_integrations",
    "advanced_reports",
    "data_export",
    "ip_whitelist",
    "advanced_rbac"
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE type = 'professional');

INSERT INTO subscription_plans (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
SELECT 
  'plan-enterprise-001',
  'Enterprise',
  'enterprise',
  299.99,
  799.99,
  2999.99,
  '{
    "targetAgents": -1,
    "vulnerabilities": -1,
    "mcpServers": -1,
    "attackTasksPerMonth": -1,
    "reportsPerMonth": -1,
    "apiCallsPerMonth": -1,
    "teamMembers": -1,
    "teams": -1,
    "attackCommands": -1,
    "detectionRules": -1,
    "solutions": -1,
    "knowledgeBaseItems": -1,
    "auditLogRetentionDays": 365,
    "dataRetentionDays": -1
  }',
  '[
    "all_professional_features",
    "unlimited_quotas",
    "white_label",
    "dedicated_support",
    "custom_feature_development",
    "on_premise_deployment",
    "sla_guarantee",
    "compliance_support",
    "soc2_compliance",
    "iso27001_compliance",
    "gdpr_compliance",
    "advanced_analytics",
    "bi_integration",
    "multi_region_deployment",
    "custom_dashboard",
    "advanced_security",
    "4h_support_response"
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE type = 'enterprise');

