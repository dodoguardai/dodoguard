/**
 * Public REST API for integrations (Bearer zhian.* API key).
 * Prefix: /api/v1/external
 */

import { randomBytes } from 'node:crypto';

import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db, getDbType } from '../../../../../database';
import logger from '../../../../../logger';
import {
  AttackTaskQuotaCheckError,
  AttackTaskQuotaExceededError,
  insertAttackTaskRow,
} from '../../../../../services/attackTaskInsertService';
import {
  EXTERNAL_API_SCOPES,
  hashIdempotencyKey,
} from '../../../../../services/externalApiKeyService';
import { getTaskAttackResultsForApi } from '../../../../../services/reportService';
import {
  mergeTopLevelConfigAuditIntoTaskMetadata,
  mergeWorkflowConfigAssetIntoTaskMetadata,
} from '../../../../../services/workflowConfigAssetFromAttackTask';
import { createTaskSchema, runAttackTaskInBackground } from '../attack-tasks';
import { attachEnabledAttackCommandCounts, parseVulnerabilityJsonFields } from '../vulnerabilities';
import { requireExternalScopes } from './middleware';

const router = express.Router();

function getAttackTasksTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    return require('../../../../../database/tables-mysql').attackTasksTable;
  }
  return require('../../../../../database/tables-enterprise').attackTasksTable;
}

function getTargetAgentsTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    return require('../../../../../database/tables-mysql').targetAgentsTable;
  }
  return require('../../../../../database/tables-enterprise').targetAgentsTable;
}

function getExternalIdempotencyTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    return require('../../../../../database/tables-mysql').externalIdempotencyTable;
  }
  return require('../../../../../database/tables-enterprise').externalIdempotencyTable;
}

function getVulnerabilitiesTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    return require('../../../../../database/tables-mysql').vulnerabilitiesTable;
  }
  return require('../../../../../database/tables-enterprise').vulnerabilitiesTable;
}

/** Same filter semantics as GET /api/v1/vulnerabilities (verificationMode only when column exists). */
function buildExternalVulnerabilityConditions(
  table: Record<string, unknown>,
  query: express.Request['query'],
) {
  const conditions: unknown[] = [];
  const { search, type, riskLevel, category, status, verificationMode } = query as Record<
    string,
    string | undefined
  >;

  if (search && typeof search === 'string') {
    conditions.push(
      or(
        like((table as any).name, `%${search}%`),
        like((table as any).description, `%${search}%`),
        like((table as any).avdId, `%${search}%`),
      ),
    );
  }

  if (type && typeof type === 'string') {
    conditions.push(eq((table as any).type, type));
  }
  if (riskLevel && typeof riskLevel === 'string') {
    conditions.push(eq((table as any).riskLevel, riskLevel));
  }
  if (category && typeof category === 'string') {
    conditions.push(like((table as any).category, `%${category}%`));
  }
  if (status && typeof status === 'string') {
    conditions.push(eq((table as any).status, status));
  }

  const vmCol = (table as { verificationMode?: unknown }).verificationMode;
  if (verificationMode && typeof verificationMode === 'string' && vmCol !== undefined) {
    const t = table as any;
    if (verificationMode === 'graybox_api_combined') {
      conditions.push(
        or(
          eq(t.verificationMode, 'config_audit'),
          eq(t.verificationMode, 'config_only'),
          eq(t.verificationMode, 'api_blackbox'),
          eq(t.verificationMode, 'runtime_required'),
          eq(t.verificationMode, 'config_plus_runtime'),
          eq(t.verificationMode, 'optional_runtime'),
          eq(t.verificationMode, 'hybrid'),
        ),
      );
    } else if (verificationMode === 'config_audit') {
      conditions.push(
        or(eq(t.verificationMode, 'config_audit'), eq(t.verificationMode, 'config_only')),
      );
    } else if (verificationMode === 'api_blackbox') {
      conditions.push(
        or(
          eq(t.verificationMode, 'api_blackbox'),
          eq(t.verificationMode, 'runtime_required'),
          eq(t.verificationMode, 'config_plus_runtime'),
          eq(t.verificationMode, 'optional_runtime'),
          eq(t.verificationMode, 'hybrid'),
        ),
      );
    } else {
      conditions.push(eq(t.verificationMode, verificationMode));
    }
  }

  return conditions;
}

const externalCreateTaskSchema = createTaskSchema.extend({
  callbackUrl: z.string().url().optional(),
  /** When true (default), enqueue attack run immediately after create */
  start: z.boolean().optional().default(true),
});

