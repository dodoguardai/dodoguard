/**
 * Permissions API Routes
 */

import express from 'express';
import { db, getDbType } from '../../../../database';
import { eq, desc } from 'drizzle-orm';
import logger from '../../../../logger';
import { seedDefaultPermissions } from '../../../../services/permissionsSeedService';

// Import tables based on database type (lazy load)
let permissionsTable: any;

function getPermissionsTable() {
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

/**
 * GET /api/v1/permissions
 * List all available permissions
 */
router.get('/', async (_req, res) => {
  try {
    const table = getPermissionsTable();

    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    const permissions = await db.select().from(table).orderBy(desc(table.createdAt));

    logger.info(`Found ${permissions.length} permissions in database`);

    // Log first permission for debugging (sanitized structured context)
    if (permissions.length > 0) {
      logger.debug('Sample permission', { body: permissions[0] });
    }

    res.json({
      success: true,
      data: permissions,
    });
  } catch (error: any) {
    logger.error('Error listing permissions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to list permissions',
      },
    });
  }
});

/**
 * POST /api/v1/permissions/seed
 * Seed default permissions (requires authentication and user:manage_roles).
 */
router.post('/seed', async (req, res) => {
  try {
    const user = (req as express.Request & { user?: { userId: string; organizationId: string } })
      .user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'User not authenticated' },
      });
    }

    const { permissionsService } = await import('../../../../services/permissionsService');
    const hasPermission = await permissionsService.hasPermission({
      userId: user.userId,
      organizationId: user.organizationId,
      resource: 'user',
      action: 'manage_roles',
    });

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to seed permissions',
        },
      });
    }

    const result = await seedDefaultPermissions();

    if (
      result.inserted === 0 &&
      result.updated === 0 &&
      result.skipped === 0 &&
      result.errors === 0
    ) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'NO_PERMISSIONS_PROCESSED',
          message: 'No permissions were processed. Check server logs for details.',
          details: result,
        },
      });
    }

    res.json({
      success: true,
      message: `Permissions seeded: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} unchanged, ${result.errors} errors`,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to seed permissions';
    logger.error('Error seeding permissions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message,
      },
    });
  }
});

/**
 * GET /api/v1/permissions/:id
 * Get permission by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const table = getPermissionsTable();

    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    const [permission] = await db.select().from(table).where(eq(table.id, id)).limit(1);

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PERMISSION_NOT_FOUND',
          message: 'Permission not found',
        },
      });
    }

    res.json({
      success: true,
      data: permission,
    });
  } catch (error: any) {
    logger.error('Error getting permission:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to get permission',
      },
    });
  }
});

export default router;
