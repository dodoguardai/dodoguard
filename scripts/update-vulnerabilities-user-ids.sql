-- Update existing vulnerabilities with created_by and updated_by
-- This script sets created_by and updated_by to the admin@126.com user

-- First, get the admin user ID
SET @admin_user_id = (SELECT id FROM users WHERE email = 'admin@126.com' LIMIT 1);

-- If admin user doesn't exist, use the first user found
SET @admin_user_id = IFNULL(@admin_user_id, (SELECT id FROM users LIMIT 1));

-- Show what we're about to update
SELECT 
  id, 
  name, 
  created_by, 
  updated_by, 
  created_at, 
  updated_at 
FROM vulnerabilities 
WHERE created_by IS NULL OR updated_by IS NULL;

-- Update vulnerabilities with created_by and updated_by
UPDATE vulnerabilities 
SET 
  created_by = @admin_user_id,
  updated_by = @admin_user_id
WHERE created_by IS NULL OR updated_by IS NULL;

-- Verify the update
SELECT 
  v.id, 
  v.name, 
  v.created_by, 
  v.updated_by,
  u.email as created_by_email,
  u.name as created_by_name,
  v.created_at, 
  v.updated_at 
FROM vulnerabilities v
LEFT JOIN users u ON v.created_by = u.id
LIMIT 5;

