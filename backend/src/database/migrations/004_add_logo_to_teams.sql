-- Migration: Add logo field to teams table
-- This migration adds a logo field to teams table (similar to icon in target_agents)

-- MySQL
ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS logo VARCHAR(50) DEFAULT 'Users' AFTER name;

-- Update existing teams to have default logo
UPDATE teams SET logo = 'Users' WHERE logo IS NULL;

