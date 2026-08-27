/**
 * Direct script to seed permissions into MySQL database
 * Run with: npx tsx scripts/seed-permissions-direct.ts
 */

import { getDb, getDbType } from '../backend/src/database/index';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const defaultPermissions = [
  // Organization permissions
  {
    name: 'organization:read',
    resource: 'organization',
    action: 'read',
    scope: 'organization',
    description: 'View organization details',
  },
  {
    name: 'organization:update',
    resource: 'organization',
    action: 'update',
    scope: 'organization',
    description: 'Update organization settings',
  },

  // Team permissions
  {
    name: 'team:create',
    resource: 'team',
    action: 'create',
    scope: 'organization',
    description: 'Create teams',
  },
  {
    name: 'team:read',
    resource: 'team',
    action: 'read',
    scope: 'team',
    description: 'View team details',
  },
  {
    name: 'team:update',
    resource: 'team',
    action: 'update',
    scope: 'team',
    description: 'Update team settings',
  },
  {
    name: 'team:delete',
    resource: 'team',
    action: 'delete',
    scope: 'team',
    description: 'Delete teams',
  },
  {
    name: 'team:manage_members',
    resource: 'team',
    action: 'manage_members',
    scope: 'team',
    description: 'Manage team members',
  },
  {
    name: 'team:manage',
    resource: 'team',
    action: 'manage',
    scope: 'organization',
    description: 'Manage teams',
  },

  // User permissions
  {
    name: 'user:create',
    resource: 'user',
    action: 'create',
    scope: 'organization',
    description: 'Create users',
  },
  {
    name: 'user:read',
    resource: 'user',
    action: 'read',
    scope: 'organization',
    description: 'View user details',
  },
  {
    name: 'user:update',
    resource: 'user',
    action: 'update',
    scope: 'organization',
    description: 'Update user information',
  },
  {
    name: 'user:delete',
    resource: 'user',
    action: 'delete',
    scope: 'organization',
    description: 'Delete users',
  },
  {
    name: 'user:manage_roles',
    resource: 'user',
    action: 'manage_roles',
    scope: 'organization',
    description: 'Assign user roles',
  },
  {
    name: 'user:manage',
    resource: 'user',
    action: 'manage',
    scope: 'organization',
    description: 'Manage users',
  },

  // Agent permissions
  {
    name: 'agent:create',
    resource: 'agent',
    action: 'create',
    scope: 'organization',
    description: 'Create target agents',
  },
  {
    name: 'agent:read',
    resource: 'agent',
    action: 'read',
    scope: 'team',
    description: 'View agent details',
  },
  {
    name: 'agent:update',
    resource: 'agent',
    action: 'update',
    scope: 'team',
    description: 'Update agent settings',
  },
  {
    name: 'agent:delete',
    resource: 'agent',
    action: 'delete',
    scope: 'team',
    description: 'Delete agents',
  },
  {
    name: 'agent:test',
    resource: 'agent',
    action: 'test',
    scope: 'team',
    description: 'Test agent connections',
  },

  // Task permissions
  {
    name: 'task:create',
    resource: 'task',
    action: 'create',
    scope: 'organization',
    description: 'Create attack tasks',
  },
  {
    name: 'task:read',
    resource: 'task',
    action: 'read',
    scope: 'team',
    description: 'View task details',
  },
  {
    name: 'task:update',
    resource: 'task',
    action: 'update',
    scope: 'own',
    description: 'Update own tasks',
  },
  {
    name: 'task:delete',
    resource: 'task',
    action: 'delete',
    scope: 'own',
    description: 'Delete own tasks',
  },
  {
    name: 'task:execute',
    resource: 'task',
    action: 'execute',
    scope: 'team',
    description: 'Execute attack tasks',
  },
  {
    name: 'task:manage',
    resource: 'task',
    action: 'manage',
    scope: 'organization',
    description: 'Manage attack tasks',
  },

  // Vulnerability permissions
  {
    name: 'vulnerability:read',
    resource: 'vulnerability',
    action: 'read',
    scope: 'organization',
    description: 'View vulnerabilities',
  },
  {
    name: 'vulnerability:create',
    resource: 'vulnerability',
    action: 'create',
    scope: 'organization',
    description: 'Create vulnerabilities',
  },
  {
    name: 'vulnerability:update',
    resource: 'vulnerability',
    action: 'update',
    scope: 'organization',
    description: 'Update vulnerabilities',
  },
  {
    name: 'vulnerability:delete',
    resource: 'vulnerability',
    action: 'delete',
    scope: 'organization',
    description: 'Delete vulnerabilities',
  },
  {
    name: 'vulnerability:manage',
    resource: 'vulnerability',
    action: 'manage',
    scope: 'organization',
    description: 'Manage vulnerabilities',
  },

  // Report permissions
  {
    name: 'report:read',
    resource: 'report',
    action: 'read',
    scope: 'organization',
    description: 'View reports',
  },
  {
    name: 'report:create',
    resource: 'report',
    action: 'create',
    scope: 'organization',
    description: 'Generate reports',
  },
  {
    name: 'report:delete',
    resource: 'report',
    action: 'delete',
    scope: 'organization',
    description: 'Delete reports',
  },

  // Audit permissions
  {
    name: 'audit:read',
    resource: 'audit',
    action: 'read',
    scope: 'organization',
    description: 'View audit logs',
  },

  // Subscription permissions
  {
    name: 'subscription:read',
    resource: 'subscription',
    action: 'read',
    scope: 'organization',
    description: 'View subscription details',
  },
  {
    name: 'subscription:update',
    resource: 'subscription',
    action: 'update',
    scope: 'organization',
    description: 'Update subscription',
  },

  // System permissions
  {
    name: 'system:read',
    resource: 'system',
    action: 'read',
    scope: 'organization',
    description: 'View system settings',
  },
  {
    name: 'system:update',
    resource: 'system',
    action: 'update',
    scope: 'organization',
    description: 'Update system settings',
  },

  // Dashboard permissions
  {
    name: 'dashboard:read',
    resource: 'dashboard',
    action: 'read',
    scope: 'organization',
    description: 'View dashboard',
  },
];

async function seedPermissions() {
  const db = getDb();
  const dbType = getDbType();

  if (dbType !== 'mysql') {
    console.error('This script only supports MySQL');
    process.exit(1);
  }

  try {
    console.log(`Starting to seed ${defaultPermissions.length} permissions...`);

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const perm of defaultPermissions) {
      try {
        const permId = uuidv4();
        await db.execute(sql`
          INSERT INTO permissions (id, name, resource, action, scope, description, created_at)
          VALUES (${permId}, ${perm.name}, ${perm.resource}, ${perm.action}, ${perm.scope}, ${perm.description}, NOW())
          ON DUPLICATE KEY UPDATE name = name
        `);
        inserted++;
        console.log(`✓ Inserted: ${perm.name}`);
      } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('Duplicate entry')) {
          skipped++;
          console.log(`⊘ Skipped (duplicate): ${perm.name}`);
        } else {
          errors++;
          console.error(`✗ Error inserting ${perm.name}:`, error.message);
        }
      }
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
  } catch (error) {
    console.error('Error seeding permissions:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the seed function
seedPermissions();
