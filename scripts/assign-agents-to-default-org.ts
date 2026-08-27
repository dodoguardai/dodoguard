/**
 * Assign all target agents to the same organization as admin@126.com (Default Organization).
 * Run this after create-admin-user.ts if agents were created under a different org and don't show up.
 * Usage: npx tsx scripts/assign-agents-to-default-org.ts
 */

import { db, getDbType, closeDb } from '../backend/src/database';
import { eq, sql } from 'drizzle-orm';
import logger from '../backend/src/logger';

const ADMIN_EMAIL = 'admin@126.com';

async function assignAgentsToDefaultOrg() {
  try {
    const dbType = getDbType();
    logger.info(`Database type: ${dbType}`);

    let usersTable: any;
    let targetAgentsTable: any;

    if (dbType === 'mysql') {
      const mysqlTables = await import('../backend/src/database/tables-mysql');
      usersTable = mysqlTables.usersTable;
      targetAgentsTable = mysqlTables.targetAgentsTable;
    } else if (dbType === 'postgres') {
      const pgTables = await import('../backend/src/database/tables-enterprise');
      usersTable = pgTables.usersTable;
      targetAgentsTable = pgTables.targetAgentsTable;
    } else {
      const sqliteTables = await import('../backend/src/database/tables-enterprise');
      usersTable = sqliteTables.usersTable;
      targetAgentsTable = sqliteTables.targetAgentsTable;
    }

    const [adminUser] = await db
      .select({ id: usersTable.id, organizationId: usersTable.organizationId })
      .from(usersTable)
      .where(eq(usersTable.email, ADMIN_EMAIL))
      .limit(1);

    if (!adminUser?.organizationId) {
      logger.error(
        `User ${ADMIN_EMAIL} not found or has no organization. Run create-admin-user.ts first.`,
      );
      await closeDb();
      process.exit(1);
    }

    const defaultOrgId = adminUser.organizationId;
    logger.info(`Default organization ID (from ${ADMIN_EMAIL}): ${defaultOrgId}`);

    const result = await db
      .update(targetAgentsTable)
      .set({ organizationId: defaultOrgId })
      .where(sql`1 = 1`);

    const count =
      (result as any).rowCount ?? (result as any).rowsAffected ?? (result as any).affectedRows ?? 0;
    logger.info(
      `Updated target_agents: organization_id set to Default Organization for ${count} row(s).`,
    );
    logger.info('Done. Refresh the Agents page to see the agents.');
    await closeDb();
    process.exit(0);
  } catch (error: any) {
    logger.error('Error assigning agents to default org:', error);
    logger.error('Details:', { message: error?.message, stack: error?.stack });
    await closeDb();
    process.exit(1);
  }
}

assignAgentsToDefaultOrg();
