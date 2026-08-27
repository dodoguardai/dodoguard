-- Add metadata column to attack_results for finding status and audit notes (status, auditNotes).
-- For MySQL only. For PostgreSQL use 016_add_attack_results_metadata_postgres.sql.
ALTER TABLE attack_results ADD COLUMN metadata JSON NULL;
