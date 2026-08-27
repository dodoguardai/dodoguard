-- Migration: Add icon column to target_agents table
-- Date: 2025-12-28

-- For MySQL
ALTER TABLE target_agents 
ADD COLUMN icon VARCHAR(50) DEFAULT 'Monitor' AFTER type;

-- Update existing records to have default icon
UPDATE target_agents 
SET icon = 'Monitor' 
WHERE icon IS NULL;

-- For PostgreSQL (if needed)
-- ALTER TABLE target_agents 
-- ADD COLUMN icon VARCHAR(50) DEFAULT 'Monitor';

-- UPDATE target_agents 
-- SET icon = 'Monitor' 
-- WHERE icon IS NULL;

