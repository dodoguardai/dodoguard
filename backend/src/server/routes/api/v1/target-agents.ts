/**
 * Target Agents API Routes
 */

import express from 'express';
import { z } from 'zod';
import { db, getDbType } from '../../../../database';
import { eq, and, desc, or, like, sql, inArray } from 'drizzle-orm';
import logger from '../../../../logger';
import { v4 as uuidv4 } from 'uuid';
import { quotaService } from '../../../../services/quotaService';
import { createTargetAgentClient } from '../../../agents/factory';
import { TargetAgentClientContext, TargetAgentRecord } from '../../../agents/types';
import { probeApiAgentConnection } from '../../../../services/attackTaskAgentExecution';

// Import tables based on database type (lazy load)
let targetAgentsTable: any;
function getTargetAgentsTable() {
  if (!targetAgentsTable) {
    const dbType = getDbType();
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      targetAgentsTable = mysqlTables.targetAgentsTable;
    } else if (dbType === 'postgres') {
      const pgTables = require('../../../../database/tables-enterprise');
      targetAgentsTable = pgTables.targetAgentsTable;
    } else {
      const sqliteTables = require('../../../../database/tables-enterprise');
      targetAgentsTable = sqliteTables.targetAgentsTable;
    }
  }
  return targetAgentsTable;
}

function requireOrganizationId(req: express.Request, res: express.Response): string | null {
  const organizationId = (req as express.Request & { user?: { organizationId?: string } }).user
    ?.organizationId;
  if (!organizationId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      },
    });
    return null;
  }
  return organizationId;
}

const router = express.Router();

// Create target agent schema
const createAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum([
    'dify',
    'coze',
    'n8n',
    'fastgpt',
    'tencent-adp',
    'api',
    'api-stream',
    'langchain',
    'custom',
    'other',
  ]),
  icon: z.string().optional(),
  config: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

