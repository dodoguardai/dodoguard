/**
 * Organizations API Routes
 */

import express from 'express';
import { z } from 'zod';
import { db, getDbType } from '../../../../database';
import { eq, sql } from 'drizzle-orm';
import logger from '../../../../logger';
import { v4 as uuidv4 } from 'uuid';

// Import tables based on database type (lazy load)
let organizationsTable: any;
function getOrganizationsTable() {
  if (!organizationsTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      organizationsTable = mysqlTables.organizationsTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      organizationsTable = pgTables.organizationsTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      organizationsTable = sqliteTables.organizationsTable;
    }
  }
  return organizationsTable;
}

const router = express.Router();

// Create organization schema
const createOrganizationSchema = z.preprocess(
  (data: any) => {
    // Remove empty string and null values before validation
    // Also remove organizationId if present (should not be in create request)
    const cleaned: any = {};
    if (data && typeof data === 'object') {
      Object.keys(data).forEach((key) => {
        // Skip organizationId - it should not be in create requests
        if (key === 'organizationId') {
          logger.warn('organizationId found in create organization request, removing it');
          return;
        }
        const value = data[key];
        // For slug, remove if empty string (backend will generate it)
        if (key === 'slug' && (value === '' || value === null || value === undefined)) {
          logger.debug('Removing empty slug, will be generated from name');
          return;
        }
        // Keep the value if it's not empty string, null, or undefined
        // But allow 0, false, and empty objects/arrays
        if (value !== '' && value !== null && value !== undefined) {
          cleaned[key] = value;
        }
      });
    }
    logger.info('Preprocessed organization data', {
      body: cleaned,
    });
    return cleaned;
  },
  z
    .object({
      name: z.string().min(1, 'Organization name is required'),
      slug: z.string().min(1, 'Slug must be at least 1 character').optional(),
      icon: z.string().optional(),
      planId: z.string().optional().nullable(),
      subscriptionId: z.string().optional().nullable(),
      status: z.enum(['active', 'inactive', 'suspended']).optional(),
      metadata: z.record(z.unknown()).optional().nullable(),
    })
    .strip(),
);

// Update organization schema
const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  icon: z.string().optional(),
  planId: z.string().optional(),
  subscriptionId: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/v1/organizations
 * List organizations
 */
router.get('/', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    const [organization] = await db
      .select()
      .from(getOrganizationsTable())
      .where(eq(getOrganizationsTable().id, organizationId))
      .limit(1);

    res.json({
      success: true,
      data: organization ? [organization] : [],
    });
  } catch (error: any) {
    logger.error('Error listing organizations', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to list organizations',
      },
    });
  }
});

/**
 * GET /api/v1/organizations/:id
 * Get organization by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    if (organizationId !== id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this organization',
        },
      });
    }

    const [organization] = await db
      .select()
      .from(getOrganizationsTable())
      .where(eq(getOrganizationsTable().id, id))
      .limit(1);

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Organization not found',
        },
      });
    }

    res.json({
      success: true,
      data: organization,
    });
  } catch (error: any) {
    logger.error('Error getting organization', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to get organization',
      },
    });
  }
});

/**
 * POST /api/v1/organizations
 * Create new organization
 */
router.post('/', async (req, res) => {
  try {
    logger.info('Create organization request - Headers', {
      headers: req.headers as Record<string, string>,
    });
    logger.info('Create organization request body', { body: req.body });
    logger.info('Create organization request - User', {
      isAuthenticated: !!req.user,
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
    });

    const validatedData = createOrganizationSchema.parse(req.body);
    logger.info('Validated data', { body: validatedData });

    // Generate slug if not provided
    const slug =
      validatedData.slug ||
      validatedData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    // Check if slug already exists
    const existing = await db
      .select()
      .from(getOrganizationsTable())
      .where(eq(getOrganizationsTable().slug, slug))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_SLUG',
          message: 'An organization with this slug already exists',
        },
      });
    }

    const newOrganization = {
      id: uuidv4(),
      name: validatedData.name,
      slug,
      icon: validatedData.icon || 'Building2',
      planId: validatedData.planId || null,
      subscriptionId: validatedData.subscriptionId || null,
      status: validatedData.status || 'active',
      metadata: validatedData.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    logger.info('Inserting organization', { body: newOrganization });
    try {
      await db.insert(getOrganizationsTable()).values(newOrganization);
      logger.info('Organization inserted successfully');
    } catch (insertError: any) {
      logger.error('Database insert error:', insertError);
      throw insertError;
    }

    res.status(201).json({
      success: true,
      data: newOrganization,
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

    logger.error('Error creating organization:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create organization',
      },
    });
  }
});

