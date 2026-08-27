/**
 * Script to create an admin user for testing
 * Usage: npx tsx scripts/create-admin-user.ts
 */

import bcrypt from 'bcrypt';
import { db, getDbType, closeDb, getMysqlConnection, getSqliteInstance } from '../backend/src/database';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import logger from '../backend/src/logger';

async function ensureSqliteEnterpriseTables() {
  const dbType = getDbType();
  if (dbType !== 'sqlite') {
    return;
  }
  const sqlite = getSqliteInstance();
  if (!sqlite) {
    throw new Error('SQLite instance is not available');
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      plan_id TEXT,
      subscription_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      metadata TEXT,
      icon TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      email_verified INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT NOT NULL,
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_secret TEXT,
      last_login_at INTEGER,
      last_activity_at INTEGER,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
  `);
  logger.info('Ensured SQLite organizations/users tables exist');
}

async function createAdminUser() {
  try {
    const dbType = getDbType();
    logger.info(`Database type: ${dbType}`);

    await ensureSqliteEnterpriseTables();

    // Import tables based on database type
    let usersTable: any;
    let organizationsTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = await import('../backend/src/database/tables-mysql');
      usersTable = mysqlTables.usersTable;
      organizationsTable = mysqlTables.organizationsTable;
    } else if (dbType === 'postgres') {
      const pgTables = await import('../backend/src/database/tables-enterprise');
      usersTable = pgTables.usersTable;
      organizationsTable = pgTables.organizationsTable;
    } else {
      const sqliteTables = await import('../backend/src/database/tables-enterprise');
      usersTable = sqliteTables.usersTable;
      organizationsTable = sqliteTables.organizationsTable;
    }

    const email = 'admin@126.com';
    const password = 'admin@126.com';
    const name = 'Admin User';

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    logger.info('Password hashed successfully');

    // Get or create organization (only select id to avoid missing columns like icon in older DBs)
    const existingOrgs = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .limit(1);

    let organizationId: string;
    if (existingOrgs.length > 0) {
      organizationId = existingOrgs[0].id;
      logger.info(`Using existing organization: ${organizationId}`);
    } else {
      // Create a default organization
      organizationId = uuidv4();
      if (dbType === 'mysql') {
        // Use raw SQL for MySQL to avoid schema/column mismatch (e.g. missing icon column)
        const mysqlConn = getMysqlConnection();
        if (!mysqlConn) throw new Error('MySQL connection not available');
        await mysqlConn.execute(
          'INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
          [organizationId, 'Default Organization', 'default', 'active'],
        );
      } else {
        await db.insert(organizationsTable).values({
          id: organizationId,
          name: 'Default Organization',
          slug: 'default',
          status: 'active',
          metadata: {},
        });
      }
      logger.info(`Created new organization: ${organizationId}`);
    }

    // Check if user already exists
    const existingUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existingUsers.length > 0) {
      // Update existing user (ensure they are under Default Organization)
      const userId = existingUsers[0].id;
      await db
        .update(usersTable)
        .set({
          passwordHash,
          status: 'active',
          role: 'admin',
          name,
          emailVerified: true,
          organizationId,
        })
        .where(eq(usersTable.id, userId));

      logger.info(
        `Updated existing user: ${email} (ID: ${userId}), organizationId: ${organizationId}`,
      );
      logger.info(`Password: ${password}`);
      logger.info(`Organization ID: ${organizationId}`);
    } else {
      // Create new user
      const userId = uuidv4();
      await db.insert(usersTable).values({
        id: userId,
        organizationId,
        email,
        name,
        passwordHash,
        role: 'admin',
        status: 'active',
        emailVerified: true,
      });

      logger.info(`Created new user: ${email} (ID: ${userId})`);
      logger.info(`Password: ${password}`);
      logger.info(`Organization ID: ${organizationId}`);
    }

    logger.info('Admin user created/updated successfully!');
    logger.info(`Email: ${email}`);
    logger.info(`Password: ${password}`);

    await closeDb();
    process.exit(0);
  } catch (error: any) {
    logger.error('Error creating admin user:', error);
    logger.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
    });
    await closeDb();
    process.exit(1);
  }
}

createAdminUser();
