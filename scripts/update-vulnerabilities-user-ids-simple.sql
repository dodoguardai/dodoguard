-- Simple SQL script to update vulnerabilities with created_by and updated_by
-- Execute this in your MySQL client

-- Get admin user ID
SET @admin_user_id = (SELECT id FROM users WHERE email = 'admin@126.com' LIMIT 1);

-- If admin doesn't exist, use first user
SET @admin_user_id = IFNULL(@admin_user_id, (SELECT id FROM users LIMIT 1));

-- Show what will be updated
SELECT 
  id, 
  name, 
  created_by, 
  updated_by 
FROM vulnerabilities 
WHERE created_by IS NULL OR updated_by IS NULL;

-- Update vulnerabilities
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
  u.name as created_by_name
FROM vulnerabilities v
LEFT JOIN users u ON v.created_by = u.id
LIMIT 10;

