/**
 * Script to update existing vulnerabilities with created_by and updated_by fields
 * Run with: npx tsx scripts/update-vulnerabilities-user-ids.ts
 */

import { db, getDbType } from '../backend/src/database';
import { eq, sql, isNull, or } from 'drizzle-orm';

// Import tables based on database type
function getUsersTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../backend/src/database/tables-mysql');
    return mysqlTables.usersTable;
  } else if (dbType === 'postgres') {
    const pgTables = require('../backend/src/database/tables-enterprise');
    return pgTables.usersTable;
  }
  return null;
}

function getVulnerabilitiesTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../backend/src/database/tables-mysql');
    return mysqlTables.vulnerabilitiesTable;
  } else if (dbType === 'postgres') {
    const pgTables = require('../backend/src/database/tables-enterprise');
    return pgTables.vulnerabilitiesTable;
  }
  return null;
}

async function updateVulnerabilitiesUserIds() {
  try {
    console.log('Starting update of vulnerabilities user IDs...');

    // Get tables
    const usersTable = getUsersTable();
    const vulnerabilitiesTable = getVulnerabilitiesTable();

    if (!usersTable || !vulnerabilitiesTable) {
      console.error('Failed to load database tables');
      process.exit(1);
    }

    // Get admin user ID (admin@126.com)
    const [adminUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, 'admin@126.com'))
      .limit(1);

    let userId: string | null = null;

    if (adminUser) {
      userId = adminUser.id;
      console.log(`Found admin user: ${userId}`);
    } else {
      // Get first user if admin doesn't exist
      const [firstUser] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);

      if (firstUser) {
        userId = firstUser.id;
        console.log(`Using first user found: ${userId}`);
      } else {
        console.error('No users found in database');
        process.exit(1);
      }
    }

    // Check vulnerabilities that need updating
    const vulnerabilitiesToUpdate = await db
      .select({ id: vulnerabilitiesTable.id, name: vulnerabilitiesTable.name })
      .from(vulnerabilitiesTable)
      .where(or(isNull(vulnerabilitiesTable.createdBy), isNull(vulnerabilitiesTable.updatedBy)));

    console.log(`Found ${vulnerabilitiesToUpdate.length} vulnerabilities to update`);

    if (vulnerabilitiesToUpdate.length === 0) {
      console.log('No vulnerabilities need updating');
      return;
    }

    // Update vulnerabilities
    await db
      .update(vulnerabilitiesTable)
      .set({
        createdBy: userId,
        updatedBy: userId,
      } as any)
      .where(or(isNull(vulnerabilitiesTable.createdBy), isNull(vulnerabilitiesTable.updatedBy)));

    console.log(`Successfully updated ${vulnerabilitiesToUpdate.length} vulnerabilities`);

    // Verify the update
    const updated = await db
      .select({
        id: vulnerabilitiesTable.id,
        name: vulnerabilitiesTable.name,
        createdBy: vulnerabilitiesTable.createdBy,
        updatedBy: vulnerabilitiesTable.updatedBy,
      })
      .from(vulnerabilitiesTable)
      .limit(5);

    console.log('\nUpdated vulnerabilities:');
    updated.forEach((v) => {
      console.log(`  - ${v.name} (${v.id})`);
      console.log(`    createdBy: ${v.createdBy}`);
      console.log(`    updatedBy: ${v.updatedBy}`);
    });

    console.log('\nUpdate completed successfully!');
  } catch (error) {
    console.error('Error updating vulnerabilities:', error);
    process.exit(1);
  }
}

// Run the script
updateVulnerabilitiesUserIds()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