// Update target agent schema
const updateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z
    .enum([
      'dify',
      'coze',
      'n8n',
      'fastgpt',
      'tencent-adp',
      'api',
      'api-stream',
      'langchain',
      'custom',
      'other',
    ])
    .optional(),
  config: z.record(z.unknown()).optional(),
  icon: z.string().optional(),
  status: z.enum(['active', 'inactive', 'testing', 'error']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/v1/target-agents
 * List target agents
 */
router.get('/', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    const { limit = 50, offset = 0, search, type, status } = req.query;

    const table = getTargetAgentsTable();
    if (!table) {
      logger.error('targetAgentsTable is undefined');
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database table not initialized',
        },
      });
    }

    const whereConditions = [eq(table.organizationId, organizationId)];

    if (search) {
      whereConditions.push(
        or(like(table.name, `%${search}%`), like(table.description, `%${search}%`)),
      );
    }

    if (type) {
      whereConditions.push(eq(table.type, type as string));
    }

    if (status) {
      whereConditions.push(eq(table.status, status as string));
    }

    const agents = await db
      .select()
      .from(table)
      .where(and(...whereConditions))
      .limit(Number(limit))
      .offset(Number(offset))
      .orderBy(desc(table.createdAt));

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(and(...whereConditions));

    const totalCount = Number(total[0]?.count ?? 0);
    const hasMore = Number(offset) + agents.length < totalCount;

    // Attach statistics (totalAttacks, successfulAttacks, vulnerabilitiesFound) per agent for list cards
    const agentIds = agents.map((a) => a.id);
    const statsByAgentId: Record<
      string,
      { totalAttacks: number; successfulAttacks: number; vulnerabilitiesFound: number }
    > = {};
    for (const id of agentIds) {
      statsByAgentId[id] = { totalAttacks: 0, successfulAttacks: 0, vulnerabilitiesFound: 0 };
    }
    const dbType = getDbType();
    let attackTasksTable: any;
    let attackResultsTable: any;
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      attackTasksTable = mysqlTables.attackTasksTable;
      attackResultsTable = mysqlTables.attackResultsTable;
    } else {
      const pgTables = require('../../../../database/tables-enterprise');
      attackTasksTable = pgTables.attackTasksTable;
      attackResultsTable = pgTables.attackResultsTable;
    }
    if (attackTasksTable && agentIds.length > 0) {
      try {
        if (dbType === 'mysql') {
          const [rows] = (await db.execute(sql`
            SELECT id, status,
              JSON_UNQUOTE(JSON_EXTRACT(target_config, '$.agentId')) as agentId
            FROM attack_tasks
            WHERE organization_id = ${organizationId}
              AND target_type = 'agent'
          `)) as [any[], any];
          const arr = Array.isArray(rows) ? rows : ((rows as any)?.[0] ?? []);
          const agentIdSet = new Set(agentIds);
          const taskToAgent: Record<string, string> = {};
          for (const r of arr) {
            const aid = (r as any).agentId;
            if (aid && agentIdSet.has(aid)) {
              const tid = (r as any).id;
              taskToAgent[tid] = aid;
              statsByAgentId[aid] = statsByAgentId[aid] || {
                totalAttacks: 0,
                successfulAttacks: 0,
                vulnerabilitiesFound: 0,
              };
              statsByAgentId[aid].totalAttacks += 1;
              if ((r as any).status === 'completed') {
                statsByAgentId[aid].successfulAttacks += 1;
              }
            }
          }
          const taskIds = Object.keys(taskToAgent);
          if (attackResultsTable && taskIds.length > 0) {
            const vulnerableResults = await db
              .select({
                taskId: attackResultsTable.taskId,
                id: attackResultsTable.id,
                vulnerabilityId: attackResultsTable.vulnerabilityId,
              })
              .from(attackResultsTable)
              .where(
                and(
                  inArray(attackResultsTable.taskId, taskIds),
                  sql`JSON_UNQUOTE(JSON_EXTRACT(${attackResultsTable.finalVerdict}, '$.vulnerable')) = 'true'`,
                ),
              );
            // Count distinct vulnerabilities per agent (same vuln in multiple results = 1)
            const distinctVulnsByAgent: Record<string, Set<string>> = {};
            for (const row of vulnerableResults) {
              const aid = taskToAgent[row.taskId];
              if (!aid) {
                continue;
              }
              if (!distinctVulnsByAgent[aid]) {
                distinctVulnsByAgent[aid] = new Set();
              }
              distinctVulnsByAgent[aid].add(row.vulnerabilityId || row.id);
            }
            for (const aid of Object.keys(distinctVulnsByAgent)) {
              statsByAgentId[aid].vulnerabilitiesFound = distinctVulnsByAgent[aid].size;
            }
          }
        } else {
          const tasks = await db
            .select({
              id: attackTasksTable.id,
              status: attackTasksTable.status,
              targetConfig: attackTasksTable.targetConfig,
            })
            .from(attackTasksTable)
            .where(
              and(
                eq(attackTasksTable.organizationId, organizationId),
                eq(attackTasksTable.targetType, 'agent'),
              ),
            );
          const agentIdSet = new Set(agentIds);
          const taskToAgent: Record<string, string> = {};
          for (const t of tasks) {
            const aid = (t.targetConfig as any)?.agentId;
            if (aid && agentIdSet.has(aid)) {
              taskToAgent[t.id] = aid;
              statsByAgentId[aid] = statsByAgentId[aid] || {
                totalAttacks: 0,
                successfulAttacks: 0,
                vulnerabilitiesFound: 0,
              };
              statsByAgentId[aid].totalAttacks += 1;
              if (t.status === 'completed') {
                statsByAgentId[aid].successfulAttacks += 1;
              }
            }
          }
          const taskIds = Object.keys(taskToAgent);
          if (attackResultsTable && taskIds.length > 0) {
            const vulnerableResults = await db
              .select({
                taskId: attackResultsTable.taskId,
                id: attackResultsTable.id,
                vulnerabilityId: attackResultsTable.vulnerabilityId,
              })
              .from(attackResultsTable)
              .where(
                and(
                  inArray(attackResultsTable.taskId, taskIds),
                  sql`(${attackResultsTable.finalVerdict}->>'vulnerable')::boolean = true`,
                ),
              );
            // Count distinct vulnerabilities per agent (same vuln in multiple results = 1)
            const distinctVulnsByAgent: Record<string, Set<string>> = {};
            for (const row of vulnerableResults) {
              const aid = taskToAgent[row.taskId];
              if (!aid) {
                continue;
              }
              if (!distinctVulnsByAgent[aid]) {
                distinctVulnsByAgent[aid] = new Set();
              }
              distinctVulnsByAgent[aid].add(row.vulnerabilityId || row.id);
            }
            for (const aid of Object.keys(distinctVulnsByAgent)) {
              statsByAgentId[aid].vulnerabilitiesFound = distinctVulnsByAgent[aid].size;
            }
          }
        }
      } catch (statErr: any) {
        logger.warn('Computing list agent statistics failed:', { message: statErr?.message });
      }
    }

    const agentsWithStats = agents.map((a) => ({
      ...a,
      statistics: statsByAgentId[a.id] || {
        totalAttacks: 0,
        successfulAttacks: 0,
        vulnerabilitiesFound: 0,
      },
    }));

    res.json({
      success: true,
      data: {
        data: agentsWithStats,
        total: totalCount,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: hasMore,
      },
    });
  } catch (error: any) {
    logger.error('List target agents error:', error);
    logger.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to list target agents',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
    });
  }
});