function normalizeMetadata(meta: unknown): Record<string, unknown> {
  if (!meta) {
    return {};
  }
  if (typeof meta === 'object' && meta !== null && !Array.isArray(meta)) {
    return { ...(meta as Record<string, unknown>) };
  }
  if (typeof meta === 'string') {
    try {
      const p = JSON.parse(meta);
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? { ...p } : {};
    } catch {
      return {};
    }
  }
  return {};
}

router.post('/tasks', requireExternalScopes(EXTERNAL_API_SCOPES.TASKS_WRITE), async (req, res) => {
  try {
    const organizationId = req.user?.organizationId as string;
    const userId = req.user?.userId || req.user?.id;

    const idemRaw = req.headers['idempotency-key'];
    const idemHeader = typeof idemRaw === 'string' ? idemRaw.trim() : '';
    if (idemHeader) {
      const idemTable = getExternalIdempotencyTable();
      const hash = hashIdempotencyKey(idemHeader);
      const [existing] = await db
        .select()
        .from(idemTable)
        .where(
          and(eq(idemTable.organizationId, organizationId), eq(idemTable.idempotencyKeyHash, hash)),
        )
        .limit(1);
      if (existing) {
        const status = Number(existing.responseStatus);
        const body = JSON.parse(existing.responseBody) as unknown;
        return res.status(status).json(body);
      }
    }

    const parsed = externalCreateTaskSchema.parse(req.body);
    const { callbackUrl, start, ...taskData } = parsed;
    const {
      saveWorkflowConfigAsset,
      configAudit: topLevelConfigAudit,
      taskTypeId,
      platformFamily,
      scanMode,
      entrypointType,
      artifactRefs,
      judgeConfig,
      reportPreference,
      scheduleConfig,
      retestOfTaskId,
      baselineTaskId,
      ...taskBase
    } = taskData;

    const extTargetCfg = taskBase.targetConfig as { agentId?: unknown } | undefined;
    const extTaskAgentIdForAsset =
      taskBase.targetType === 'agent' &&
      extTargetCfg &&
      typeof extTargetCfg.agentId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        extTargetCfg.agentId.trim(),
      )
        ? extTargetCfg.agentId.trim()
        : undefined;

    const metadataForAssetMerge = mergeTopLevelConfigAuditIntoTaskMetadata(
      taskBase.metadata,
      topLevelConfigAudit,
    );

    let mergedMetadata = await mergeWorkflowConfigAssetIntoTaskMetadata({
      organizationId,
      userId: userId as string,
      metadata: metadataForAssetMerge,
      platformFamily,
      saveWorkflowConfigAsset,
      targetAgentId: extTaskAgentIdForAsset,
    });
    mergedMetadata = normalizeMetadata(mergedMetadata);

    if (callbackUrl) {
      mergedMetadata.externalCallback = {
        url: callbackUrl,
        signingSecret: randomBytes(32).toString('hex'),
      };
    }

    const table = getAttackTasksTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
      });
    }

    const dbType = getDbType();
    const insertValues: Record<string, unknown> = {
      ...taskBase,
      metadata: mergedMetadata,
      organizationId,
      userId,
    };
    if (dbType === 'mysql') {
      Object.assign(insertValues, {
        taskTypeId,
        platformFamily,
        scanMode,
        entrypointType,
        artifactRefs,
        judgeConfig,
        reportPreference,
        scheduleConfig,
        retestOfTaskId,
        baselineTaskId,
      });
    }

    let newTask: Record<string, unknown>;
    try {
      newTask = (await insertAttackTaskRow(table, insertValues)) as Record<string, unknown>;
    } catch (err: unknown) {
      if (err instanceof AttackTaskQuotaExceededError) {
        return res.status(403).json({
          success: false,
          error: {
            code: err.code,
            message: `Attack task quota exceeded for this organization.`,
            details: err.details,
          },
        });
      }
      if (err instanceof AttackTaskQuotaCheckError) {
        return res.status(500).json({
          success: false,
          error: { code: err.code, message: 'Quota check failed', details: err.message },
        });
      }
      throw err;
    }

    const data: Record<string, unknown> = { ...newTask };
    if (callbackUrl) {
      data.webhookVerificationSecret = (
        mergedMetadata.externalCallback as { signingSecret?: string }
      )?.signingSecret;
    }

    if (start && newTask.id) {
      runAttackTaskInBackground(String(newTask.id), organizationId).catch((e) => {
        logger.error('[external/tasks] background run failed', e);
      });
    }

    const jsonBody: Record<string, unknown> = {
      success: true,
      data,
    };
    if (callbackUrl) {
      jsonBody.hint =
        'Use data.webhookVerificationSecret to verify X-Webhook-Signature on callbacks (HMAC-SHA256 over timestamp + body).';
    }

    if (idemHeader) {
      const idemTable = getExternalIdempotencyTable();
      const hash = hashIdempotencyKey(idemHeader);
      try {
        await db.insert(idemTable).values({
          id: uuidv4(),
          organizationId,
          idempotencyKeyHash: hash,
          requestPath: '/tasks',
          responseStatus: '201',
          responseBody: JSON.stringify(jsonBody),
        } as any);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('Duplicate') && !(e as { code?: string }).code?.includes('23505')) {
          logger.warn('[external/tasks] idempotency insert failed', { message: msg });
        }
      }
    }

    return res.status(201).json(jsonBody);
  } catch (error: unknown) {
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
    logger.error('[external/tasks] create error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create task' },
    });
  }
});

