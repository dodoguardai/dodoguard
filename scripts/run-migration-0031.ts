/**
 * Direct migration script to create vulnerability-related tables
 * Run this script if the automatic migration didn't execute properly
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDb, getDbType, getMysqlConnection } from '../backend/src/database/index';
import { sql } from 'drizzle-orm';
import logger from '../backend/src/logger';

async function runMigration() {
  try {
    const dbType = getDbType();

    if (dbType !== 'mysql') {
      logger.error('This migration is for MySQL only');
      process.exit(1);
    }

    const db = getDb();
    if (!db) {
      logger.error('Database connection not available');
      process.exit(1);
    }

    const migrationPath = path.join(
      __dirname,
      '..',
      'drizzle',
      '0031_add_vulnerability_related_tables.sql',
    );

    if (!fs.existsSync(migrationPath)) {
      logger.error(`Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    logger.info(`Reading migration file: ${migrationPath}`);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Better SQL splitting: handle multi-line statements properly
    // Remove comments first
    let cleanSQL = migrationSQL
      .split('\n')
      .filter((line) => !line.trim().startsWith('--') && line.trim() !== '')
      .join('\n');

    // Remove block comments
    cleanSQL = cleanSQL.replace(/\/\*[\s\S]*?\*\//g, '');

    // Split by semicolon, but keep track of statement boundaries
    const statements: string[] = [];
    let currentStatement = '';

    for (const line of cleanSQL.split('\n')) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      currentStatement += (currentStatement ? '\n' : '') + line;

      // Check if line ends with semicolon (statement complete)
      if (trimmedLine.endsWith(';')) {
        const statement = currentStatement.trim();
        if (statement && statement !== ';') {
          statements.push(statement);
        }
        currentStatement = '';
      }
    }

    // Add any remaining statement (shouldn't happen with proper SQL, but just in case)
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    logger.info(`Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          logger.info(`[${i + 1}/${statements.length}] Executing statement...`);
          logger.debug(`SQL: ${statement.substring(0, 100)}...`);
          await db.execute(sql.raw(statement));
          logger.info(`✓ Statement ${i + 1} executed successfully`);
        } catch (error: any) {
          const errorMessage = error?.message || String(error);
          // Check if it's a "already exists" error (which is OK)
          if (
            errorMessage.includes('already exists') ||
            errorMessage.includes('Duplicate key name') ||
            errorMessage.includes('Duplicate column name') ||
            errorMessage.includes('Duplicate index name') ||
            errorMessage.includes('ER_DUP_KEYNAME')
          ) {
            logger.info(
              `⚠ Statement ${i + 1} skipped (already exists): ${errorMessage.substring(0, 100)}`,
            );
          } else {
            logger.error(`✗ Statement ${i + 1} failed: ${errorMessage}`);
            logger.error(`Full error:`, error);
            // Continue with other statements even if one fails
          }
        }
      }
    }

    logger.info('Migration completed!');

    // Verify tables were created
    const mysqlConn = getMysqlConnection();
    if (mysqlConn) {
      const tablesToCheck = [
        'attack_commands',
        'detection_rules',
        'solutions',
        'success_indicators',
        'failure_indicators',
        'waf_rules',
        'llm_review_instructions',
      ];

      logger.info('Verifying tables exist...');
      for (const tableName of tablesToCheck) {
        try {
          const [rows] = (await mysqlConn.execute(
            'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
            [tableName],
          )) as any[];

          if (rows.length > 0) {
            logger.info(`✓ Table ${tableName} exists`);
          } else {
            logger.error(`✗ Table ${tableName} does NOT exist`);
          }
        } catch (error: any) {
          logger.error(`Error checking table ${tableName}: ${error.message}`);
        }
      }
    }

    process.exit(0);
  } catch (error: any) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