/**
 * POST /api/v1/target-agents
 * Create new target agent
 */
router.post('/', async (req, res) => {
  try {
    logger.info('Create agent request received:', {
      body: req.body,
      user: req.user?.id,
    });

    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    const agentData = createAgentSchema.parse(req.body);
    logger.info('Parsed agent data:', agentData);

    // Check quota before creating agent
    try {
      const quotaCheck = await quotaService.checkQuota(organizationId, 'targetAgents', 1);
      if (!quotaCheck.allowed) {
        logger.warn(
          `Quota exceeded for organization ${organizationId}: targetAgents ${quotaCheck.currentUsage}/${quotaCheck.limit}`,
        );
        return res.status(403).json({
          success: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: `智能体数量配额已满。当前使用: ${quotaCheck.currentUsage}/${quotaCheck.limit === -1 ? '无限制' : quotaCheck.limit}。请升级套餐或删除现有智能体。`,
            details: {
              metric: 'targetAgents',
              currentUsage: quotaCheck.currentUsage,
              limit: quotaCheck.limit,
              remaining: quotaCheck.remaining,
            },
          },
        });
      }
      logger.info(
        `Quota check passed: targetAgents ${quotaCheck.currentUsage + 1}/${quotaCheck.limit === -1 ? 'unlimited' : quotaCheck.limit}`,
      );
    } catch (quotaError: any) {
      logger.error('Quota check error:', quotaError);
      // If quota check fails, we can still allow creation but log the error
      // Or we can block it - let's block it for safety
      return res.status(500).json({
        success: false,
        error: {
          code: 'QUOTA_CHECK_FAILED',
          message: '配额检查失败，无法创建智能体',
          details: quotaError?.message,
        },
      });
    }

    const agentId = uuidv4();

    const table = getTargetAgentsTable();
    if (!table) {
      logger.error('targetAgentsTable is undefined');
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database table not initialized',
        },
      });
    }

    // MySQL doesn't support .returning(), so we need to insert and then select
    // Prepare values - ensure JSON fields are properly formatted
    const insertValues: any = {
      id: agentId,
      name: agentData.name,
      description: agentData.description || null,
      type: agentData.type,
      icon: agentData.icon || 'Monitor', // Store icon in dedicated column
      organizationId,
      teamId: null,
      // Ensure config is a valid object (not null/undefined)
      config: agentData.config && typeof agentData.config === 'object' ? agentData.config : {},
      // metadata can be null
      metadata:
        agentData.metadata &&
        typeof agentData.metadata === 'object' &&
        Object.keys(agentData.metadata).length > 0
          ? agentData.metadata
          : null,
      status: 'active', // Default status
      healthStatus: null,
      statistics: {
        totalAttacks: 0,
        successfulAttacks: 0,
        vulnerabilitiesFound: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    logger.info('Inserting agent with values', { body: insertValues });

    try {
      await db.insert(table).values(insertValues);
      logger.info('Agent inserted successfully');
    } catch (insertError: any) {
      logger.error('Database insert error:', insertError);
      logger.error('Insert error details:', {
        message: insertError?.message,
        code: insertError?.code,
        sql: insertError?.sql,
        sqlMessage: insertError?.sqlMessage,
      });
      throw insertError;
    }

    logger.info('Fetching created agent...');

    // Fetch the created agent
    const [newAgent] = await db.select().from(table).where(eq(table.id, agentId)).limit(1);

    if (!newAgent) {
      logger.error('Agent not found after creation, agentId', { agentId });
      return res.status(500).json({
        success: false,
        error: {
          code: 'CREATION_FAILED',
          message: 'Agent was created but could not be retrieved',
        },
      });
    }

    logger.info('Agent created and fetched successfully:', {
      id: newAgent.id,
      name: newAgent.name,
    });

    // Record usage after successful creation
    try {
      await quotaService.recordUsage(organizationId, 'targetAgents', 1, {
        agentId: newAgent.id,
        agentName: newAgent.name,
      });
      logger.info(`Usage recorded for agent creation: ${organizationId} - targetAgents +1`);
    } catch (usageError) {
      // Log error but don't fail the request since agent was already created
      logger.error('Failed to record usage after agent creation:', usageError);
    }

    res.status(201).json({
      success: true,
      data: newAgent,
    });
  } catch (error: any) {
    logger.error('Create target agent error:', error);
    logger.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
    });

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
        message: error?.message || 'Failed to create target agent',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
    });
  }
});

