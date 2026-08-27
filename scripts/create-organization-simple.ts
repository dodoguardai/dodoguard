/**
 * Simple script to create a default organization using raw SQL
 */

import mysql from 'mysql2/promise';
import { getEnvString } from '../backend/src/envars';
import { v4 as uuidv4 } from 'uuid';

async function createDefaultOrganization() {
  const databaseUrl = getEnvString(
    'DATABASE_URL',
    'mysql://root:root12345@localhost:3306/dodoguard',
  );

  // Parse MySQL connection string
  const url = new URL(databaseUrl.replace(/^mysql:\/\//, 'http://'));
  // Use TCP connection instead of socket
  const connection = await mysql.createConnection({
    host: url.hostname || 'localhost',
    port: parseInt(url.port || '3306'),
    user: url.username || 'root',
    password: url.password || 'root12345',
    database: url.pathname.slice(1) || 'dodoguard',
  });

  try {
    console.log('Checking for existing organizations...');

    // Check if organization already exists
    const [existing] = (await connection.execute(
      'SELECT id, name, slug FROM organizations LIMIT 1',
    )) as any[];

    if (existing.length > 0) {
      console.log('Organization already exists:');
      console.log(JSON.stringify(existing[0], null, 2));
      return existing[0];
    }

    // Create default organization
    const orgId = uuidv4();
    const orgName = 'Default Organization';
    const orgSlug = 'default-organization';

    await connection.execute(
      `INSERT INTO organizations (id, name, slug, status, metadata, created_at, updated_at) 
       VALUES (?, ?, ?, 'active', '{}', NOW(), NOW())`,
      [orgId, orgName, orgSlug],
    );

    console.log('Default organization created successfully:');
    console.log({
      id: orgId,
      name: orgName,
      slug: orgSlug,
      status: 'active',
    });

    return { id: orgId, name: orgName, slug: orgSlug };
  } catch (error: any) {
    console.error('Error creating organization:', error);
    throw error;
  } finally {
    await connection.end();
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
