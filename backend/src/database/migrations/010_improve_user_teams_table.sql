-- Migration: Improve user_teams table by adding organization_id
-- This migration adds organization_id to user_teams table for better query performance
-- and data consistency

-- For MySQL
-- Step 1: Add organization_id column (nullable first to allow data migration)
ALTER TABLE user_teams 
ADD COLUMN organization_id VARCHAR(36) NULL AFTER team_id;

-- Step 2: Populate organization_id from teams table
UPDATE user_teams ut
INNER JOIN teams t ON ut.team_id = t.id
SET ut.organization_id = t.organization_id;

-- Step 3: Make organization_id NOT NULL and add foreign key
ALTER TABLE user_teams 
MODIFY COLUMN organization_id VARCHAR(36) NOT NULL,
ADD FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Step 4: Add index for better query performance
CREATE INDEX idx_user_teams_organization_id ON user_teams(organization_id);

-- Step 5: Add composite index for common queries
CREATE INDEX idx_user_teams_org_user ON user_teams(organization_id, user_id);
CREATE INDEX idx_user_teams_org_team ON user_teams(organization_id, team_id);