const probeCommercialApiSchema = z.object({
  type: z.enum(['api', 'api-stream']),
  config: z.object({
    apiBaseUrl: z.string().min(1),
    chatPath: z.string().optional(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
    inputs: z.record(z.unknown()).optional(),
    authType: z.enum(['api_key', 'basic', 'header', 'oauth']).optional(),
    authHeaderName: z.string().optional(),
    additionalHeaders: z.record(z.string()).optional(),
  }),
});

const testAgentConnectionSchema = z.object({
  /** Draft config from the edit form; merged over saved config for this test only. */
  config: z.record(z.unknown()).optional(),
});

/**
 * POST /api/v1/target-agents/probe-commercial-api
 * Test Custom API connectivity without persisting an agent (POST chat probe).
 */
router.post('/probe-commercial-api', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    const parsed = probeCommercialApiSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join('; '),
        },
      });
    }

    const result = await probeApiAgentConnection({
      agentType: parsed.data.type,
      agentConfig: parsed.data.config as Record<string, unknown>,
    });

    return res.json({ success: true, data: result });
  } catch (error: unknown) {
    logger.error('Probe commercial API error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to probe API connection',
      },
    });
  }
});

/**
 * GET /api/v1/target-agents/:id
 * Get target agent by ID
 */
router.get('/:id/attacks', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    const table = getTargetAgentsTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database table not initialized' },
      });
    }
    const [agent] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { code: 'AGENT_NOT_FOUND', message: 'Target agent not found' },
      });
    }

    const dbType = getDbType();
    let attackTasksTable: any;
    let attackResultsTable: any;
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      attackTasksTable = mysqlTables.attackTasksTable;
      attackResultsTable = mysqlTables.attackResultsTable;
    } else {
      const pgTables = require('../../../../database/tables-enterprise');
      attackTasksTable = pgTables.attackTasksTable;
      attackResultsTable = pgTables.attackResultsTable;
    }
    if (!attackTasksTable) {
      return res.json({
        success: true,
        data: { data: [], total: 0, limit: 20, offset: 0, hasMore: false },
      });
    }

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    let totalCount = 0;
    let tasksForAgent: any[];
    if (dbType === 'mysql') {
      const [countRows] = (await db.execute(sql`
        SELECT COUNT(*) as total FROM attack_tasks
        WHERE organization_id = ${organizationId}
          AND target_type = 'agent'
          AND JSON_UNQUOTE(JSON_EXTRACT(target_config, '$.agentId')) = ${id}
      `)) as [any[], any];
      const countArr = Array.isArray(countRows) ? countRows : ((countRows as any)?.[0] ?? []);
      totalCount = Number((countArr[0] as any)?.total ?? 0);
      const [rows] = (await db.execute(sql`
        SELECT id, name, status, created_at as createdAt, updated_at as updatedAt
        FROM attack_tasks
        WHERE organization_id = ${organizationId}
          AND target_type = 'agent'
          AND JSON_UNQUOTE(JSON_EXTRACT(target_config, '$.agentId')) = ${id}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `)) as [any[], any];
      const arr = Array.isArray(rows) ? rows : ((rows as any)?.[0] ?? []);
      tasksForAgent = arr.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    } else {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(attackTasksTable)
        .where(
          and(
            eq(attackTasksTable.organizationId, organizationId),
            eq(attackTasksTable.targetType, 'agent'),
            sql`${attackTasksTable.targetConfig}->>'agentId' = ${id}`,
          ),
        );
      totalCount = Number((countResult[0] as any)?.count ?? 0);
      const tasks = await db
        .select({
          id: attackTasksTable.id,
          name: attackTasksTable.name,
          status: attackTasksTable.status,
          createdAt: attackTasksTable.createdAt,
          updatedAt: attackTasksTable.updatedAt,
        })
        .from(attackTasksTable)
        .where(
          and(
            eq(attackTasksTable.organizationId, organizationId),
            eq(attackTasksTable.targetType, 'agent'),
            sql`${attackTasksTable.targetConfig}->>'agentId' = ${id}`,
          ),
        )
        .orderBy(desc(attackTasksTable.createdAt))
        .limit(limit)
        .offset(offset);
      tasksForAgent = tasks;
    }

    const taskIds = tasksForAgent.map((t) => t.id);
    const vulnCountByTask: Record<string, number> = {};
    const vulnIdsByTask: Record<string, string[]> = {};
    if (attackResultsTable && taskIds.length > 0) {
      const results = await db
        .select({
          taskId: attackResultsTable.taskId,
          vulnerabilityId: attackResultsTable.vulnerabilityId,
          finalVerdict: attackResultsTable.finalVerdict,
        })
        .from(attackResultsTable)
        .where(inArray(attackResultsTable.taskId, taskIds));
      for (const r of results) {
        const verdict = r.finalVerdict as any;
        const vulnerable =
          verdict && (verdict.vulnerable === true || verdict.vulnerable === 'true');
        if (vulnerable && r.vulnerabilityId) {
          vulnIdsByTask[r.taskId] = vulnIdsByTask[r.taskId] || [];
          vulnIdsByTask[r.taskId].push(r.vulnerabilityId);
        }
        if (vulnerable) {
          vulnCountByTask[r.taskId] = (vulnCountByTask[r.taskId] || 0) + 1;
        }
      }
    }

    const history = tasksForAgent.map((t) => {
      const start = t.createdAt ? new Date(t.createdAt).getTime() : 0;
      const end = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
      const duration = end && start ? Math.round((end - start) / 1000) : 0;
      return {
        id: t.id,
        agentId: id,
        taskId: t.id,
        taskName: t.name || '',
        status: t.status || 'pending',
        vulnerabilitiesFound: vulnIdsByTask[t.id] || [],
        startTime: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
        endTime: t.updatedAt ? new Date(t.updatedAt).toISOString() : undefined,
        duration,
        createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
      };
    });

    res.json({
      success: true,
      data: {
        data: history,
        total: totalCount,
        limit,
        offset,
        hasMore: offset + history.length < totalCount,
      },
    });
  } catch (error: any) {
    logger.error('Get agent attack history error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to get attack history',
      },
    });
  }
});