router.get('/tasks', requireExternalScopes(EXTERNAL_API_SCOPES.TASKS_READ), async (req, res) => {
  try {
    const organizationId = req.user?.organizationId as string;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;

    const table = getAttackTasksTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
      });
    }

    const whereConditions = [eq(table.organizationId, organizationId)];
    if (search) {
      whereConditions.push(like(table.name, `%${search}%`));
    }
    if (status) {
      whereConditions.push(eq(table.status, status));
    }

    const items = await db
      .select()
      .from(table)
      .where(and(...whereConditions))
      .orderBy(desc(table.createdAt))
      .limit(limit)
      .offset(offset);

    const totalRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(and(...whereConditions));
    const total = Number(totalRow[0]?.count ?? 0);

    res.json({
      success: true,
      data: {
        items,
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      },
    });
  } catch (error) {
    logger.error('[external/tasks] list error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list tasks' },
    });
  }
});

router.get(
  '/tasks/:taskId',
  requireExternalScopes(EXTERNAL_API_SCOPES.TASKS_READ),
  async (req, res) => {
    try {
      const organizationId = req.user?.organizationId as string;
      const table = getAttackTasksTable();
      if (!table) {
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
        });
      }
      const [task] = await db
        .select()
        .from(table)
        .where(and(eq(table.id, req.params.taskId), eq(table.organizationId, organizationId)))
        .limit(1);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        });
      }
      res.json({ success: true, data: task });
    } catch (error) {
      logger.error('[external/tasks] get error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get task' },
      });
    }
  },
);

router.get(
  '/tasks/:taskId/status',
  requireExternalScopes(EXTERNAL_API_SCOPES.TASKS_READ),
  async (req, res) => {
    try {
      const organizationId = req.user?.organizationId as string;
      const table = getAttackTasksTable();
      if (!table) {
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
        });
      }
      const [row] = await db
        .select({
          id: table.id,
          status: table.status,
          updatedAt: table.updatedAt,
          metadata: table.metadata,
        })
        .from(table)
        .where(and(eq(table.id, req.params.taskId), eq(table.organizationId, organizationId)))
        .limit(1);
      if (!row) {
        return res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        });
      }
      const meta = normalizeMetadata(row.metadata);
      const runProgress = meta.runProgress as Record<string, unknown> | undefined;
      res.json({
        success: true,
        data: {
          id: row.id,
          status: row.status,
          updatedAt: row.updatedAt,
          runProgress: runProgress ?? null,
        },
      });
    } catch (error) {
      logger.error('[external/tasks] status error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get task status' },
      });
    }
  },
);

router.get(
  '/tasks/:taskId/results',
  requireExternalScopes(EXTERNAL_API_SCOPES.TASKS_READ),
  async (req, res) => {
    try {
      const organizationId = req.user?.organizationId as string;
      const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
      const payload = await getTaskAttackResultsForApi(taskId, organizationId);
      if (!payload) {
        return res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: 'Attack task not found' },
        });
      }
      res.json({ success: true, data: payload });
    } catch (error) {
      logger.error('[external/tasks] results error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get task results' },
      });
    }
  },
);

