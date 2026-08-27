-- Add metadata column to attack_results for finding status and audit notes (status, auditNotes).
-- For PostgreSQL only.
ALTER TABLE attack_results ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