/**
 * GET /api/v1/target-agents/:id
 * Get target agent by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    const table = getTargetAgentsTable();
    if (!table) {
      logger.error('targetAgentsTable is undefined');
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database table not initialized',
        },
      });
    }

    const [agent] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!agent) {
      logger.warn(`Agent not found: id=${id}, organizationId=${organizationId}`);
      return res.status(404).json({
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: 'Target agent not found',
        },
      });
    }

    const dbType = getDbType();
    let attackTasksTable: any;
    let attackResultsTable: any;
    if (dbType === 'mysql') {
      const mysqlTables = require('../../../../database/tables-mysql');
      attackTasksTable = mysqlTables.attackTasksTable;
      attackResultsTable = mysqlTables.attackResultsTable;
    } else {
      const pgTables = require('../../../../database/tables-enterprise');
      attackTasksTable = pgTables.attackTasksTable;
      attackResultsTable = pgTables.attackResultsTable;
    }

    let statistics = (agent as any).statistics || {
      totalAttacks: 0,
      successfulAttacks: 0,
      vulnerabilitiesFound: 0,
    };
    if (attackTasksTable) {
      try {
        if (dbType === 'mysql') {
          const [countRows] = (await db.execute(sql`
            SELECT COUNT(*) as total FROM attack_tasks
            WHERE organization_id = ${organizationId}
              AND target_type = 'agent'
              AND JSON_UNQUOTE(JSON_EXTRACT(target_config, '$.agentId')) = ${id}
          `)) as [any[], any];
          const totalAttacks = Number(
            (Array.isArray(countRows) ? countRows[0] : (countRows as any)?.[0]?.[0])?.total ?? 0,
          );
          const [completedRows] = (await db.execute(sql`
            SELECT COUNT(*) as total FROM attack_tasks
            WHERE organization_id = ${organizationId}
              AND target_type = 'agent'
              AND JSON_UNQUOTE(JSON_EXTRACT(target_config, '$.agentId')) = ${id}
              AND status = 'completed'
          `)) as [any[], any];
          const successfulAttacks = Number(
            (Array.isArray(completedRows) ? completedRows[0] : (completedRows as any)?.[0]?.[0])
              ?.total ?? 0,
          );
          let vulnerabilitiesFound = 0;
          if (attackResultsTable) {
            const [vulnResult] = (await db.execute(sql`
              SELECT COUNT(DISTINCT COALESCE(ar.vulnerability_id, ar.id)) as cnt
              FROM attack_results ar
              INNER JOIN attack_tasks at ON ar.task_id = at.id
              WHERE at.organization_id = ${organizationId}
                AND at.target_type = 'agent'
                AND JSON_UNQUOTE(JSON_EXTRACT(at.target_config, '$.agentId')) = ${id}
                AND JSON_UNQUOTE(JSON_EXTRACT(ar.final_verdict, '$.vulnerable')) = 'true'
            `)) as [any[], any];
            const vulnRows = Array.isArray(vulnResult) ? vulnResult : (vulnResult as any)?.[0];
            const first = Array.isArray(vulnRows) ? vulnRows[0] : vulnRows;
            vulnerabilitiesFound = Number((first as any)?.cnt ?? 0);
          }
          statistics = { totalAttacks, successfulAttacks, vulnerabilitiesFound };
        } else {
          const tasks = await db
            .select({ id: attackTasksTable.id })
            .from(attackTasksTable)
            .where(
              and(
                eq(attackTasksTable.organizationId, organizationId),
                eq(attackTasksTable.targetType, 'agent'),
                sql`${attackTasksTable.targetConfig}->>'agentId' = ${id}`,
              ),
            );
          const totalAttacks = tasks.length;
          const completed = await db
            .select({ id: attackTasksTable.id })
            .from(attackTasksTable)
            .where(
              and(
                eq(attackTasksTable.organizationId, organizationId),
                eq(attackTasksTable.targetType, 'agent'),
                sql`${attackTasksTable.targetConfig}->>'agentId' = ${id}`,
                eq(attackTasksTable.status, 'completed'),
              ),
            );
          const successfulAttacks = completed.length;
          const taskIds = tasks.map((t) => t.id);
          let vulnerabilitiesFound = 0;
          if (attackResultsTable && taskIds.length > 0) {
            const distinctCount = await db
              .select({
                count: sql<number>`COUNT(DISTINCT COALESCE(${attackResultsTable.vulnerabilityId}, ${attackResultsTable.id}))::int`,
              })
              .from(attackResultsTable)
              .where(
                and(
                  inArray(attackResultsTable.taskId, taskIds),
                  sql`(${attackResultsTable.finalVerdict}->>'vulnerable')::boolean = true`,
                ),
              );
            vulnerabilitiesFound = Number((distinctCount[0] as any)?.count ?? 0);
          }
          statistics = { totalAttacks, successfulAttacks, vulnerabilitiesFound };
        }
      } catch (statErr: any) {
        logger.warn('Computing agent statistics failed:', { message: statErr?.message });
      }
    }

    const agentWithStats = { ...agent, statistics };

    logger.info(`Agent retrieved: id=${id}, name=${agent.name}`);
    res.json({
      success: true,
      data: agentWithStats,
    });
  } catch (error: any) {
    logger.error('Get target agent error:', error);
    logger.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to get target agent',
      },
    });
  }
});

/**
 * PUT /api/v1/target-agents/:id
 * Update target agent
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    logger.info('Update agent request received:', {
      id,
      body: req.body,
      user: req.user?.id,
    });

    const updates = updateAgentSchema.parse(req.body);
    logger.info('Parsed update data:', updates);

    const table = getTargetAgentsTable();
    if (!table) {
      logger.error('targetAgentsTable is undefined');
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database table not initialized',
        },
      });
    }

    // Prepare update data - ensure JSON fields are properly formatted
    const updateData: any = {
      ...updates,
      updatedAt: new Date(),
    };

    // Ensure config is a valid object (not null/undefined)
    if (updates.config) {
      // Deep clone config to avoid mutating the original
      const config =
        typeof updates.config === 'object' && updates.config !== null ? { ...updates.config } : {};

      // Ensure inputs is properly formatted if present
      if (config.inputs !== undefined) {
        if (typeof config.inputs === 'string') {
          // Try to parse JSON string
          if (config.inputs.trim() === '') {
            // Empty string means no inputs
            delete config.inputs;
          } else {
            try {
              const parsed = JSON.parse(config.inputs);
              if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
                config.inputs = parsed;
              } else {
                // Invalid format, remove it
                delete config.inputs;
              }
            } catch (e) {
              // Invalid JSON, remove it
              logger.warn('Invalid JSON in inputs field, removing:', e);
              delete config.inputs;
            }
          }
        } else if (config.inputs === null) {
          // Null means no inputs
          delete config.inputs;
        } else if (typeof config.inputs !== 'object' || Array.isArray(config.inputs)) {
          // Invalid type, remove it
          delete config.inputs;
        }
        // If inputs is a valid object, keep it as is
      }

      updateData.config = config;
    }

    // Ensure metadata is properly formatted
    if (updates.metadata !== undefined) {
      updateData.metadata =
        updates.metadata &&
        typeof updates.metadata === 'object' &&
        Object.keys(updates.metadata).length > 0
          ? updates.metadata
          : null;
    }

    logger.info('Update data prepared:', updateData);

    // MySQL doesn't support .returning(), so we need to update and then select
    await db
      .update(table)
      .set(updateData)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)));

    // Fetch the updated agent
    const [updatedAgent] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!updatedAgent) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: 'Target agent not found',
        },
      });
    }

    res.json({
      success: true,
      data: updatedAgent,
    });
  } catch (error: any) {
    logger.error('Update target agent error:', error);
    logger.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
    });

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
        message: error?.message || 'Failed to update target agent',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
    });
  }
});

/**
 * DELETE /api/v1/target-agents/:id
 * Delete target agent
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    const table = getTargetAgentsTable();
    if (!table) {
      logger.error('targetAgentsTable is undefined');
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database table not initialized',
        },
      });
    }

    // First, check if the agent exists
    const [existingAgent] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!existingAgent) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: 'Target agent not found',
        },
      });
    }

    // Delete the agent
    const dbType = getDbType();
    if (dbType === 'mysql') {
      // MySQL doesn't return rowCount, so we check existence first (done above)
      await db.delete(table).where(and(eq(table.id, id), eq(table.organizationId, organizationId)));
    } else {
      // PostgreSQL/SQLite
      const result = await db
        .delete(table)
        .where(and(eq(table.id, id), eq(table.organizationId, organizationId)));

      // For PostgreSQL, check result.rowsAffected or result.rowCount
      // For SQLite, check result.changes
      if (dbType === 'postgres' && (result as any).rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: 'Target agent not found',
          },
        });
      } else if (dbType === 'sqlite' && (result as any).changes === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: 'Target agent not found',
          },
        });
      }
    }

    logger.info(`Target agent deleted: ${id}`);
    res.json({
      success: true,
      message: 'Target agent deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete target agent error:', error);
    logger.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to delete target agent',
      },
    });
  }
});

/**
 * POST /api/v1/target-agents/:id/test
 * Test agent connection
 */
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    logger.info(`Testing connection for agent: id=${id}, organizationId=${organizationId}`);

    const table = getTargetAgentsTable();
    if (!table) {
      logger.error('targetAgentsTable is undefined');
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database table not initialized',
        },
      });
    }

    const [agent] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: 'Target agent not found',
        },
      });
    }

    const parsedBody = testAgentConnectionSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsedBody.error.errors.map((e) => e.message).join('; '),
        },
      });
    }

    const draftConfig = parsedBody.data.config;
    const savedConfig =
      agent.config && typeof agent.config === 'object' && !Array.isArray(agent.config)
        ? (agent.config as Record<string, unknown>)
        : {};
    const agentForTest: TargetAgentRecord = draftConfig
      ? {
          ...(agent as TargetAgentRecord),
          config: { ...savedConfig, ...draftConfig },
        }
      : (agent as TargetAgentRecord);

    const clientContext: TargetAgentClientContext = {
      organizationId,
    };

    const client = createTargetAgentClient(agentForTest, clientContext);
    const testResult = await client.testConnection();

    let responsePayload = testResult;

    // Persist auto-detected responseMode (e.g. blocking config but API requires streaming).
    if (
      testResult.status === 'success' &&
      testResult.autoCorrectedResponseMode === 'streaming' &&
      agentForTest.type === 'dify' &&
      table
    ) {
      const mergedConfig = {
        ...savedConfig,
        ...(draftConfig || {}),
        responseMode: 'streaming',
      };
      await db
        .update(table)
        .set({
          config: mergedConfig,
          healthStatus: {
            lastCheck: new Date().toISOString(),
            status: 'healthy',
            responseTime: testResult.responseTime || null,
          },
          updatedAt: new Date(),
        })
        .where(eq(table.id, id));

      responsePayload = {
        ...testResult,
        message:
          '连接测试成功。检测到 Dify 应用仅支持 streaming，已自动将响应模式更正为「流式」并保存。',
      };

      logger.info('[target-agents] Auto-corrected Dify responseMode to streaming', {
        agentId: id,
      });
    } else if (table) {
      await db
        .update(table)
        .set({
          healthStatus: {
            lastCheck: new Date().toISOString(),
            status: testResult.status === 'success' ? 'healthy' : 'unhealthy',
            responseTime: testResult.responseTime || null,
          },
          updatedAt: new Date(),
        })
        .where(eq(table.id, id));
    }

    res.json({
      success: true,
      data: responsePayload,
    });
  } catch (error: any) {
    logger.error('Test agent connection error:', error);
    logger.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to test agent connection',
      },
    });
  }
});

/**
 * GET /api/v1/target-agents/:id/status
 * Get agent status
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    const [agent] = await db
      .select({
        id: getTargetAgentsTable().id,
        status: getTargetAgentsTable().status,
        healthStatus: getTargetAgentsTable().healthStatus,
        statistics: getTargetAgentsTable().statistics,
      })
      .from(getTargetAgentsTable())
      .where(
        and(
          eq(getTargetAgentsTable().id, id),
          eq(getTargetAgentsTable().organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: 'Target agent not found',
        },
      });
    }

    res.json({
      success: true,
      data: {
        agentId: agent.id,
        status: agent.status,
        healthStatus: agent.healthStatus || {
          lastCheck: new Date().toISOString(),
          status: 'unknown',
        },
        statistics: agent.statistics || {
          totalAttacks: 0,
          successfulAttacks: 0,
          vulnerabilitiesFound: 0,
        },
      },
    });
  } catch (error) {
    logger.error('Get agent status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get agent status',
      },
    });
  }
});

export default router;
