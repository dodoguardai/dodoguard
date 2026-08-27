-- Script to create an admin user for testing
-- Email: admin@126.com
-- Password: admin@126.com

-- First, get or create an organization
SET @org_id = (SELECT id FROM organizations LIMIT 1);

-- If no organization exists, create one
INSERT INTO organizations (id, name, slug, status, metadata, created_at, updated_at)
SELECT 
    UUID() as id,
    'Default Organization' as name,
    'default' as slug,
    'active' as status,
    '{}' as metadata,
    NOW() as created_at,
    NOW() as updated_at
WHERE NOT EXISTS (SELECT 1 FROM organizations LIMIT 1);

-- Get the organization ID (either existing or newly created)
SET @org_id = (SELECT id FROM organizations LIMIT 1);

-- Check if user already exists
SET @user_exists = (SELECT COUNT(*) FROM users WHERE email = 'admin@126.com');

-- If user exists, update it (including setting organization_id to Default Organization)
UPDATE users
SET 
    password_hash = '$2b$12$9QP9u9lo7iRFQI/J96kMdeUhsuDC3oQE2mqOI8hcIViAYzTb0q3JG',
    status = 'active',
    role = 'admin',
    name = 'Admin User',
    email_verified = true,
    organization_id = @org_id,
    updated_at = NOW()
WHERE email = 'admin@126.com' AND @user_exists > 0;

-- If user doesn't exist, create it
INSERT INTO users (
    id,
    organization_id,
    email,
    name,
    password_hash,
    role,
    status,
    email_verified,
    created_at,
    updated_at
)
SELECT 
    UUID() as id,
    @org_id as organization_id,
    'admin@126.com' as email,
    'Admin User' as name,
    '$2b$12$9QP9u9lo7iRFQI/J96kMdeUhsuDC3oQE2mqOI8hcIViAYzTb0q3JG' as password_hash,
    'admin' as role,
    'active' as status,
    true as email_verified,
    NOW() as created_at,
    NOW() as updated_at
WHERE @user_exists = 0;

-- Verify the user was created/updated
SELECT 
    id,
    email,
    name,
    role,
    status,
    email_verified,
    organization_id
FROM users 
WHERE email = 'admin@126.com';

