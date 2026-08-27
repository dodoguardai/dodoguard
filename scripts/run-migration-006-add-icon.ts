/**
 * Run migration 006: Add icon column to organizations table (MySQL)
 * Usage: npx tsx scripts/run-migration-006-add-icon.ts
 */

import { getDb, getDbType, getMysqlConnection, closeDb } from '../backend/src/database';
import logger from '../backend/src/logger';

async function runMigration006() {
  try {
    getDb(); // Ensure MySQL connection is initialized
    const dbType = getDbType();
    if (dbType !== 'mysql') {
      logger.info('Migration 006 is for MySQL only. Skipping.');
      process.exit(0);
    }

    const conn = getMysqlConnection();
    if (!conn) {
      logger.error('MySQL connection not available');
      process.exit(1);
    }

    // Check if icon column already exists
    const [cols] = await conn.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organizations' AND COLUMN_NAME = 'icon'",
    );
    const rows = cols as { COLUMN_NAME: string }[];
    if (rows.length > 0) {
      logger.info('Column organizations.icon already exists. Skipping.');
      await closeDb();
      process.exit(0);
    }

    logger.info('Adding icon column to organizations table...');
    await conn.execute('ALTER TABLE organizations ADD COLUMN icon TEXT AFTER slug');
    logger.info('Updating existing organizations with default icon...');
    await conn.execute("UPDATE organizations SET icon = 'Building2' WHERE icon IS NULL");
    logger.info('Migration 006 completed successfully.');
    await closeDb();
    process.exit(0);
  } catch (error: any) {
    logger.error('Migration 006 failed:', error);
    await closeDb();
    process.exit(1);
  }
}

runMigration006();
