-- Add index to avoid ER_OUT_OF_SORTMEMORY when querying attack_tasks by organization_id ORDER BY created_at DESC
-- The list query uses: WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50
-- This composite index lets MySQL use an index range scan instead of a filesort

CREATE INDEX idx_attack_tasks_org_created ON attack_tasks(organization_id, created_at);
