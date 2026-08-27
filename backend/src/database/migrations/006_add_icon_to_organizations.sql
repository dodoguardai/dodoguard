-- Migration: Add icon field to organizations table
-- This migration adds an icon field to organizations table (similar to teams)

-- MySQL
ALTER TABLE organizations 
ADD COLUMN icon TEXT AFTER slug;

-- Update existing organizations to have default icon
UPDATE organizations SET icon = 'Building2' WHERE icon IS NULL;

