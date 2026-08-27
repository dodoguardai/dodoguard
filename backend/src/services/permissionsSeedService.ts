/**
 * Seed default permissions into the database.
 * Used by authenticated POST /api/v1/permissions/seed and CLI scripts.
 *
 * Descriptions follow the current product modules (asset governance, assessments,
 * risk closed-loop, reports, etc.). Existing rows are upserted so wording stays current.
 */

import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../database';
import logger from '../logger';

export type DefaultPermission = {
  name: string;
  resource: string;
  action: string;
  scope: string;
  description?: string;
};

export const DEFAULT_PERMISSIONS: DefaultPermission[] = [
  // Workbench
  {
    name: 'dashboard:read',
    resource: 'dashboard',
    action: 'read',
    scope: 'organization',
    description: 'View Security Overview and My Todos workbench',
  },

  // Assessments / tasks (dialogue, compliance, MCP, SKILLS, toolbox, case libs)
  {
    name: 'task:create',
    resource: 'task',
    action: 'create',
    scope: 'organization',
    description: 'Create security assessment and probe tasks',
  },
  {
    name: 'task:read',
    resource: 'task',
    action: 'read',
    scope: 'team',
    description: 'View assessment tasks, probe runs, and case libraries',
  },
  {
    name: 'task:update',
    resource: 'task',
    action: 'update',
    scope: 'own',
    description: 'Update own assessment and probe tasks',
  },
  {
    name: 'task:delete',
    resource: 'task',
    action: 'delete',
    scope: 'own',
    description: 'Delete own assessment and probe tasks',
  },
  {
    name: 'task:execute',
    resource: 'task',
    action: 'execute',
    scope: 'team',
    description: 'Execute assessment, patrol, and expert-toolbox probes',
  },
  {
    name: 'task:manage',
    resource: 'task',
    action: 'manage',
    scope: 'organization',
    description:
      'Manage assessments (dialogue / compliance / MCP / SKILLS / config audit), case libraries, launch monitoring, and expert toolbox',
  },

  // Asset agents
  {
    name: 'agent:create',
    resource: 'agent',
    action: 'create',
    scope: 'organization',
    description: 'Create and claim managed Agent assets',
  },
  {
    name: 'agent:read',
    resource: 'agent',
    action: 'read',
    scope: 'team',
    description: 'View Agent ledger, profiles, and admission status',
  },
  {
    name: 'agent:update',
    resource: 'agent',
    action: 'update',
    scope: 'team',
    description: 'Update Agent assets, ownership, and admission',
  },
  {
    name: 'agent:delete',
    resource: 'agent',
    action: 'delete',
    scope: 'team',
    description: 'Delete or retire managed Agent assets',
  },
  {
    name: 'agent:test',
    resource: 'agent',
    action: 'test',
    scope: 'team',
    description: 'Probe Agent runtime connectivity',
  },

  // Risk closed-loop (legacy key: vulnerability)
  {
    name: 'vulnerability:read',
    resource: 'vulnerability',
    action: 'read',
    scope: 'organization',
    description: 'View open risks and remediation workbench items',
  },
  {
    name: 'vulnerability:create',
    resource: 'vulnerability',
    action: 'create',
    scope: 'organization',
    description: 'Create or push risks into the remediation workbench',
  },
  {
    name: 'vulnerability:update',
    resource: 'vulnerability',
    action: 'update',
    scope: 'organization',
    description: 'Update remediation status, evidence, and ownership',
  },
  {
    name: 'vulnerability:delete',
    resource: 'vulnerability',
    action: 'delete',
    scope: 'organization',
    description: 'Delete remediation or risk records',
  },
  {
    name: 'vulnerability:manage',
    resource: 'vulnerability',
    action: 'manage',
    scope: 'organization',
    description: 'Manage risk closed-loop: remediation, retest, and closure',
  },

  // Reports & audit
  {
    name: 'report:read',
    resource: 'report',
    action: 'read',
    scope: 'organization',
    description: 'View audit center and assessment reports',
  },
  {
    name: 'report:create',
    resource: 'report',
    action: 'create',
    scope: 'organization',
    description: 'Generate technical, compliance, and manual reports',
  },
  {
    name: 'report:delete',
    resource: 'report',
    action: 'delete',
    scope: 'organization',
    description: 'Delete reports',
  },
  {
    name: 'audit:read',
    resource: 'audit',
    action: 'read',
    scope: 'organization',
    description: 'View audit trails and governance activity logs',
  },

  // Org / team / user
  {
    name: 'organization:read',
    resource: 'organization',
    action: 'read',
    scope: 'organization',
    description: 'View organization profile and members',
  },
  {
    name: 'organization:update',
    resource: 'organization',
    action: 'update',
    scope: 'organization',
    description: 'Update organization settings',
  },
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
    description: 'Manage all teams in the organization',
  },
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
    description: 'View user profiles',
  },
  {
    name: 'user:update',
    resource: 'user',
    action: 'update',
    scope: 'organization',
    description: 'Update user profiles and status',
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
    description: 'Assign roles and manage the permission catalog',
  },
  {
    name: 'user:manage',
    resource: 'user',
    action: 'manage',
    scope: 'organization',
    description: 'Manage users under User & Role Management',
  },

  // Subscription & system
  {
    name: 'subscription:read',
    resource: 'subscription',
    action: 'read',
    scope: 'organization',
    description: 'View subscription plans and billing status',
  },
  {
    name: 'subscription:update',
    resource: 'subscription',
    action: 'update',
    scope: 'organization',
    description: 'Change subscription plan',
  },
  {
    name: 'system:read',
    resource: 'system',
    action: 'read',
    scope: 'organization',
    description: 'View system settings, models, and Agent ownership',
  },
  {
    name: 'system:update',
    resource: 'system',
    action: 'update',
    scope: 'organization',
    description: 'Update system settings and model integrations',
  },
];

function getPermissionsTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../database/tables-mysql');
    return mysqlTables.permissionsTable;
  }
  const pgTables = require('../database/tables-enterprise');
  return pgTables.permissionsTable;
}

export type SeedPermissionsResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  total: number;
};

export async function seedDefaultPermissions(): Promise<SeedPermissionsResult> {
  const permissionsTable = getPermissionsTable();
  if (!permissionsTable) {
    throw new Error('Permissions table not found');
  }

  logger.info(`Starting to seed ${DEFAULT_PERMISSIONS.length} permissions`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const perm of DEFAULT_PERMISSIONS) {
    try {
      const [existing] = await db
        .select()
        .from(permissionsTable)
        .where(eq(permissionsTable.name, perm.name))
        .limit(1);

      if (existing) {
        const needsUpdate =
          existing.description !== (perm.description ?? null) ||
          existing.resource !== perm.resource ||
          existing.action !== perm.action ||
          existing.scope !== perm.scope;

        if (needsUpdate) {
          await db
            .update(permissionsTable)
            .set({
              resource: perm.resource,
              action: perm.action,
              scope: perm.scope,
              description: perm.description ?? null,
            })
            .where(eq(permissionsTable.name, perm.name));
          updated++;
          logger.info(`  ✓ Updated: ${perm.name}`);
        } else {
          skipped++;
          logger.info(`  → Unchanged: ${perm.name}`);
        }
        continue;
      }

      await db.insert(permissionsTable).values({
        id: uuidv4(),
        name: perm.name,
        resource: perm.resource,
        action: perm.action,
        scope: perm.scope,
        description: perm.description ?? null,
      });
      inserted++;
      logger.info(`  ✓ Inserted: ${perm.name}`);
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const isDuplicate =
        err.code === 'ER_DUP_ENTRY' ||
        err.message?.includes('Duplicate entry') ||
        err.message?.includes('UNIQUE constraint') ||
        err.message?.includes('unique constraint');
      if (isDuplicate) {
        skipped++;
        logger.info(`  → Skipped (duplicate): ${perm.name}`);
      } else {
        errors++;
        logger.error(`  → Failed to upsert ${perm.name}:`, {
          message: err.message ?? String(error),
        });
      }
    }
  }

  logger.info(
    `Seeded permissions: ${inserted} inserted, ${updated} updated, ${skipped} unchanged, ${errors} errors`,
  );

  return {
    inserted,
    updated,
    skipped,
    errors,
    total: DEFAULT_PERMISSIONS.length,
  };
}
