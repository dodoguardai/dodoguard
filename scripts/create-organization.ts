/**
 * Script to create a default organization
 */

import { db, getDbType } from '../backend/src/database';
import { v4 as uuidv4 } from 'uuid';

// Import tables based on database type
const dbType = getDbType();
let organizationsTable: any;
if (dbType === 'mysql') {
  const mysqlTables = require('../backend/src/database/tables-mysql');
  organizationsTable = mysqlTables.organizationsTable;
} else if (dbType === 'postgres') {
  const pgTables = require('../backend/src/database/tables-enterprise');
  organizationsTable = pgTables.organizationsTable;
} else {
  const sqliteTables = require('../backend/src/database/tables-enterprise');
  organizationsTable = sqliteTables.organizationsTable;
}

async function createDefaultOrganization() {
  try {
    console.log('Creating default organization...');

    // Check if organization already exists
    const existing = await db.select().from(organizationsTable).limit(1);

    if (existing.length > 0) {
      console.log('Organization already exists:');
      console.log(JSON.stringify(existing[0], null, 2));
      return existing[0];
    }

    // Create default organization
    const newOrganization = {
      id: uuidv4(),
      name: 'Default Organization',
      slug: 'default-organization',
      planId: null,
      subscriptionId: null,
      status: 'active',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(organizationsTable).values(newOrganization);

    console.log('Default organization created successfully:');
    console.log(JSON.stringify(newOrganization, null, 2));

    return newOrganization;
  } catch (error: any) {
    console.error('Error creating organization:', error);
    throw error;
  }
}

// Run the script
createDefaultOrganization()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to create organization:', error);
    process.exit(1);
  });