/**
 * PUT /api/v1/organizations/:id
 * Update organization
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    if (organizationId !== id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this organization',
        },
      });
    }

    const validatedData = updateOrganizationSchema.parse(req.body);

    // Check if organization exists
    const [existing] = await db
      .select()
      .from(getOrganizationsTable())
      .where(eq(getOrganizationsTable().id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Organization not found',
        },
      });
    }

    // Check slug uniqueness if slug is being updated
    if (validatedData.slug && validatedData.slug !== existing.slug) {
      const slugExists = await db
        .select()
        .from(getOrganizationsTable())
        .where(eq(getOrganizationsTable().slug, validatedData.slug))
        .limit(1);

      if (slugExists.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'DUPLICATE_SLUG',
            message: 'An organization with this slug already exists',
          },
        });
      }
    }

    const updateData: any = {
      ...validatedData,
      updatedAt: new Date(),
    };

    await db
      .update(getOrganizationsTable())
      .set(updateData)
      .where(eq(getOrganizationsTable().id, id));

    const [updated] = await db
      .select()
      .from(getOrganizationsTable())
      .where(eq(getOrganizationsTable().id, id))
      .limit(1);

    res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors,
        },
      });
    }

    logger.error('Error updating organization:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to update organization',
      },
    });
  }
});

/**
 * DELETE /api/v1/organizations/:id
 * Delete organization
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    if (organizationId !== id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this organization',
        },
      });
    }

    const [existing] = await db
      .select()
      .from(getOrganizationsTable())
      .where(eq(getOrganizationsTable().id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Organization not found',
        },
      });
    }

    await db.delete(getOrganizationsTable()).where(eq(getOrganizationsTable().id, id));

    res.json({
      success: true,
      data: { id },
    });
  } catch (error: any) {
    logger.error('Error deleting organization:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to delete organization',
      },
    });
  }
});

/**
 * POST /api/v1/organizations/add-icon-column
 * Temporary endpoint to add icon column to organizations table
 * This is a one-time migration script
 */
router.post('/add-icon-column', async (_req, res) => {
  try {
    const dbType = getDbType();

    if (dbType !== 'mysql') {
      return res.status(400).json({
        success: false,
        error: { code: 'UNSUPPORTED_DB', message: 'This migration only supports MySQL' },
      });
    }

    // Execute ALTER TABLE to add icon column
    try {
      await db.execute(sql`ALTER TABLE organizations ADD COLUMN icon TEXT AFTER slug`);
      logger.info('Successfully added icon column to organizations table');
    } catch (alterError: any) {
      // If column already exists, that's okay
      if (
        alterError.code === 'ER_DUP_FIELDNAME' ||
        alterError.message?.includes('Duplicate column name')
      ) {
        logger.info('Icon column already exists in organizations table');
      } else {
        throw alterError;
      }
    }

    // Update existing organizations to have default icon
    try {
      await db.execute(sql`UPDATE organizations SET icon = 'Building2' WHERE icon IS NULL`);
      logger.info('Successfully updated existing organizations with default icon');
    } catch (updateError: any) {
      logger.warn('Error updating existing organizations:', updateError);
      // Don't fail if update fails
    }

    res.json({
      success: true,
      message: 'Icon column added successfully to organizations table',
    });
  } catch (error) {
    logger.error('Error adding icon column:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to add icon column',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

export default router;
