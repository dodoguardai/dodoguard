/**
 * Current user (me) API routes
 * GET /me - current user profile
 * PATCH /me - update profile (name, avatar)
 * POST /me/password - change password
 * GET /me/permissions - permission names for the current user
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db, getDbType } from '../../../../database';
import { eq, and } from 'drizzle-orm';
import logger from '../../../../logger';

const SYSTEM_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';

let rolesTable: any;
let usersTable: any;

function getRolesTable() {
  if (!rolesTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      rolesTable = mysqlTables.rolesTable;
    } else {
      const pgTables = require('../../../../database/tables-enterprise');
      rolesTable = pgTables.rolesTable;
    }
  }
  return rolesTable;
}

function getUsersTable() {
  if (!usersTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      usersTable = mysqlTables.usersTable;
    } else {
      const pgTables = require('../../../../database/tables-enterprise');
      usersTable = pgTables.usersTable;
    }
  }
  return usersTable;
}

function toPublicUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    name: row.name ?? '',
    avatar: row.avatar ?? undefined,
    role: row.role ?? '',
    status: row.status ?? 'active',
    emailVerified: Boolean(row.emailVerified),
    mfaEnabled: Boolean(row.mfaEnabled),
    lastLoginAt: row.lastLoginAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  avatar: z.string().trim().url().max(500).nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const router = express.Router();

/**
 * GET /api/v1/me
 */
router.get('/', async (req, res) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.id) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'User not authenticated' },
      });
    }

    const table = getUsersTable();
    const [row] = await db.select().from(table).where(eq(table.id, authUser.id)).limit(1);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    return res.json({ success: true, data: toPublicUser(row) });
  } catch (error: any) {
    logger.error('Error getting current user profile:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to get profile',
      },
    });
  }
});

/**
 * PATCH /api/v1/me
 */
router.patch('/', async (req, res) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.id) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'User not authenticated' },
      });
    }

    const parsed = updateProfileSchema.parse(req.body ?? {});
    if (parsed.name === undefined && parsed.avatar === undefined) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No profile fields to update' },
      });
    }

    const table = getUsersTable();
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.name !== undefined) {
      updateValues.name = parsed.name;
    }
    if (parsed.avatar !== undefined) {
      updateValues.avatar = parsed.avatar;
    }

    await db.update(table).set(updateValues).where(eq(table.id, authUser.id));

    const [row] = await db.select().from(table).where(eq(table.id, authUser.id)).limit(1);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    return res.json({ success: true, data: toPublicUser(row) });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message, details: error.issues },
      });
    }
    logger.error('Error updating current user profile:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to update profile',
      },
    });
  }
});

/**
 * POST /api/v1/me/password
 */
router.post('/password', async (req, res) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.id) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'User not authenticated' },
      });
    }

    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body ?? {});
    const table = getUsersTable();
    const [row] = await db.select().from(table).where(eq(table.id, authUser.id)).limit(1);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    if (!row.passwordHash) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PASSWORD_NOT_SET',
          message: 'Password login is not available for this account',
        },
      });
    }

    const ok = await bcrypt.compare(currentPassword, row.passwordHash);
    if (!ok) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect',
        },
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(table)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(table.id, authUser.id));

    logger.info(`Password changed for user: ${row.email} (${row.id})`);
    return res.json({ success: true, data: { message: 'Password updated' } });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message, details: error.issues },
      });
    }
    logger.error('Error changing current user password:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to change password',
      },
    });
  }
});

/**
 * GET /api/v1/me/permissions
 * Returns the current user's permission names (from their role).
 * Used by frontend to show/hide sidebar and enforce route guards.
 */
router.get('/permissions', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'User not authenticated' },
      });
    }

    // Specific admin email: always grant all permissions (regardless of DB role)
    if (user.email === 'admin@126.com') {
      return res.json({
        success: true,
        data: { permissions: ['*'] },
      });
    }

    const organizationId = user.organizationId;
    const roleName = (user.role || 'member').toString().trim();
    const roleNameLower = roleName.toLowerCase();

    // Admin role: grant all permissions so UI and API both allow full access
    if (roleNameLower === 'admin') {
      return res.json({
        success: true,
        data: { permissions: ['*'] },
      });
    }

    const table = getRolesTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database table not initialized',
        },
      });
    }

    // Look up role: prefer current org, then system org
    let [role] = await db
      .select()
      .from(table)
      .where(and(eq(table.name, roleName), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!role) {
      [role] = await db
        .select()
        .from(table)
        .where(and(eq(table.name, roleName), eq(table.organizationId, SYSTEM_ORGANIZATION_ID)))
        .limit(1);
    }

    let permissions: string[] = [];
    if (role && Array.isArray(role.permissions)) {
      permissions = role.permissions as string[];
    } else if (role && typeof role.permissions === 'object' && role.permissions !== null) {
      permissions = Object.keys(role.permissions).length ? (role.permissions as string[]) : [];
    }

    res.json({
      success: true,
      data: { permissions },
    });
  } catch (error: any) {
    logger.error('Error getting current user permissions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to get permissions',
      },
    });
  }
});

export default router;
