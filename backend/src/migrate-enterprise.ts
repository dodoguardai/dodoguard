/**
 * Enterprise Database Migration Script
 * Handles PostgreSQL migrations for enterprise features
 */

import { getDb, getPgConnection } from './database/index';
import logger from './logger';
import * as fs from 'fs';
import * as path from 'path';

export async function runEnterpriseMigrations() {
  try {
    logger.info('Starting enterprise database migrations...');

    const _db = getDb();
    const pgConn = getPgConnection();

    if (!pgConn) {
      throw new Error(
        'PostgreSQL connection not available. Please set DB_TYPE=postgres and configure database connection.',
      );
    }

    // Read and execute enterprise migration SQL
    const migrationPath = path.join(
      __dirname,
      'database',
      'migrations',
      '001_create_enterprise_tables.sql',
    );

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    logger.info('Executing enterprise migration SQL...');

    // Split SQL by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        logger.debug(`Executing: ${statement.substring(0, 100)}...`);
        await pgConn.unsafe(statement);
      }
    }

    // Verify migrations
    const tablesToCheck = [
      'organizations',
      'teams',
      'users',
      'roles',
      'permissions',
      'user_teams',
      'vulnerabilities',
      'attack_tasks',
      'target_agents',
    ];

    logger.info('Verifying table creation...');
    for (const tableName of tablesToCheck) {
      try {
        const result = await pgConn.unsafe(`SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = '${tableName}'
        )`);
        const exists = result[0]?.exists;

        if (exists) {
          logger.info(`✓ Table '${tableName}' created successfully`);
        } else {
          logger.warn(`✗ Table '${tableName}' not found`);
        }
      } catch (error) {
        logger.error(`Error checking table '${tableName}': ${error}`);
      }
    }

    // Create default organization and admin user if they don't exist
    await createDefaultData();

    logger.info('Enterprise database migrations completed successfully!');
  } catch (error) {
    logger.error('Enterprise migration failed:', error);
    throw error;
  }
}

async function createDefaultData() {
  try {
    logger.info('Creating default organization and admin user...');

    const _db = getDb();
    const pgConn = getPgConnection();

    if (!pgConn) {
      throw new Error('PostgreSQL connection not available');
    }

    // Check if default organization exists
    const orgCheck = await pgConn.unsafe(`
      SELECT id FROM organizations WHERE slug = 'default-org' LIMIT 1
    `);

    if (orgCheck.length === 0) {
      // Create default organization
      await pgConn.unsafe(`
        INSERT INTO organizations (name, slug, status, metadata, created_at, updated_at)
        VALUES ('Default Organization', 'default-org', 'active', '{}', NOW(), NOW())
      `);

      // Get the organization ID
      const orgResult = await pgConn.unsafe(`
        SELECT id FROM organizations WHERE slug = 'default-org' LIMIT 1
      `);

      if (orgResult.length > 0) {
        const orgId = orgResult[0].id;

        // Create default admin user
        const bcrypt = await import('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 12);

        await pgConn.unsafe(`
          INSERT INTO users (
            organization_id, email, name, role, status, password_hash,
            email_verified, created_at, updated_at
          ) VALUES (
            '${orgId}', 'admin@dodoguard.com', 'System Admin', 'admin', 'active',
            '${hashedPassword}', true, NOW(), NOW()
          )
        `);

        // Create default admin role
        await pgConn.unsafe(`
          INSERT INTO roles (
            organization_id, name, type, permissions, is_default,
            created_at, updated_at
          ) VALUES (
            '${orgId}', 'Admin', 'system',
            '["*"]'::jsonb, true, NOW(), NOW()
          )
        `);

        logger.info('✓ Default organization and admin user created');
        logger.info('  Admin email: admin@dodoguard.com');
        logger.info('  Admin password: admin123');
      }
    } else {
      logger.info('✓ Default organization already exists');
    }
  } catch (error) {
    logger.error('Error creating default data:', error);
    // Don't throw error here as migration might still be successful
  }
}

// CLI runner
if (require.main === module) {
  runEnterpriseMigrations()
    .then(() => {
      logger.info('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}
