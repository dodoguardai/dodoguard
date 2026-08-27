/**
 * Roles API Routes
 */

import express from 'express';
import { z } from 'zod';
import { db, getDbType } from '../../../../database';
import { eq, and, desc, or, like, } from 'drizzle-orm';
import logger from '../../../../logger';
import { v4 as uuidv4 } from 'uuid';

// Import tables based on database type (lazy load)
let rolesTable: any;
let permissionsTable: any;
let organizationsTable: any;

function getOrganizationsTable() {
  if (!organizationsTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      organizationsTable = mysqlTables.organizationsTable;
    } else {
      const pgTables = require('../../../../database/tables-enterprise');
      organizationsTable = pgTables.organizationsTable;
    }
  }
  return organizationsTable;
}

function getRolesTable() {
  if (!rolesTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      rolesTable = mysqlTables.rolesTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      rolesTable = pgTables.rolesTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      rolesTable = sqliteTables.rolesTable;
    }
  }
  return rolesTable;
}

function _getPermissionsTable() {
  if (!permissionsTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      permissionsTable = mysqlTables.permissionsTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      permissionsTable = pgTables.permissionsTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      permissionsTable = sqliteTables.permissionsTable;
    }
  }
  return permissionsTable;
}

const router = express.Router();

// System roles live in a well-known "global" organization (see 003_seed_initial_data.sql)
const SYSTEM_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';

const SYSTEM_ROLES = [
  {
    name: 'admin',
    description: 'Administrator with full access',
    type: 'system',
    permissions: ['*'],
    isDefault: false,
  },
  {
    name: 'member',
    description: 'Standard member with basic permissions',
    type: 'system',
    permissions: [
      'organization:read',
      'team:read',
      'user:read',
      'agent:read',
      'task:create',
      'task:read',
      'task:update',
      'task:delete',
      'report:read',
      'audit:read',
    ],
    isDefault: true,
  },
  {
    name: 'security_analyst',
    description: 'Security analyst with read and execute permissions',
    type: 'system',
    permissions: [
      'organization:read',
      'team:read',
      'user:read',
      'agent:read',
      'agent:test',
      'task:create',
      'task:read',
      'task:execute',
      'vulnerability:read',
      'report:read',
      'report:create',
      'audit:read',
      'subscription:read',
    ],
    isDefault: false,
  },
];

async function seedSystemRolesIfMissing(): Promise<void> {
  const table = getRolesTable();
  if (!table) { return; }

  const orgTable = getOrganizationsTable();
  if (orgTable) {
    const [sysOrg] = await db
      .select()
      .from(orgTable)
      .where(eq(orgTable.id, SYSTEM_ORGANIZATION_ID))
      .limit(1);
    if (!sysOrg) {
      try {
        await db.insert(orgTable).values({
          id: SYSTEM_ORGANIZATION_ID,
          name: 'System',
          slug: 'system-reserved',
          status: 'active',
        } as any);
        logger.info('Created system organization for system roles');
      } catch (e: any) {
        if (
          e?.code !== 'ER_DUP_ENTRY' &&
          !e?.message?.includes('Duplicate') &&
          !e?.message?.includes('unique')
        ) {
          logger.warn('Could not create system organization:', e?.message);
        }
      }
    }
  }

  const existing = await db
    .select({ name: table.name })
    .from(table)
    .where(eq(table.organizationId, SYSTEM_ORGANIZATION_ID));
  const existingNames = new Set((existing || []).map((r: any) => r.name));
  for (const def of SYSTEM_ROLES) {
    if (existingNames.has(def.name)) { continue; }
    try {
      await db.insert(table).values({
        id: uuidv4(),
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: def.name,
        description: def.description,
        type: def.type,
        permissions: def.permissions,
        isDefault: def.isDefault ?? false,
        metadata: {},
      });
      existingNames.add(def.name);
      logger.info(`Seeded system role: ${def.name}`);
    } catch (err: any) {
      const isDup =
        err?.code === 'ER_DUP_ENTRY' ||
        err?.message?.includes('Duplicate') ||
        err?.message?.includes('unique constraint');
      if (isDup) { existingNames.add(def.name); }
      else { logger.warn(`Failed to seed role ${def.name}:`, err?.message); }
    }
  }
}

// Create role schema
const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  isDefault: z.boolean().optional().default(false),
});

// Update role schema
const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

/**
 * GET /api/v1/roles
 * List roles in organization
 */
router.get('/', async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const table = getRolesTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Org-scoped roles
    const orgConditions: any[] = [eq(table.organizationId, organizationId)];
    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.trim()}%`;
      orgConditions.push(or(like(table.name, term), like(table.description, term)));
    }
    const orgRoles = await db
      .select()
      .from(table)
      .where(and(...orgConditions))
      .orderBy(desc(table.createdAt));

    // System roles (so every org can assign admin/member/security_analyst)
    const systemConditions: any[] = [eq(table.organizationId, SYSTEM_ORGANIZATION_ID)];
    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.trim()}%`;
      systemConditions.push(or(like(table.name, term), like(table.description, term)));
    }
    let systemRoles = await db
      .select()
      .from(table)
      .where(and(...systemConditions))
      .orderBy(desc(table.createdAt));

    // If no system roles exist, seed them so admin/member/security_analyst appear
    if (systemRoles.length === 0) {
      await seedSystemRolesIfMissing();
      systemRoles = await db
        .select()
        .from(table)
        .where(and(...systemConditions))
        .orderBy(desc(table.createdAt));
    }

    // Merge: system roles first, then org roles; dedupe by id
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const r of systemRoles) {
      const id = String(r.id);
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(r);
      }
    }
    for (const r of orgRoles) {
      const id = String(r.id);
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(r);
      }
    }
    merged.sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });

    const total = merged.length;
    const data = merged.slice(offsetNum, offsetNum + limitNum);

    res.json({
      success: true,
      data: {
        data,
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total,
      },
    });
  } catch (error: any) {
    logger.error('Error listing roles:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to list roles',
      },
    });
  }
});

