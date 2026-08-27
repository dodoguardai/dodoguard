/**
 * Vulnerabilities API Routes
 */

import express from 'express';
import { z } from 'zod';
import { db, getDbType } from '../../../../database';
import { eq, and, desc, or, like, sql, inArray, lt } from 'drizzle-orm';
import logger from '../../../../logger';
import { v4 as uuidv4 } from 'uuid';
import { getVulnerabilityTypeStrategy } from '../../../vulnerabilities/factory';
import {
  CreateVulnerabilityInput,
  UpdateVulnerabilityInput,
  VulnerabilityContext,
  VulnerabilityRecord,
  VulnerabilityType,
} from '../../../vulnerabilities/types';

// Import tables based on database type (lazy load)
let vulnerabilitiesTable: any;
let usersTable: any;

function getVulnerabilitiesTable() {
  if (!vulnerabilitiesTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      vulnerabilitiesTable = mysqlTables.vulnerabilitiesTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      vulnerabilitiesTable = pgTables.vulnerabilitiesTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      vulnerabilitiesTable = sqliteTables.vulnerabilitiesTable;
    }
  }
  return vulnerabilitiesTable;
}

/** MySQL only: enabled attack_commands per vulnerability (what a task run will execute). */
export async function attachEnabledAttackCommandCounts(vulnerabilities: Record<string, unknown>[]) {
  if (getDbType() !== 'mysql' || vulnerabilities.length === 0) {
    return;
  }
  try {
    const mysqlTables = require('../../../../database/tables-mysql');
    const attackCommandsTable = mysqlTables.attackCommandsTable;
    if (!attackCommandsTable) {
      return;
    }
    const ids = vulnerabilities
      .map((v) => v.id)
      .filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) {
      return;
    }
    const rows = await db
      .select({
        vulnerabilityId: attackCommandsTable.vulnerabilityId,
        n: sql<number>`count(*)`,
      })
      .from(attackCommandsTable)
      .where(
        and(
          inArray(attackCommandsTable.vulnerabilityId, ids),
          eq(attackCommandsTable.enabled, true),
        ),
      )
      .groupBy(attackCommandsTable.vulnerabilityId);
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(String(row.vulnerabilityId), Number(row.n));
    }
    for (const v of vulnerabilities) {
      const id = typeof v.id === 'string' ? v.id : '';
      v.enabledAttackCommandCount = id ? (map.get(id) ?? 0) : 0;
    }
  } catch (err) {
    logger.warn('attachEnabledAttackCommandCounts skipped', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function getUsersTable() {
  if (!usersTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      usersTable = mysqlTables.usersTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      usersTable = pgTables.usersTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      usersTable = sqliteTables.usersTable;
    }
  }
  return usersTable;
}

// Helper function to get user info by ID
async function getUserInfo(userId: string | null | undefined) {
  if (!userId) { return null; }

  const table = getUsersTable();
  if (!table) { return null; }

  try {
    const [user] = await db
      .select({ id: table.id, name: table.name, email: table.email })
      .from(table)
      .where(eq(table.id, userId))
      .limit(1);

    return user || null;
  } catch (error) {
    logger.error('Error fetching user info:', error);
    return null;
  }
}

const router = express.Router();

/** MySQL DECIMAL / driver quirks often return CVSS as string; normalize for JSON/clients. */
function coerceCvssScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/** Coerce JSON columns for API JSON (shared with external integration list/detail). */
export function parseVulnerabilityJsonFields(
  vuln: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...vuln,
    cvssScore: coerceCvssScore(vuln.cvssScore),
    tags: vuln.tags
      ? typeof vuln.tags === 'string'
        ? JSON.parse(vuln.tags as string)
        : vuln.tags
      : [],
    affectedTargets: vuln.affectedTargets
      ? typeof vuln.affectedTargets === 'string'
        ? JSON.parse(vuln.affectedTargets as string)
        : vuln.affectedTargets
      : [],
    owaspLlmTop10Mapping: vuln.owaspLlmTop10Mapping
      ? typeof vuln.owaspLlmTop10Mapping === 'string'
        ? JSON.parse(vuln.owaspLlmTop10Mapping as string)
        : vuln.owaspLlmTop10Mapping
      : null,
    exploitability: vuln.exploitability
      ? typeof vuln.exploitability === 'string'
        ? JSON.parse(vuln.exploitability as string)
        : vuln.exploitability
      : null,
    patchStatus: vuln.patchStatus
      ? typeof vuln.patchStatus === 'string'
        ? JSON.parse(vuln.patchStatus as string)
        : vuln.patchStatus
      : null,
    metadata: vuln.metadata
      ? typeof vuln.metadata === 'string'
        ? JSON.parse(vuln.metadata as string)
        : vuln.metadata
      : null,
  };
}

