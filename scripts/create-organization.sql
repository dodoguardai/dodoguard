-- Script to create a default organization
-- Run with: mysql -u root -proot12345 dodoguard < scripts/create-organization.sql

-- Check if organization already exists, if not create one
INSERT INTO organizations (id, name, slug, status, metadata, created_at, updated_at)
SELECT 
  UUID() as id,
  'Default Organization' as name,
  'default-organization' as slug,
  'active' as status,
  '{}' as metadata,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM organizations WHERE slug = 'default-organization'
);

-- Show the created organization
SELECT id, name, slug, status FROM organizations WHERE slug = 'default-organization';

