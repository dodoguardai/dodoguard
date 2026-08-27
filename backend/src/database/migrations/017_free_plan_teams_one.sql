-- Migration: Free plan - allow 1 team (was 0)
-- So default plan users can create at least one team.

UPDATE subscription_plans
SET quotas = '{"targetAgents":3,"attackTasksPerMonth":10,"teams":1,"teamMembers":1,"auditLogRetentionDays":0}'
WHERE type = 'free';