/**
 * GET /api/v1/roles/:id
 * Get role by ID (org role or system role)
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const table = getRolesTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Allow role from current org or system org (so system roles can be viewed)
    const [role] = await db
      .select()
      .from(table)
      .where(
        and(
          eq(table.id, id),
          or(
            eq(table.organizationId, organizationId),
            eq(table.organizationId, SYSTEM_ORGANIZATION_ID),
          ),
        ),
      )
      .limit(1);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROLE_NOT_FOUND',
          message: 'Role not found',
        },
      });
    }

    res.json({
      success: true,
      data: role,
    });
  } catch (error: any) {
    logger.error('Error getting role:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to get role',
      },
    });
  }
});

/**
 * POST /api/v1/roles
 * Create new role
 */
router.post('/', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const validatedData = createRoleSchema.parse(req.body);
    const table = getRolesTable();

    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Check if role name already exists in organization
    const [existing] = await db
      .select()
      .from(table)
      .where(and(eq(table.name, validatedData.name), eq(table.organizationId, organizationId)))
      .limit(1);

    if (existing) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_ROLE',
          message: 'A role with this name already exists in this organization',
        },
      });
    }

    const newRole = {
      id: uuidv4(),
      organizationId,
      name: validatedData.name,
      description: validatedData.description || null,
      type: 'custom',
      permissions: validatedData.permissions || [],
      isDefault: validatedData.isDefault || false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(table).values(newRole);

    res.status(201).json({
      success: true,
      data: newRole,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.error('Validation error:', error.errors);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors,
        },
      });
    }

    logger.error('Error creating role:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create role',
      },
    });
  }
});

/**
 * PUT /api/v1/roles/:id
 * Update role
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const validatedData = updateRoleSchema.parse(req.body);
    const table = getRolesTable();

    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Check if role exists and belongs to organization
    const [existing] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROLE_NOT_FOUND',
          message: 'Role not found',
        },
      });
    }

    // Don't allow updating system roles
    if (existing.type === 'system') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SYSTEM_ROLE',
          message: 'System roles cannot be modified',
        },
      });
    }

    // Check if name is being changed and if new name already exists
    if (validatedData.name && validatedData.name !== existing.name) {
      const [nameConflict] = await db
        .select()
        .from(table)
        .where(and(eq(table.name, validatedData.name), eq(table.organizationId, organizationId)))
        .limit(1);

      if (nameConflict) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'DUPLICATE_ROLE',
            message: 'A role with this name already exists in this organization',
          },
        });
      }
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (validatedData.name !== undefined) {
      updateData.name = validatedData.name;
    }
    if (validatedData.description !== undefined) {
      updateData.description = validatedData.description;
    }
    if (validatedData.permissions !== undefined) {
      updateData.permissions = validatedData.permissions;
    }
    if (validatedData.isDefault !== undefined) {
      updateData.isDefault = validatedData.isDefault;
    }

    await db
      .update(table)
      .set(updateData)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)));

    const [updated] = await db.select().from(table).where(eq(table.id, id)).limit(1);

    res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.error('Validation error:', error.errors);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors,
        },
      });
    }

    logger.error('Error updating role:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to update role',
      },
    });
  }
});

/**
 * DELETE /api/v1/roles/:id
 * Delete role
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const table = getRolesTable();

    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Check if role exists and belongs to organization
    const [existing] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROLE_NOT_FOUND',
          message: 'Role not found',
        },
      });
    }

    // Don't allow deleting system roles
    if (existing.type === 'system') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SYSTEM_ROLE',
          message: 'System roles cannot be deleted',
        },
      });
    }

    await db.delete(table).where(and(eq(table.id, id), eq(table.organizationId, organizationId)));

    res.json({
      success: true,
      data: { id },
    });
  } catch (error: any) {
    logger.error('Error deleting role:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to delete role',
      },
    });
  }
});

/**
 * GET /api/v1/roles/:id/permissions
 * Get role permissions
 */
router.get('/:id/permissions', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const table = getRolesTable();

    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Allow role from current org or system org (so system role permissions can be viewed)
    const [role] = await db
      .select()
      .from(table)
      .where(
        and(
          eq(table.id, id),
          or(
            eq(table.organizationId, organizationId),
            eq(table.organizationId, SYSTEM_ORGANIZATION_ID),
          ),
        ),
      )
      .limit(1);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROLE_NOT_FOUND',
          message: 'Role not found',
        },
      });
    }

    res.json({
      success: true,
      data: role.permissions || [],
    });
  } catch (error: any) {
    logger.error('Error getting role permissions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to get role permissions',
      },
    });
  }
});

export default router;