// Create vulnerability schema
const createVulnerabilitySchema = z.object({
  avdId: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(['agent', 'mcp', 'llm', 'tool', 'platform', 'dify', 'coze', 'fastgpt']),
  category: z.string().min(1),
  riskLevel: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['discovered', 'confirmed', 'patched', 'archived']).optional(),
  disclosedAt: z.string().optional(),
  description: z.string().min(1),
  affectedTargets: z
    .array(
      z.object({
        type: z.string(),
        versions: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  impactScope: z.string().min(1),
  cweId: z.string().optional(),
  mitreId: z.string().optional(),
  owaspId: z.string().optional(),
  owaspLlmTop10Mapping: z.record(z.unknown()).optional(),
  exploitability: z.record(z.unknown()).optional(),
  patchStatus: z.record(z.unknown()).optional(),
  auditNotes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Update vulnerability schema
const updateVulnerabilitySchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  riskLevel: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  status: z.enum(['discovered', 'confirmed', 'patched', 'archived']).optional(),
  description: z.string().optional(),
  affectedTargets: z
    .array(
      z.object({
        type: z.string(),
        versions: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  impactScope: z.string().optional(),
  cweId: z.string().optional(),
  mitreId: z.string().optional(),
  owaspId: z.string().optional(),
  owaspLlmTop10Mapping: z.record(z.unknown()).optional(),
  exploitability: z.record(z.unknown()).optional(),
  patchStatus: z.record(z.unknown()).optional(),
  auditNotes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/v1/vulnerabilities
 * List vulnerabilities
 */
router.get('/', async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      search,
      type,
      riskLevel,
      category,
      status,
      verificationMode,
      verificationModeStrict,
      createdBefore,
      idContains,
    } = req.query;

    const table = getVulnerabilitiesTable();
    if (!table) {
      logger.error('vulnerabilitiesTable is undefined');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    let query = db.select().from(table);

    // Apply filters
    const conditions: any[] = [];

    if (search && typeof search === 'string') {
      conditions.push(
        or(
          like(table.name, `%${search}%`),
          like(table.description, `%${search}%`),
          like(table.avdId, `%${search}%`),
          like(table.id, `%${search}%`),
        ),
      );
    }

    if (idContains && typeof idContains === 'string' && idContains.trim()) {
      conditions.push(like(table.id, `%${idContains.trim()}%`));
    }

    if (type && typeof type === 'string') {
      conditions.push(eq(table.type, type));
    }

    if (riskLevel && typeof riskLevel === 'string') {
      conditions.push(eq(table.riskLevel, riskLevel));
    }

    if (category && typeof category === 'string') {
      conditions.push(like(table.category, `%${category}%`));
    }

    if (status && typeof status === 'string') {
      conditions.push(eq(table.status, status));
    }

    if (verificationMode && typeof verificationMode === 'string') {
      // 兼容历史种子值：config_only/runtime_required/... 与新语义值共存
      if (verificationMode === 'graybox_api_combined') {
        // Dify 灰盒+API 黑盒任务：同时可选配置审计类与运行时 API 黑盒类漏洞
        conditions.push(
          or(
            eq(table.verificationMode, 'config_audit'),
            eq(table.verificationMode, 'config_only'),
            eq(table.verificationMode, 'api_blackbox'),
            eq(table.verificationMode, 'runtime_required'),
            eq(table.verificationMode, 'config_plus_runtime'),
            eq(table.verificationMode, 'optional_runtime'),
            eq(table.verificationMode, 'hybrid'),
          ),
        );
      } else if (verificationMode === 'config_audit') {
        conditions.push(
          or(eq(table.verificationMode, 'config_audit'), eq(table.verificationMode, 'config_only')),
        );
      } else if (verificationMode === 'api_blackbox') {
        const strictMode = verificationModeStrict === 'true' || verificationModeStrict === '1';
        if (strictMode) {
          conditions.push(eq(table.verificationMode, 'api_blackbox'));
        } else {
          conditions.push(
            or(
              eq(table.verificationMode, 'api_blackbox'),
              eq(table.verificationMode, 'runtime_required'),
              eq(table.verificationMode, 'config_plus_runtime'),
              eq(table.verificationMode, 'optional_runtime'),
              eq(table.verificationMode, 'hybrid'),
            ),
          );
        }
      } else {
        conditions.push(eq(table.verificationMode, verificationMode));
      }
    }

    if (createdBefore && typeof createdBefore === 'string' && createdBefore.trim()) {
      const cutoff = new Date(createdBefore.trim());
      if (!Number.isNaN(cutoff.getTime())) {
        conditions.push(lt(table.createdAt, cutoff));
      }
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply pagination
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    const vulnerabilities = await query
      .orderBy(desc(table.createdAt))
      .limit(limitNum)
      .offset(offsetNum);

    // Parse JSON fields for each vulnerability and get user info
    const parsedVulnerabilities = await Promise.all(
      vulnerabilities.map(async (vuln) => {
        const parsed: any = parseVulnerabilityJsonFields(vuln as Record<string, unknown>);

        // Get user information for createdBy and updatedBy
        const createdByUser = await getUserInfo(vuln.createdBy);
        const updatedByUser = await getUserInfo(vuln.updatedBy);

        if (createdByUser) {
          parsed.createdByUser = {
            id: createdByUser.id,
            name: createdByUser.name,
            email: createdByUser.email,
          };
        }

        if (updatedByUser) {
          parsed.updatedByUser = {
            id: updatedByUser.id,
            name: updatedByUser.name,
            email: updatedByUser.email,
          };
        }

        return parsed;
      }),
    );

    await attachEnabledAttackCommandCounts(parsedVulnerabilities);

    // Get total count
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(table);
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions));
    }
    const [{ count: total }] = await countQuery;

    res.json({
      success: true,
      data: {
        data: parsedVulnerabilities,
        total: Number(total),
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < Number(total),
      },
    });
  } catch (error) {
    logger.error('List vulnerabilities error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list vulnerabilities',
      },
    });
  }
});

/**
 * GET /api/v1/vulnerabilities/:id
 * Get vulnerability by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const table = getVulnerabilitiesTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    const [vulnerability] = await db.select().from(table).where(eq(table.id, id)).limit(1);

    if (!vulnerability) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Vulnerability not found' },
      });
    }

    const parsedVulnerability: any = parseVulnerabilityJsonFields(
      vulnerability as Record<string, unknown>,
    );

    // Get user information for createdBy and updatedBy
    const createdByUser = await getUserInfo(vulnerability.createdBy);
    const updatedByUser = await getUserInfo(vulnerability.updatedBy);

    if (createdByUser) {
      parsedVulnerability.createdByUser = {
        id: createdByUser.id,
        name: createdByUser.name,
        email: createdByUser.email,
      };
    }

    if (updatedByUser) {
      parsedVulnerability.updatedByUser = {
        id: updatedByUser.id,
        name: updatedByUser.name,
        email: updatedByUser.email,
      };
    }

    res.json({
      success: true,
      data: parsedVulnerability,
    });
  } catch (error) {
    logger.error('Get vulnerability error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get vulnerability',
      },
    });
  }
});

/**
 * POST /api/v1/vulnerabilities
 * Create new vulnerability
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.id;

    const vulnerabilityData = createVulnerabilitySchema.parse(req.body) as CreateVulnerabilityInput;

    const table = getVulnerabilitiesTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    const vulnerabilityId = uuidv4();

    const strategy = getVulnerabilityTypeStrategy(vulnerabilityData.type as VulnerabilityType);
    const context: VulnerabilityContext = { userId };
    const { insertValues } = strategy.normalizeCreate(vulnerabilityData, context);

    insertValues.id = vulnerabilityId;

    // Insert vulnerability (MySQL doesn't support .returning())
    try {
      await db.insert(table).values(insertValues);
    } catch (insertError: any) {
      logger.error('Insert vulnerability error', { error: insertError });
      logger.error('Insert values', { body: insertValues });
      throw insertError;
    }

    // Fetch the created vulnerability
    const [createdVulnerability] = await db
      .select()
      .from(table)
      .where(eq(table.id, vulnerabilityId))
      .limit(1);

    // Parse JSON fields
    const parsedVulnerability = {
      ...createdVulnerability,
      tags: createdVulnerability.tags
        ? typeof createdVulnerability.tags === 'string'
          ? JSON.parse(createdVulnerability.tags)
          : createdVulnerability.tags
        : [],
      affectedTargets: createdVulnerability.affectedTargets
        ? typeof createdVulnerability.affectedTargets === 'string'
          ? JSON.parse(createdVulnerability.affectedTargets)
          : createdVulnerability.affectedTargets
        : [],
      owaspLlmTop10Mapping: createdVulnerability.owaspLlmTop10Mapping
        ? typeof createdVulnerability.owaspLlmTop10Mapping === 'string'
          ? JSON.parse(createdVulnerability.owaspLlmTop10Mapping)
          : createdVulnerability.owaspLlmTop10Mapping
        : null,
      exploitability: createdVulnerability.exploitability
        ? typeof createdVulnerability.exploitability === 'string'
          ? JSON.parse(createdVulnerability.exploitability)
          : createdVulnerability.exploitability
        : null,
      patchStatus: createdVulnerability.patchStatus
        ? typeof createdVulnerability.patchStatus === 'string'
          ? JSON.parse(createdVulnerability.patchStatus)
          : createdVulnerability.patchStatus
        : null,
      metadata: createdVulnerability.metadata
        ? typeof createdVulnerability.metadata === 'string'
          ? JSON.parse(createdVulnerability.metadata)
          : createdVulnerability.metadata
        : null,
    };

    res.status(201).json({
      success: true,
      data: parsedVulnerability,
    });
  } catch (error) {
    logger.error('Create vulnerability error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      });
    }

    // Log detailed error information
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails: any = {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    };

    // Extract MySQL error code and message if available
    if (error && typeof error === 'object' && 'code' in error) {
      errorDetails.code = (error as any).code;
    }
    if (error && typeof error === 'object' && 'errno' in error) {
      errorDetails.errno = (error as any).errno;
    }
    if (error && typeof error === 'object' && 'sqlMessage' in error) {
      errorDetails.sqlMessage = (error as any).sqlMessage;
    }
    if (error && typeof error === 'object' && 'sqlState' in error) {
      errorDetails.sqlState = (error as any).sqlState;
    }

    logger.error('Create vulnerability detailed error:', errorDetails);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create vulnerability',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
    });
  }
});

/**
 * PUT /api/v1/vulnerabilities/:id
 * Update vulnerability
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const updateData = updateVulnerabilitySchema.parse(req.body) as UpdateVulnerabilityInput;

    const table = getVulnerabilitiesTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    const [existing] = await db.select().from(table).where(eq(table.id, id)).limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Vulnerability not found' },
      });
    }

    const strategy = getVulnerabilityTypeStrategy(existing.type as VulnerabilityType);
    const context: VulnerabilityContext = { userId };
    const { updateValues } = strategy.normalizeUpdate(
      {
        id: existing.id,
        type: existing.type as VulnerabilityType,
        category: existing.category,
        riskLevel: existing.riskLevel,
      } as VulnerabilityRecord,
      updateData,
      context,
    );

    // Update vulnerability
    await db.update(table).set(updateValues).where(eq(table.id, id));

    // Fetch the updated vulnerability
    const [updatedVulnerability] = await db.select().from(table).where(eq(table.id, id)).limit(1);

    // Parse JSON fields
    const parsedVulnerability = {
      ...updatedVulnerability,
      tags: updatedVulnerability.tags
        ? typeof updatedVulnerability.tags === 'string'
          ? JSON.parse(updatedVulnerability.tags)
          : updatedVulnerability.tags
        : [],
      affectedTargets: updatedVulnerability.affectedTargets
        ? typeof updatedVulnerability.affectedTargets === 'string'
          ? JSON.parse(updatedVulnerability.affectedTargets)
          : updatedVulnerability.affectedTargets
        : [],
      owaspLlmTop10Mapping: updatedVulnerability.owaspLlmTop10Mapping
        ? typeof updatedVulnerability.owaspLlmTop10Mapping === 'string'
          ? JSON.parse(updatedVulnerability.owaspLlmTop10Mapping)
          : updatedVulnerability.owaspLlmTop10Mapping
        : null,
      exploitability: updatedVulnerability.exploitability
        ? typeof updatedVulnerability.exploitability === 'string'
          ? JSON.parse(updatedVulnerability.exploitability)
          : updatedVulnerability.exploitability
        : null,
      patchStatus: updatedVulnerability.patchStatus
        ? typeof updatedVulnerability.patchStatus === 'string'
          ? JSON.parse(updatedVulnerability.patchStatus)
          : updatedVulnerability.patchStatus
        : null,
      metadata: updatedVulnerability.metadata
        ? typeof updatedVulnerability.metadata === 'string'
          ? JSON.parse(updatedVulnerability.metadata)
          : updatedVulnerability.metadata
        : null,
    };

    res.json({
      success: true,
      data: parsedVulnerability,
    });
  } catch (error) {
    logger.error('Update vulnerability error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update vulnerability',
      },
    });
  }
});

/**
 * DELETE /api/v1/vulnerabilities/:id
 * Delete vulnerability
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const table = getVulnerabilitiesTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }

    // Check if vulnerability exists
    const [existing] = await db.select().from(table).where(eq(table.id, id)).limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Vulnerability not found' },
      });
    }

    // Delete vulnerability
    await db.delete(table).where(eq(table.id, id));

    res.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    logger.error('Delete vulnerability error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete vulnerability',
      },
    });
  }
});

export default router;
