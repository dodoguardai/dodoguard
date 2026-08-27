-- Migration: Simplify subscription plans quotas to 5 core items
-- This migration updates existing subscription plans with simplified quota structure
-- Only keeping: targetAgents, attackTasksPerMonth, teams, teamMembers, auditLogRetentionDays

-- Update Free Plan (7-day trial)
UPDATE subscription_plans 
SET 
  quotas = '{
    "targetAgents": 3,
    "attackTasksPerMonth": 10,
    "teams": 1,
    "teamMembers": 1,
    "auditLogRetentionDays": 0
  }',
  features = '[
    "basic_dashboard",
    "basic_reports",
    "simple_attack_mode",
    "rule_detection",
    "community_support",
    "7_day_trial"
  ]'
WHERE type = 'free';

-- Update Starter Plan
UPDATE subscription_plans 
SET 
  quotas = '{
    "targetAgents": 10,
    "attackTasksPerMonth": 100,
    "teams": 3,
    "teamMembers": 5,
    "auditLogRetentionDays": 0
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
    "team_collaboration",
    "basic_rbac"
  ]'
WHERE type = 'starter';

-- Update Professional Plan
UPDATE subscription_plans 
SET 
  quotas = '{
    "targetAgents": 50,
    "attackTasksPerMonth": 500,
    "teams": 10,
    "teamMembers": 20,
    "auditLogRetentionDays": 90
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

-- Update Enterprise Plan - Custom Pricing (includes ALL features)
UPDATE subscription_plans 
SET 
  price_monthly = NULL,
  price_quarterly = NULL,
  price_yearly = NULL,
  quotas = '{
    "targetAgents": -1,
    "attackTasksPerMonth": -1,
    "teams": -1,
    "teamMembers": -1,
    "auditLogRetentionDays": 365
  }',
  features = '[
    "basic_dashboard",
    "advanced_dashboard",
    "basic_reports",
    "custom_reports",
    "pdf_reports",
    "advanced_reports",
    "simple_attack_mode",
    "conversation_attack_mode",
    "composite_attack_mode",
    "agent_driven_attacks",
    "rule_detection",
    "llm_detection",
    "knowledge_base_detection",
    "community_support",
    "email_support",
    "priority_support",
    "dedicated_support",
    "api_access",
    "webhook_integration",
    "advanced_integrations",
    "custom_integrations",
    "slack_integration",
    "teams_integration",
    "team_collaboration",
    "basic_rbac",
    "advanced_rbac",
    "sso_auth",
    "audit_logs",
    "data_export",
    "ip_whitelist",
    "unlimited_quotas",
    "white_label",
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
    "4h_support_response",
    "custom_pricing",
    "7_day_trial"
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
    "attackTasksPerMonth": 10,
    "teams": 1,
    "teamMembers": 1,
    "auditLogRetentionDays": 0
  }',
  '[
    "basic_dashboard",
    "basic_reports",
    "simple_attack_mode",
    "rule_detection",
    "community_support",
    "7_day_trial"
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE type = 'free');

INSERT INTO subscription_plans (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
SELECT 
  'plan-starter-001',
  'Starter',
  'starter',
  39.99,
  107.99,
  399.99,
  '{
    "targetAgents": 10,
    "attackTasksPerMonth": 100,
    "teams": 3,
    "teamMembers": 5,
    "auditLogRetentionDays": 0
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
  129.99,
  349.99,
  1299.99,
  '{
    "targetAgents": 50,
    "attackTasksPerMonth": 500,
    "teams": 10,
    "teamMembers": 20,
    "auditLogRetentionDays": 90
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
  NULL,
  NULL,
  NULL,
  '{
    "targetAgents": -1,
    "attackTasksPerMonth": -1,
    "teams": -1,
    "teamMembers": -1,
    "auditLogRetentionDays": 365
  }',
  '[
    "basic_dashboard",
    "advanced_dashboard",
    "basic_reports",
    "custom_reports",
    "pdf_reports",
    "advanced_reports",
    "simple_attack_mode",
    "conversation_attack_mode",
    "composite_attack_mode",
    "agent_driven_attacks",
    "rule_detection",
    "llm_detection",
    "knowledge_base_detection",
    "community_support",
    "email_support",
    "priority_support",
    "dedicated_support",
    "api_access",
    "webhook_integration",
    "advanced_integrations",
    "custom_integrations",
    "slack_integration",
    "teams_integration",
    "team_collaboration",
    "basic_rbac",
    "advanced_rbac",
    "sso_auth",
    "audit_logs",
    "data_export",
    "ip_whitelist",
    "unlimited_quotas",
    "white_label",
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
    "4h_support_response",
    "custom_pricing",
    "7_day_trial"
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE type = 'enterprise');