router.delete(
  '/tasks/:taskId',
  requireExternalScopes(EXTERNAL_API_SCOPES.TASKS_WRITE),
  async (req, res) => {
    try {
      const organizationId = req.user?.organizationId as string | undefined;
      const taskId =
        typeof req.params.taskId === 'string'
          ? req.params.taskId
          : Array.isArray(req.params.taskId)
            ? req.params.taskId[0]
            : '';
      if (!organizationId || !taskId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_CONTEXT', message: 'Organization or task id required' },
        });
      }
      const table = getAttackTasksTable();
      if (!table) {
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
        });
      }
      const [existing] = await db
        .select()
        .from(table)
        .where(and(eq(table.id, taskId), eq(table.organizationId, organizationId)))
        .limit(1);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        });
      }
      if (existing.status !== 'running') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Only running tasks can be canceled',
            details: { status: existing.status },
          },
        });
      }

      const metadata = normalizeMetadata(existing.metadata);
      metadata.canceledAt = new Date().toISOString();

      await db
        .update(table)
        .set({
          status: 'canceled',
          updatedAt: new Date(),
          metadata: metadata as unknown as Record<string, unknown>,
        } as any)
        .where(and(eq(table.id, taskId), eq(table.organizationId, organizationId)));

      const { notifyExternalTaskTerminalFromPayload } = await import(
        '../../../../../services/externalTaskWebhookService'
      );
      notifyExternalTaskTerminalFromPayload({
        taskId,
        organizationId,
        status: 'canceled',
        metadata,
      });

      res.json({ success: true, data: { id: taskId, status: 'canceled' } });
    } catch (error) {
      logger.error('[external/tasks] cancel error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to cancel task' },
      });
    }
  },
);

router.get('/agents', requireExternalScopes(EXTERNAL_API_SCOPES.AGENTS_READ), async (req, res) => {
  try {
    const organizationId = req.user?.organizationId as string;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const table = getTargetAgentsTable();
    if (!table) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'target_agents table not initialized' },
      });
    }

    const items = await db
      .select({
        id: table.id,
        name: table.name,
        description: table.description,
        type: table.type,
        status: table.status,
        createdAt: table.createdAt,
        updatedAt: table.updatedAt,
      })
      .from(table)
      .where(eq(table.organizationId, organizationId))
      .orderBy(desc(table.createdAt))
      .limit(limit)
      .offset(offset);

    const totalRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(eq(table.organizationId, organizationId));
    const total = Number(totalRow[0]?.count ?? 0);

    res.json({
      success: true,
      data: { items, total, limit, offset, hasMore: offset + items.length < total },
    });
  } catch (error) {
    logger.error('[external/agents] list error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list agents' },
    });
  }
});

router.get(
  '/vulnerabilities',
  requireExternalScopes(EXTERNAL_API_SCOPES.VULNERABILITIES_READ),
  async (req, res) => {
    try {
      const table = getVulnerabilitiesTable();
      if (!table) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Vulnerabilities table not initialized',
          },
        });
      }

      const conditions = buildExternalVulnerabilityConditions(table, req.query);
      let listQuery = db.select().from(table);
      if (conditions.length > 0) {
        listQuery = listQuery.where(and(...(conditions as Parameters<typeof and>)));
      }

      const limitNum = Math.min(
        Math.max(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 1),
        200,
      );
      const offsetNum = Math.max(Number.parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

      const rows = await listQuery.orderBy(desc(table.createdAt)).limit(limitNum).offset(offsetNum);

      const parsed = rows.map((v) => parseVulnerabilityJsonFields(v as Record<string, unknown>));
      await attachEnabledAttackCommandCounts(parsed as Record<string, unknown>[]);

      let countQuery = db.select({ count: sql<number>`count(*)` }).from(table);
      if (conditions.length > 0) {
        countQuery = countQuery.where(and(...(conditions as Parameters<typeof and>)));
      }
      const [{ count: total }] = await countQuery;

      res.json({
        success: true,
        data: {
          items: parsed,
          total: Number(total),
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + parsed.length < Number(total),
        },
      });
    } catch (error) {
      logger.error('[external/vulnerabilities] list error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list vulnerabilities' },
      });
    }
  },
);

router.get(
  '/vulnerabilities/:vulnerabilityId',
  requireExternalScopes(EXTERNAL_API_SCOPES.VULNERABILITIES_READ),
  async (req, res) => {
    try {
      const table = getVulnerabilitiesTable();
      if (!table) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Vulnerabilities table not initialized',
          },
        });
      }

      const [row] = await db
        .select()
        .from(table)
        .where(eq(table.id, req.params.vulnerabilityId))
        .limit(1);

      if (!row) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Vulnerability not found' },
        });
      }

      const parsed = parseVulnerabilityJsonFields(row as Record<string, unknown>);
      await attachEnabledAttackCommandCounts([parsed as Record<string, unknown>]);

      res.json({ success: true, data: parsed });
    } catch (error) {
      logger.error('[external/vulnerabilities] get error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get vulnerability' },
      });
    }
  },
);

export default router;
