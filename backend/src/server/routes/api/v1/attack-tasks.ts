/**
 * Attack Tasks API Routes
 */

import { and, asc, desc, eq, inArray, isNull, like, ne, or, sql } from 'drizzle-orm';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { createTaskSchema } from '../../../../schemas/attackTaskSchema';
import { db, getDbType } from '../../../../database';
import {
  parseAttackTaskDetectionConfig,
  parseAttackTaskExecutionSettings,
  parseAttackTaskMetadata,
  parseAttackTaskVulnerabilities,
  resolveAttackTaskKind,
} from '../../../../lib/attackTaskRowNormalize';
import logger from '../../../../logger';
import {
  runApiAttacksForTask,
  runCozeAttacksForTask,
  runDifyAttacksForTask,
  runFastGptAttacksForTask,
  runLangChainAttacksForTask,
  runN8nAttacksForTask,
  runTencentAdpAttacksForTask,
  resolveSingleTestCommands,
} from '../../../../services/attackTaskAgentExecution';
import {
  AttackTaskQuotaCheckError,
  AttackTaskQuotaExceededError,
  insertAttackTaskRow,
} from '../../../../services/attackTaskInsertService';
import { isMultiRoundPreRecordedMetadata } from '../../../../services/multiRoundTestUtils';
import {
  buildConfigAuditStaticSummaryPayload,
  buildCozeDegradedConfigAuditStaticSummary,
  buildFastGptDegradedConfigAuditStaticSummary,
  runStaticCozeConfigAuditForTask,
  runStaticDifyConfigAuditForTask,
  runStaticFastGptConfigAuditForTask,
} from '../../../../services/attackTaskJudgment/configAuditStatic';
import {
  resolveDetectionResultsForLog,
  resolveFinalVulnerableForLog,
  runPostAgentJudgment,
} from '../../../../services/attackTaskJudgment/runPostAgentJudgment';
import { runStaticConfigYamlScanForTask } from '../../../../services/attackTaskJudgment/runStaticConfigYamlScan';
import { maybeNotifyAttackTaskUser } from '../../../../services/attackTaskNotificationService';
import { notifyExternalTaskTerminalFromPayload } from '../../../../services/externalTaskWebhookService';
import { getTaskAttackResultsForApi } from '../../../../services/reportService';
import {
  beginMysqlScanRun,
  completeMysqlScanRun,
  failMysqlScanRun,
  syncFindingRecordsFromTaskRun,
} from '../../../../services/v4MysqlExecutionService';
import {
  mergeTopLevelConfigAuditIntoTaskMetadata,
  mergeWorkflowConfigAssetIntoTaskMetadata,
} from '../../../../services/workflowConfigAssetFromAttackTask';

const router = express.Router();

// Resolve attackTasksTable based on current DB type (MySQL or Postgres)
function getAttackTasksTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    // Use MySQL schema
    const mysqlTables = require('../../../../database/tables-mysql');
    return mysqlTables.attackTasksTable;
  }
  // Default to Postgres/enterprise schema
  const pgTables = require('../../../../database/tables-enterprise');
  return pgTables.attackTasksTable;
}

function getAttackResultsTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../../../../database/tables-mysql');
    return mysqlTables.attackResultsTable;
  }
  const pgTables = require('../../../../database/tables-enterprise');
  return pgTables.attackResultsTable;
}

export { createTaskSchema } from '../../../../schemas/attackTaskSchema';

/**
 * GET /api/v1/attack-tasks
 * List attack tasks
 */
router.get('/', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const {
      limit = 50,
      offset = 0,
      search,
      status,
      targetType,
      platformFamily,
      excludePlatformFamily,
    } = req.query;

    const table = getAttackTasksTable();
    if (!table) {
      logger.error('attackTasksTable is undefined for current DB type');
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
      whereConditions.push(eq(table.status, status as string));
    }

    if (targetType) {
      whereConditions.push(eq(table.targetType, targetType as string));
    }

    if (getDbType() === 'mysql' && platformFamily && String(platformFamily).trim() !== '') {
      whereConditions.push(
        // IMPORTANT: Always reference columns from the same `table` instance used in `.from(table)`.
        // Mixing table instances (even for the same physical table) can cause subtle query issues.
        eq((table as any).platformFamily, String(platformFamily).trim()),
      );
    }

    /** Dify agent list: omit tasks tagged for another product (e.g. coze). Legacy rows with NULL platform_family stay visible. */
    if (
      getDbType() === 'mysql' &&
      excludePlatformFamily &&
      String(excludePlatformFamily).trim() !== ''
    ) {
      const ex = String(excludePlatformFamily).trim();
      whereConditions.push(or(isNull(table.platformFamily), ne(table.platformFamily, ex)));
    }

    const safeJsonParse = <T = unknown>(value: unknown): T | null => {
      if (value == null) {
        return null;
      }
      if (typeof value === 'object') {
        return value as T;
      }
      if (typeof value !== 'string') {
        return null;
      }
      const s = value.trim();
      if (s === '') {
        return null;
      }
      try {
        return JSON.parse(s) as T;
      } catch {
        return null;
      }
    };

    const isMysql = getDbType() === 'mysql';

    // NOTE: Some installations have legacy TEXT columns that store JSON-like strings (or bad JSON).
    // Selecting them via Drizzle `json()` can throw during deserialization and break the whole list.
    // To make the list robust, for MySQL we cast JSON-ish columns to CHAR and parse defensively.
    const tasks = isMysql
      ? // Two-step query to avoid ER_OUT_OF_SORTMEMORY:
        // 1) select small rows (id, created_at) for sorting/pagination
        // 2) fetch full rows by id list (only up to `limit`)
        await (async () => {
          const page = await db
            .select({
              id: (table as any).id,
              createdAt: (table as any).createdAt,
            })
            .from(table)
            .where(and(...whereConditions))
            .limit(Number(limit))
            .offset(Number(offset))
            .orderBy(desc((table as any).createdAt));

          const ids = page.map((r) => r.id).filter(Boolean) as string[];
          if (ids.length === 0) {
            return [];
          }

          const rows = await db
            .select({
              id: (table as any).id,
              organizationId: (table as any).organizationId,
              teamId: (table as any).teamId,
              userId: (table as any).userId,
              taskTypeId: (table as any).taskTypeId,
              platformFamily: (table as any).platformFamily,
              scanMode: (table as any).scanMode,
              entrypointType: (table as any).entrypointType,
              artifactRefs: sql<string>`cast(${(table as any).artifactRefs} as char)`.as(
                'artifact_refs',
              ),
              judgeConfig: sql<string>`cast(${(table as any).judgeConfig} as char)`.as(
                'judge_config',
              ),
              reportPreference: sql<string>`cast(${(table as any).reportPreference} as char)`.as(
                'report_preference',
              ),
              scheduleConfig: sql<string>`cast(${(table as any).scheduleConfig} as char)`.as(
                'schedule_config',
              ),
              retestOfTaskId: (table as any).retestOfTaskId,
              baselineTaskId: (table as any).baselineTaskId,
              name: (table as any).name,
              description: (table as any).description,
              targetType: (table as any).targetType,
              targetConfig: sql<string>`cast(${(table as any).targetConfig} as char)`.as(
                'target_config',
              ),
              vulnerabilities: sql<string>`cast(${(table as any).vulnerabilities} as char)`.as(
                'vulnerabilities',
              ),
              attackMode: (table as any).attackMode,
              compositeAttackConfig:
                sql<string>`cast(${(table as any).compositeAttackConfig} as char)`.as(
                  'composite_attack_config',
                ),
              detectionConfig: sql<string>`cast(${(table as any).detectionConfig} as char)`.as(
                'detection_config',
              ),
              agentConfig: sql<string>`cast(${(table as any).agentConfig} as char)`.as(
                'agent_config',
              ),
              status: (table as any).status,
              metadata: sql<string>`cast(${(table as any).metadata} as char)`.as('metadata'),
              createdAt: (table as any).createdAt,
              updatedAt: (table as any).updatedAt,
            })
            .from(table)
            .where(inArray((table as any).id, ids));

          // IMPORTANT: Do NOT ORDER BY in SQL here.
          // Ordering large rows can still hit ER_OUT_OF_SORTMEMORY (sort buffer).
          // We already determined the desired order via `page` (id list), so reorder in JS.
          const byId = new Map<string, any>();
          for (const r of rows as any[]) {
            if (r?.id) {
              byId.set(String(r.id), r);
            }
          }
          return ids.map((id) => byId.get(id)).filter(Boolean);
        })()
      : await db
          .select()
          .from(table)
          .where(and(...whereConditions))
          .limit(Number(limit))
          .offset(Number(offset))
          .orderBy(desc((table as any).createdAt));

    const normalizedTasks = isMysql
      ? (tasks as any[]).map((t) => ({
          ...t,
          artifactRefs: safeJsonParse(t.artifactRefs),
          judgeConfig: safeJsonParse(t.judgeConfig),
          reportPreference: safeJsonParse(t.reportPreference),
          scheduleConfig: safeJsonParse(t.scheduleConfig),
          targetConfig: safeJsonParse(t.targetConfig),
          vulnerabilities: safeJsonParse(t.vulnerabilities) ?? [],
          compositeAttackConfig: safeJsonParse(t.compositeAttackConfig),
          detectionConfig: safeJsonParse(t.detectionConfig),
          agentConfig: safeJsonParse(t.agentConfig),
          metadata: safeJsonParse(t.metadata),
        }))
      : tasks;

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(and(...whereConditions));

    res.json({
      success: true,
      data: {
        data: normalizedTasks,
        total: total[0]?.count || 0,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error: any) {
    logger.error('List attack tasks error:', {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sql: error?.sql,
      sqlMessage: error?.sqlMessage,
      cause: (error as any)?.cause
        ? {
            message: (error as any).cause?.message,
            code: (error as any).cause?.code,
            errno: (error as any).cause?.errno,
            sql: (error as any).cause?.sql,
            sqlMessage: (error as any).cause?.sqlMessage,
          }
        : undefined,
      stack: error?.stack,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list attack tasks',
      },
    });
  }
});

/**
 * POST /api/v1/attack-tasks
 * Create new attack task
 */
router.post('/', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CONTEXT', message: 'Organization and user context required' },
      });
    }

    const taskData = createTaskSchema.parse(req.body);
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

    const table = getAttackTasksTable();
    if (!table) {
      logger.error('attackTasksTable is undefined for current DB type');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
      });
    }

    const dbType = getDbType();
    const targetCfg = taskBase.targetConfig as { agentId?: unknown } | undefined;
    const taskAgentIdForAsset =
      taskBase.targetType === 'agent' &&
      targetCfg &&
      typeof targetCfg.agentId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetCfg.agentId.trim(),
      )
        ? targetCfg.agentId.trim()
        : undefined;

    const metadataForAssetMerge = mergeTopLevelConfigAuditIntoTaskMetadata(
      taskBase.metadata,
      topLevelConfigAudit,
    );

    const mergedMetadata = await mergeWorkflowConfigAssetIntoTaskMetadata({
      organizationId,
      userId,
      metadata: metadataForAssetMerge,
      platformFamily,
      saveWorkflowConfigAsset,
      targetAgentId: taskAgentIdForAsset,
    });

    const insertValues: any = {
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

    let newTask: any;
    try {
      newTask = await insertAttackTaskRow(table, insertValues);
    } catch (err: unknown) {
      if (err instanceof AttackTaskQuotaExceededError) {
        return res.status(403).json({
          success: false,
          error: {
            code: err.code,
            message: `本月攻击任务数量配额已满。当前使用: ${err.details.currentUsage}/${err.details.limit === -1 ? '无限制' : err.details.limit}。请升级套餐或等待下月重置。`,
            details: {
              metric: err.details.metric,
              currentUsage: err.details.currentUsage,
              limit: err.details.limit,
              remaining: err.details.remaining,
            },
          },
        });
      }
      if (err instanceof AttackTaskQuotaCheckError) {
        return res.status(500).json({
          success: false,
          error: {
            code: err.code,
            message: '配额检查失败，无法创建攻击任务',
            details: err.message,
          },
        });
      }
      throw err;
    }

    res.status(201).json({
      success: true,
      data: newTask,
    });
  } catch (error: any) {
    logger.error('Create attack task error:', {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sql: error?.sql,
      sqlMessage: error?.sqlMessage,
      stack: error?.stack,
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
        message: 'Failed to create attack task',
      },
    });
  }
});

/**
 * GET /api/v1/attack-tasks/task-types
 * List enabled task_types (MySQL v4 seed). Used by task creation UI.
 */
router.get('/task-types', async (_req, res) => {
  try {
    if (getDbType() !== 'mysql') {
      return res.json({ success: true, data: [] });
    }
    const { taskTypesTable } = require('../../../../database/tables-mysql');
    const rows = await db
      .select()
      .from(taskTypesTable)
      .where(eq(taskTypesTable.enabled, true))
      .orderBy(asc(taskTypesTable.name));
    return res.json({ success: true, data: rows });
  } catch (error: unknown) {
    logger.error('List task types error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list task types' },
    });
  }
});

/**
 * GET /api/v1/attack-tasks/:id/results
 * Full attack / finding-result rows for a task (same ordering and source as report generation).
 */
router.get('/:id/results', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const payload = await getTaskAttackResultsForApi(id, organizationId);
    if (!payload) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: 'Attack task not found',
        },
      });
    }

    res.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    logger.error('Get attack task results error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get task results',
      },
    });
  }
});

/**
 * GET /api/v1/attack-tasks/:id
 * Get attack task by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const table = getAttackTasksTable();
    if (!table) {
      logger.error('attackTasksTable is undefined for current DB type');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
      });
    }

    const [task] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: 'Attack task not found',
        },
      });
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    logger.error('Get attack task error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get attack task',
      },
    });
  }
});

/**
 * POST /api/v1/attack-tasks/:id/run
 * Execute attack task
 */
router.post('/:id/run', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const configAuditFromReq =
      req.body && typeof req.body === 'object' ? (req.body as any).configAudit : undefined;

    const table = getAttackTasksTable();
    if (!table) {
      logger.error('attackTasksTable is undefined for current DB type');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
      });
    }

    // Ensure task exists and belongs to org before starting background run
    const [existing] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: 'Attack task not found',
        },
      });
    }
    if (existing.status === 'running') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'TASK_ALREADY_RUNNING',
          message: 'Task is already running',
        },
      });
    }

    let metadata = existing.metadata || {};
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }
    const taskKind = (metadata as any)?.taskKind as
      | 'api_test'
      | 'config_audit'
      | 'config_static'
      | undefined;
    const requiresConfigAudit = taskKind === 'config_audit' || taskKind === 'config_static';

    const isRerunAttempt =
      existing.status === 'completed' ||
      existing.status === 'failed' ||
      existing.status === 'canceled';

    if (requiresConfigAudit) {
      const cfg =
        configAuditFromReq && typeof configAuditFromReq === 'object'
          ? configAuditFromReq
          : undefined;
      const yamlText = typeof cfg?.yaml === 'string' ? cfg.yaml.trim() : '';
      const jsonText = typeof cfg?.json === 'string' ? cfg.json.trim() : '';
      const payloadIsEmpty = !yamlText && !jsonText;
      if (isRerunAttempt && payloadIsEmpty) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CONFIG_AUDIT_REQUIRED',
            message: 'Config task re-run requires uploading config file again',
          },
        });
      }
      if (!payloadIsEmpty) {
        const nextConfigAudit: Record<string, unknown> = {
          ...(yamlText ? { yaml: yamlText } : {}),
          ...(jsonText ? { json: jsonText } : {}),
          ...(typeof cfg?.fileName === 'string' && cfg.fileName.trim()
            ? { fileName: cfg.fileName.trim() }
            : {}),
        };
        metadata = {
          ...(metadata as Record<string, unknown>),
          configAudit: nextConfigAudit,
        };
        await db
          .update(table)
          .set({
            metadata,
            updatedAt: new Date(),
          })
          .where(and(eq(table.id, id), eq(table.organizationId, organizationId)));
      }
    }

    // Kick off long-running execution in the background and return immediately.
    // This avoids keeping the HTTP connection open for potentially hours.
    runAttackTaskInBackground(id, organizationId).catch((error) => {
      logger.error('Background attack task run error:', error);
    });

    return res.json({
      success: true,
      message: 'Task execution started',
      data: {
        message: 'Task execution started',
        taskId: id,
      },
    });
  } catch (error) {
    logger.error('Run attack task error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start task execution',
      },
    });
  }
});

/**
 * Long-running attack task execution logic.
 * This is executed in the background and is not tied to the HTTP request lifecycle.
 */
export async function runAttackTaskInBackground(taskId: string, organizationId?: string | null) {
  // Shared timestamp and metadata so we can update status to failed in the catch block as well.
  const now = new Date();
  let metadata: any;
  let runLogs: any[] = [];
  const thisRunLogs: any[] = [];
  let scanRunId: string | null = null;
  let executionSettings: ReturnType<typeof parseAttackTaskExecutionSettings>;
  let taskOwnerUserId: string | undefined;
  let taskDisplayName: string | undefined;

  try {
    if (!organizationId) {
      logger.warn('runAttackTaskInBackground called without organizationId');
      return;
    }

    const table = getAttackTasksTable();
    if (!table) {
      logger.error('attackTasksTable is undefined for current DB type');
      return;
    }

    // Load existing task to merge metadata and ensure it belongs to org
    const [existing] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, taskId), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      logger.warn('runAttackTaskInBackground: task not found', { taskId, organizationId });
      return;
    }

    taskOwnerUserId = String(existing.userId);
    taskDisplayName = String(existing.name ?? taskId);
    const taskVulnerabilities = parseAttackTaskVulnerabilities(existing.vulnerabilities);
    const detectionConfig = parseAttackTaskDetectionConfig(existing.detectionConfig);

    // Append a simple run log entry into metadata.runLogs
    metadata = parseAttackTaskMetadata(existing.metadata);
    executionSettings = parseAttackTaskExecutionSettings(metadata);
    runLogs = Array.isArray((metadata as any).runLogs) ? (metadata as any).runLogs : [];
    const baseRunLog = {
      id: `run-${now.getTime()}`,
      timestamp: now.toISOString(),
      level: 'info',
      message: 'Task run started',
      source: 'system',
    };
    runLogs.push(baseRunLog);
    thisRunLogs.push(baseRunLog);
    (metadata as any).runLogs = runLogs;

    // Mark task as running at the start of background execution
    await db
      .update(table)
      .set({
        status: 'running',
        updatedAt: now,
        metadata,
      })
      .where(and(eq(table.id, taskId), eq(table.organizationId, organizationId)));

    scanRunId = await beginMysqlScanRun({
      taskId,
      platformFamily: (existing as { platformFamily?: string | null }).platformFamily ?? null,
      scanMode: (existing as { scanMode?: string | null }).scanMode ?? null,
    });

    const persistRunProgress = async (completed: number, total: number) => {
      const t = Math.max(1, Math.floor(total));
      const c = Math.min(t, Math.max(0, Math.floor(completed)));
      if (!metadata || typeof metadata !== 'object') {
        metadata = {};
      }
      (metadata as any).runLogs = runLogs;
      (metadata as any).runProgress = {
        completed: c,
        total: t,
        updatedAt: new Date().toISOString(),
      };
      try {
        await db
          .update(table)
          .set({
            metadata,
            updatedAt: new Date(),
          })
          .where(and(eq(table.id, taskId), eq(table.organizationId, organizationId)));
      } catch (e) {
        logger.warn('persistRunProgress failed', e);
      }
    };

    const isTaskCanceled = async (): Promise<boolean> => {
      try {
        const [latest] = await db
          .select({ status: table.status })
          .from(table)
          .where(and(eq(table.id, taskId), eq(table.organizationId, organizationId)))
          .limit(1);
        return latest?.status === 'canceled';
      } catch {
        return false;
      }
    };

    const singleTestCommands = resolveSingleTestCommands(metadata);
    const isSingleTestRun = Boolean(singleTestCommands?.length);
    const isSingleTestConfigOnly =
      (metadata as { runSource?: string })?.runSource === 'single' && !isSingleTestRun;
    const multiRoundTestMeta = (
      metadata as {
        multiRoundTest?: { preRecorded?: boolean; preRunLogs?: Record<string, unknown>[] };
      }
    )?.multiRoundTest;
    const isMultiRoundPreRecorded =
      isMultiRoundPreRecordedMetadata(metadata) &&
      Array.isArray(multiRoundTestMeta?.preRunLogs) &&
      multiRoundTestMeta.preRunLogs.length > 0;

    const buildAgentAttackCtx = (attackModeOverride?: 'simple' | 'conversation' | 'composite') => ({
      now,
      attackMode: isSingleTestRun
        ? 'simple'
        : attackModeOverride ||
          ((existing.attackMode || 'simple') as 'simple' | 'conversation' | 'composite'),
      compositeAttackConfig: existing.compositeAttackConfig as
        | Record<string, unknown>
        | null
        | undefined,
      taskVulnerabilities,
      executionSettings,
      customCommandsToRun: singleTestCommands,
      pushLog: (entry: Record<string, unknown>) => {
        runLogs.push(entry);
        thisRunLogs.push(entry);
      },
      attachApiPreviewToLatestAttackCommand: (input: {
        commandId: string;
        responsePreview: string;
        status?: number;
        durationMs?: number;
      }) => {
        const cid = String(input.commandId);
        for (let i = runLogs.length - 1; i >= 0; i--) {
          const e = runLogs[i] as Record<string, unknown>;
          if (e?.source === 'attack-command' && String(e?.commandId ?? '') === cid) {
            e.responsePreview = input.responsePreview;
            if (typeof input.status === 'number') {
              e.apiHttpStatus = input.status;
            }
            if (typeof input.durationMs === 'number') {
              e.apiDurationMs = input.durationMs;
            }
            return;
          }
        }
      },
      reportRunProgress: persistRunProgress,
      shouldStop: isTaskCanceled,
    });

    let taskTypeCode: string | undefined;
    const taskTypeId = (existing as { taskTypeId?: string | null }).taskTypeId;
    if (taskTypeId) {
      try {
        const dbTypeForTaskType = getDbType();
        const taskTypesTable =
          dbTypeForTaskType === 'mysql'
            ? // eslint-disable-next-line @typescript-eslint/no-var-requires
              require('../../../../database/tables-mysql').taskTypesTable
            : // eslint-disable-next-line @typescript-eslint/no-var-requires
              require('../../../../database/tables-enterprise').taskTypesTable;
        if (taskTypesTable) {
          const [taskTypeRow] = await db
            .select({ code: taskTypesTable.code })
            .from(taskTypesTable)
            .where(eq(taskTypesTable.id, taskTypeId))
            .limit(1);
          taskTypeCode = taskTypeRow?.code ? String(taskTypeRow.code) : undefined;
        }
      } catch (e: any) {
        logger.warn('[attackTask] Could not resolve taskTypeId to code', {
          taskTypeId,
          message: e?.message,
        });
      }
    }

    let taskKind = resolveAttackTaskKind({
      metadata,
      scanMode: (existing as { scanMode?: string | null }).scanMode ?? null,
      taskTypeCode,
    });

    const configAuditMeta = (metadata as { configAudit?: { yaml?: string; json?: string } })
      ?.configAudit;
    const hasConfigAuditText = Boolean(
      String(configAuditMeta?.yaml || configAuditMeta?.json || '').trim(),
    );
    if (!taskKind && hasConfigAuditText) {
      const inferred: 'config_static' | 'config_audit' =
        (metadata as { taskKind?: string })?.taskKind === 'config_audit'
          ? 'config_audit'
          : 'config_static';
      logger.warn('[attackTask] taskKind missing; inferring from configAudit payload', {
        taskId,
        inferred,
        taskTypeCode: taskTypeCode ?? null,
        scanMode: (existing as { scanMode?: string | null }).scanMode ?? null,
      });
      taskKind = inferred;
    }

    logger.info('[attackTask] Background run context', {
      taskId,
      taskKind: taskKind ?? null,
      taskTypeCode: taskTypeCode ?? null,
      scanMode: (existing as { scanMode?: string | null }).scanMode ?? null,
      useRule: detectionConfig.useRule,
      useLLM: detectionConfig.useLLM,
      llmModel: detectionConfig.llmConfig?.model ?? null,
      vulnerabilityCount: taskVulnerabilities.length,
      hasConfigAuditText,
    });

    if (!(metadata as any)?.taskKind && taskKind) {
      logger.info('[attackTask] Resolved taskKind from taskType/scanMode', {
        taskId,
        taskKind,
        taskTypeCode,
        scanMode: (existing as { scanMode?: string | null }).scanMode,
      });
      (metadata as any).taskKind = taskKind;
    }

    if (!taskKind) {
      const logEntry = {
        id: `run-${now.getTime()}-task-kind-unknown`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message:
          'metadata.taskKind is missing and could not be inferred from taskTypeId; config_static / config_audit scans may be skipped',
        taskTypeCode: taskTypeCode ?? null,
        scanMode: (existing as { scanMode?: string | null }).scanMode ?? null,
      };
      runLogs.push(logEntry);
      thisRunLogs.push(logEntry);
    }

    // If this is an agent task with a linked agentId, execute target-agent attacks
    // using the configured Attack Commands for the selected vulnerabilities (if any).
    // config_static: YAML-only scan (no chat-messages / runtime calls).
    try {
      if (
        taskKind !== 'config_static' &&
        hasConfigAuditText &&
        (taskTypeCode?.toLowerCase().includes('config_static') ||
          String((existing as { scanMode?: string | null }).scanMode ?? '').toLowerCase() ===
            'static')
      ) {
        const logEntry = {
          id: `run-${now.getTime()}-config-static-not-run`,
          timestamp: new Date().toISOString(),
          level: 'error',
          source: 'system',
          message: [
            'Config YAML present but taskKind is not config_static — static scan was skipped',
            `taskKind=${taskKind ?? 'unknown'}`,
            `taskTypeCode=${taskTypeCode ?? 'unknown'}`,
            'Fix: recreate task or set metadata.taskKind=config_static',
          ].join(' | '),
        };
        runLogs.push(logEntry);
        thisRunLogs.push(logEntry);
      }

      if (taskKind === 'config_static') {
        let attackCommandsTable: any | undefined;
        const dbTypeForCommands = getDbType();
        if (dbTypeForCommands === 'mysql') {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mysqlTables = require('../../../../database/tables-mysql');
          attackCommandsTable = mysqlTables.attackCommandsTable;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const pgTables = require('../../../../database/tables-enterprise');
          attackCommandsTable = pgTables.attackCommandsTable;
        }
        const cfg = (metadata as any)?.configAudit as
          | { yaml?: string; json?: string; fileName?: string }
          | undefined;
        const taskPf = String(
          (existing as { platformFamily?: string | null }).platformFamily ?? '',
        ).toLowerCase();
        const configAuditText =
          taskPf === 'fastgpt' || taskPf === 'n8n' ? cfg?.json || '' : cfg?.yaml || '';
        const agentAttackCtx = buildAgentAttackCtx();
        const staticScanOut = await runStaticConfigYamlScanForTask({
          db,
          now,
          organizationId,
          yamlText: configAuditText,
          vulnerabilityIds: agentAttackCtx.taskVulnerabilities,
          detectionConfig,
          attackCommandsTable,
          platformFamily:
            (existing as { platformFamily?: string | null }).platformFamily ?? undefined,
          pushLog: agentAttackCtx.pushLog,
          reportRunProgress: agentAttackCtx.reportRunProgress,
        });
        if (cfg && staticScanOut?.structureSummary) {
          (metadata as any).configAudit = {
            ...cfg,
            structure: staticScanOut.structureSummary,
          };
        }
      } else if (isSingleTestConfigOnly) {
        const logEntry = {
          id: `run-${now.getTime()}-single-test-config-only`,
          timestamp: new Date().toISOString(),
          level: 'info',
          source: 'system',
          message:
            'Single test config-only mode: skipped runtime API probe (no test instruction). Static config audit will still run.',
        };
        runLogs.push(logEntry);
        thisRunLogs.push(logEntry);
      } else if (isMultiRoundPreRecorded) {
        for (const log of multiRoundTestMeta!.preRunLogs!) {
          runLogs.push(log);
          thisRunLogs.push(log);
        }
        const logEntry = {
          id: `run-${now.getTime()}-multi-round-pre-recorded`,
          timestamp: new Date().toISOString(),
          level: 'info',
          source: 'system',
          message:
            'Multi-round interactive test: using pre-recorded conversation transcript; skipped live agent API calls.',
        };
        runLogs.push(logEntry);
        thisRunLogs.push(logEntry);
      } else if (existing.targetType === 'agent') {
        // Resolve attackCommandsTable dynamically based on DB type
        let attackCommandsTable: any | undefined;
        const dbTypeForCommands = getDbType();
        if (dbTypeForCommands === 'mysql') {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mysqlTables = require('../../../../database/tables-mysql');
          attackCommandsTable = mysqlTables.attackCommandsTable;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const pgTables = require('../../../../database/tables-enterprise');
          attackCommandsTable = pgTables.attackCommandsTable;
        }

        const config = (existing.targetConfig || {}) as any;
        const agentId = config.agentId;
        if (agentId) {
          const dbType = getDbType();
          let targetAgentsTable: any;
          if (dbType === 'mysql') {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mysqlTables = require('../../../../database/tables-mysql');
            targetAgentsTable = mysqlTables.targetAgentsTable;
          } else {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pgTables = require('../../../../database/tables-enterprise');
            targetAgentsTable = pgTables.targetAgentsTable;
          }

          if (targetAgentsTable) {
            const [agent] = await db
              .select()
              .from(targetAgentsTable)
              .where(eq(targetAgentsTable.id, agentId))
              .limit(1);

            if (agent && agent.type === 'dify') {
              const agentConfig = agent.config as any;
              const apiKey = agentConfig?.apiKey;
              const apiBaseUrl = agentConfig?.apiBaseUrl;
              const userId = agentConfig?.userId || 'task-runner';
              const inputs = agentConfig?.inputs || {};
              const difyApiType = agentConfig?.apiType === 'workflow' ? 'workflow' : 'chat';
              const originalAttackMode = (existing.attackMode || 'simple') as
                | 'simple'
                | 'conversation'
                | 'composite';
              const effectiveAttackMode =
                difyApiType === 'workflow' && originalAttackMode === 'conversation'
                  ? 'simple'
                  : originalAttackMode;

              if (apiKey && apiBaseUrl) {
                const agentAttackCtx = buildAgentAttackCtx(effectiveAttackMode);
                if (difyApiType === 'workflow' && originalAttackMode === 'conversation') {
                  const modeFallbackLog = {
                    id: `run-${now.getTime()}-dify-workflow-attackmode-fallback`,
                    timestamp: new Date().toISOString(),
                    level: 'warn',
                    source: 'dify',
                    message: 'Dify workflow 模式不支持会话轮次攻击，已自动降级为 simple 模式执行。',
                    apiType: difyApiType,
                    attackModeRequested: originalAttackMode,
                    attackModeEffective: effectiveAttackMode,
                  };
                  runLogs.push(modeFallbackLog);
                  thisRunLogs.push(modeFallbackLog);
                }
                await runDifyAttacksForTask({
                  ctx: agentAttackCtx,
                  db,
                  attackCommandsTable,
                  agentConfig,
                  apiKey,
                  apiBaseUrl,
                  userId,
                  inputs,
                });
              } else {
                const logEntry = {
                  id: `run-${now.getTime()}-dify-misconfig`,
                  timestamp: new Date().toISOString(),
                  level: 'warn',
                  message:
                    'Dify Target Agent 未配置 apiKey 或 apiBaseUrl：未向 Dify 发送任何 HTTP 请求。请在 Agents 中补全后重试；请求由 DodoGuard 服务端发出，不会在浏览器 Network 中出现。',
                  source: 'dify',
                };
                runLogs.push(logEntry);
                thisRunLogs.push(logEntry);
              }
            } else if (agent && agent.type === 'coze') {
              const agentConfig = agent.config as any;
              const apiKey = agentConfig?.apiKey;
              const apiBaseUrl = agentConfig?.apiBaseUrl || 'https://api.coze.com';
              const botId = agentConfig?.botId;
              const userId = agentConfig?.userId || 'task-runner';

              if (!apiKey || !botId) {
                const logEntry = {
                  id: `run-${now.getTime()}-coze-misconfig`,
                  timestamp: new Date().toISOString(),
                  level: 'warn',
                  message:
                    'Coze agent missing required configuration: apiKey and botId are required; skipped real call',
                  source: 'coze',
                };
                runLogs.push(logEntry);
                thisRunLogs.push(logEntry);
              } else {
                const agentAttackCtx = buildAgentAttackCtx();
                await runCozeAttacksForTask({
                  ctx: agentAttackCtx,
                  db,
                  attackCommandsTable,
                  agentConfig,
                  apiKey,
                  apiBaseUrl,
                  botId: String(botId),
                  userId,
                });
              }
            } else if (agent && agent.type === 'n8n') {
              const agentConfig = agent.config as any;
              const apiKey = agentConfig?.apiKey;
              const apiBaseUrl = agentConfig?.apiBaseUrl;
              const userId = agentConfig?.userId || 'task-runner';
              const inputs = agentConfig?.inputs || {};
              const webhookUrl = agentConfig?.webhookUrl;
              const webhookPath = agentConfig?.webhookPath;

              if (webhookUrl || (apiBaseUrl && webhookPath)) {
                const agentAttackCtx = buildAgentAttackCtx();

                await runN8nAttacksForTask({
                  ctx: agentAttackCtx,
                  db,
                  attackCommandsTable,
                  agentConfig,
                  apiKey,
                  apiBaseUrl: String(apiBaseUrl || ''),
                  userId,
                  inputs,
                });
              } else {
                const logEntry = {
                  id: `run-${now.getTime()}-n8n-misconfig`,
                  timestamp: new Date().toISOString(),
                  level: 'warn',
                  message:
                    'N8N agent missing required configuration: webhookUrl, or apiBaseUrl + webhookPath; skipped real call',
                  source: 'n8n',
                };
                runLogs.push(logEntry);
                thisRunLogs.push(logEntry);
              }
            } else if (agent && agent.type === 'fastgpt') {
              const agentConfig = agent.config as any;
              const apiKey = agentConfig?.apiKey;
              const apiBaseUrl = agentConfig?.apiBaseUrl;
              const userId = agentConfig?.userId || 'task-runner';
              const inputs = agentConfig?.inputs || {};

              if (apiKey && apiBaseUrl) {
                const agentAttackCtx = buildAgentAttackCtx();
                await runFastGptAttacksForTask({
                  ctx: agentAttackCtx,
                  db,
                  attackCommandsTable,
                  agentConfig,
                  apiKey,
                  apiBaseUrl,
                  userId,
                  inputs,
                });
              } else {
                const logEntry = {
                  id: `run-${now.getTime()}-fastgpt-misconfig`,
                  timestamp: new Date().toISOString(),
                  level: 'warn',
                  message:
                    'FastGPT Target Agent 未配置 apiKey 或 apiBaseUrl：未向 FastGPT 发送任何 HTTP 请求。请在 Agents 中补全后重试；请求由 DodoGuard 服务端发出，不会在浏览器 Network 中出现。',
                  source: 'fastgpt',
                };
                runLogs.push(logEntry);
                thisRunLogs.push(logEntry);
              }
            } else if (agent && agent.type === 'tencent-adp') {
              const agentConfig = agent.config as any;
              const appKey = agentConfig?.apiKey;
              const visitorId = agentConfig?.userId;

              if (appKey && visitorId) {
                const agentAttackCtx = buildAgentAttackCtx();
                await runTencentAdpAttacksForTask({
                  ctx: agentAttackCtx,
                  db,
                  attackCommandsTable,
                  agentConfig,
                });
              } else {
                const logEntry = {
                  id: `run-${now.getTime()}-tencent-adp-misconfig`,
                  timestamp: new Date().toISOString(),
                  level: 'warn',
                  message:
                    '腾讯 ADP Target Agent 未配置 AppKey 或 VisitorId：未发送任何请求。请在 Agents 中补全后重试。',
                  source: 'tencent-adp',
                };
                runLogs.push(logEntry);
                thisRunLogs.push(logEntry);
              }
            } else if (agent && agent.type === 'api-stream') {
              const agentConfig = agent.config as any;
              const userId = agentConfig?.userId || 'task-runner';
              const inputs = agentConfig?.inputs || {};
              const apiBaseUrl = agentConfig?.apiBaseUrl;

              if (apiBaseUrl) {
                const agentAttackCtx = buildAgentAttackCtx();

                // Ensure runner treats this as an SSE-stream API.
                const streamAgentConfig = { ...agentConfig, apiType: 'api-stream' };

                await runApiAttacksForTask({
                  ctx: agentAttackCtx,
                  db,
                  attackCommandsTable,
                  agentConfig: streamAgentConfig,
                  userId,
                  inputs,
                });
              } else {
                const logEntry = {
                  id: `run-${now.getTime()}-api-stream-misconfig`,
                  timestamp: new Date().toISOString(),
                  level: 'warn',
                  message: 'API stream agent missing apiBaseUrl; skipped real call',
                  source: 'api-stream',
                };
                runLogs.push(logEntry);
                thisRunLogs.push(logEntry);
              }
            } else if (agent && agent.type === 'api') {
              const agentConfig = agent.config as any;
              const userId = agentConfig?.userId || 'task-runner';
              const inputs = agentConfig?.inputs || {};
              const apiBaseUrl = agentConfig?.apiBaseUrl;

              if (apiBaseUrl) {
                const agentAttackCtx = buildAgentAttackCtx();
                await runApiAttacksForTask({
                  ctx: agentAttackCtx,
                  db,
                  attackCommandsTable,
                  agentConfig,
                  userId,
                  inputs,
                });
              } else {
                const logEntry = {
                  id: `run-${now.getTime()}-api-misconfig`,
                  timestamp: new Date().toISOString(),
                  level: 'warn',
                  message: 'API agent missing apiBaseUrl; skipped real call',
                  source: 'api',
                };
                runLogs.push(logEntry);
                thisRunLogs.push(logEntry);
              }
            } else if (agent && agent.type === 'langchain') {
              const agentConfig = agent.config as any;
              const userId = agentConfig?.userId || 'task-runner';
              const inputs = agentConfig?.inputs || {};
              const apiBaseUrl = agentConfig?.apiBaseUrl;

              if (apiBaseUrl) {
                const agentAttackCtx = buildAgentAttackCtx();
                await runLangChainAttacksForTask({
                  ctx: agentAttackCtx,
                  db,
                  attackCommandsTable,
                  agentConfig,
                  userId,
                  inputs,
                });
              } else {
                const logEntry = {
                  id: `run-${now.getTime()}-langchain-misconfig`,
                  timestamp: new Date().toISOString(),
                  level: 'warn',
                  message: 'LangChain agent missing apiBaseUrl; skipped real call',
                  source: 'langchain',
                };
                runLogs.push(logEntry);
                thisRunLogs.push(logEntry);
              }
            } else if (agent) {
              const logEntry = {
                id: `run-${now.getTime()}-agent-unsupported`,
                timestamp: new Date().toISOString(),
                level: 'warn',
                source: 'system',
                message: `Target agent type "${String((agent as any).type)}" is not supported for task execution yet. Skipped real agent call.`,
                agentType: (agent as any).type,
              };
              runLogs.push(logEntry);
              thisRunLogs.push(logEntry);
            } else {
              const logEntry = {
                id: `run-${now.getTime()}-agent-not-found`,
                timestamp: new Date().toISOString(),
                level: 'warn',
                source: 'system',
                message: `Target agent not found for agentId=${String(agentId)}; skipped agent execution`,
              };
              runLogs.push(logEntry);
              thisRunLogs.push(logEntry);
            }
          }
        } else {
          const logEntry = {
            id: `run-${now.getTime()}-missing-agentId`,
            timestamp: new Date().toISOString(),
            level: 'warn',
            source: 'system',
            message:
              'Task targetType is "agent" but targetConfig.agentId is missing; skipped agent execution',
          };
          runLogs.push(logEntry);
          thisRunLogs.push(logEntry);
        }
      } else {
        const logEntry = {
          id: `run-${now.getTime()}-unsupported-targetType`,
          timestamp: new Date().toISOString(),
          level: 'warn',
          source: 'system',
          message: `Task targetType "${String(
            existing.targetType,
          )}" execution is not implemented yet; skipped target execution`,
          targetType: existing.targetType,
        };
        runLogs.push(logEntry);
        thisRunLogs.push(logEntry);
      }
    } catch (callError: any) {
      logger.error('Error during target agent call in task run:', callError);
      const logEntry = {
        id: `run-${now.getTime()}-agent-exception`,
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Exception during agent execution: ${callError?.message || String(callError)}`,
        source: 'system',
      };
      runLogs.push(logEntry);
      thisRunLogs.push(logEntry);
    }

    // After target-agent calls: legacy / API test / gray-box task (dynamic) judgment
    const targetLogs = thisRunLogs.filter(
      (log: any) =>
        (log.source === 'dify' ||
          log.source === 'coze' ||
          log.source === 'n8n' ||
          log.source === 'fastgpt' ||
          log.source === 'tencent-adp' ||
          log.source === 'api' ||
          log.source === 'langchain') &&
        log.responsePreview,
    );

    const shouldRunJudgment =
      taskKind !== 'config_static' &&
      targetLogs.length > 0 &&
      (taskKind === 'api_test' ||
        taskKind === 'config_audit' ||
        taskKind === 'single_test' ||
        detectionConfig?.useLLM === true);

    if (shouldRunJudgment) {
      try {
        await runPostAgentJudgment({
          db,
          now,
          organizationId,
          thisRunLogs,
          runLogs,
          targetLogs,
          taskKind,
          taskMetadata: metadata as Record<string, unknown>,
          detectionConfig,
        });
      } catch (judgeError: any) {
        logger.error('Error during post-agent judgment in task run:', judgeError);
        const logEntry = {
          id: `run-${now.getTime()}-judgment-exception`,
          timestamp: new Date().toISOString(),
          level: 'error',
          source: 'system',
          message: `Exception during judgment: ${judgeError?.message || String(judgeError)}`,
        };
        runLogs.push(logEntry);
        thisRunLogs.push(logEntry);
      }
    } else if (detectionConfig?.useLLM === true && taskKind !== 'config_static') {
      const skipReason =
        targetLogs.length === 0
          ? 'LLM judgment skipped: no agent API response in this run (check target agent config / attack commands)'
          : `LLM judgment skipped for taskKind=${taskKind ?? 'unknown'}`;
      const logEntry = {
        id: `run-${now.getTime()}-judgment-skipped`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message: skipReason,
      };
      runLogs.push(logEntry);
      thisRunLogs.push(logEntry);
    }

    const taskPlatformFamily = (existing as { platformFamily?: string | null }).platformFamily;
    const taskPf = String(taskPlatformFamily ?? '').toLowerCase();
    const isCozePlatform = taskPf === 'coze';
    const isFastgptPlatform = taskPf === 'fastgpt';
    const isN8nPlatform = taskPf === 'n8n';
    const isMultiRoundCreation =
      (metadata as { creationMode?: string })?.creationMode === 'multi_round_test';
    const shouldRunWholeYamlStaticAudit =
      taskKind === 'config_audit' ||
      (taskKind === 'single_test' && !isMultiRoundCreation) ||
      (taskKind === 'config_static' && detectionConfig?.useKnowledgeBase === true) ||
      (taskKind === 'config_static' && isCozePlatform) ||
      (taskKind === 'config_static' && isFastgptPlatform) ||
      (taskKind === 'config_static' && isN8nPlatform);

    if (shouldRunWholeYamlStaticAudit) {
      const cfg = (metadata as any)?.configAudit as
        | { yaml?: string; json?: string; fileName?: string }
        | undefined;
      const staticLogPrefix = isCozePlatform
        ? 'coze'
        : isFastgptPlatform
          ? 'fastgpt'
          : isN8nPlatform
            ? 'n8n'
            : 'dify';
      try {
        const { resolveLlmProviderPayloadForRuntime } = await import(
          '../../../../lib/resolve-llm-provider-runtime'
        );
        const staticAuditProvider = await resolveLlmProviderPayloadForRuntime({
          preferredModelId: detectionConfig?.llmConfig?.model,
          organizationId,
        });
        const providerArg = staticAuditProvider
          ? { id: staticAuditProvider.id, config: staticAuditProvider.config }
          : undefined;
        const auditResult = isCozePlatform
          ? await runStaticCozeConfigAuditForTask({
              organizationId: organizationId ?? undefined,
              yamlText: cfg?.yaml,
              fileName: cfg?.fileName,
              provider: providerArg,
            })
          : isFastgptPlatform || isN8nPlatform
            ? await runStaticFastGptConfigAuditForTask({
                organizationId: organizationId ?? undefined,
                jsonText: cfg?.json,
                fileName: cfg?.fileName,
                provider: providerArg,
              })
            : await runStaticDifyConfigAuditForTask({
                organizationId: organizationId ?? undefined,
                yamlText: cfg?.yaml,
                fileName: cfg?.fileName,
                provider: providerArg,
              });
        if (auditResult?.data) {
          (metadata as any).configAuditStaticSummary = buildConfigAuditStaticSummaryPayload(
            auditResult.data,
            auditResult.reportId,
          );
          const d = auditResult.data;
          const productLabel = isCozePlatform
            ? 'Coze'
            : isFastgptPlatform
              ? 'FastGPT'
              : isN8nPlatform
                ? 'N8N'
                : 'Dify';
          const logEntry = {
            id: `run-${now.getTime()}-${staticLogPrefix}-config-audit-static`,
            timestamp: new Date().toISOString(),
            level: 'info',
            source: `${staticLogPrefix}-config-audit-static`,
            message: `${productLabel} static config audit completed: ${String(d.overallRisk || '')} risk`,
            reportId: auditResult.reportId,
            findingsCount: Array.isArray(d.findings) ? d.findings.length : 0,
          };
          runLogs.push(logEntry);
          thisRunLogs.push(logEntry);
        } else if (isCozePlatform) {
          const hasYaml = Boolean(String(cfg?.yaml ?? '').trim());
          (metadata as any).configAuditStaticSummary = buildCozeDegradedConfigAuditStaticSummary(
            hasYaml
              ? 'Static audit returned no data (unexpected).'
              : 'No workflow YAML in task metadata (configAudit.yaml). Upload Coze export YAML to run static LLM audit.',
          );
          const logEntry = {
            id: `run-${now.getTime()}-coze-config-audit-static-warn`,
            timestamp: new Date().toISOString(),
            level: 'warn',
            source: 'coze-config-audit-static',
            message: hasYaml
              ? 'Coze static YAML audit produced no data; wrote degraded summary to metadata.'
              : 'Coze static YAML audit skipped: no YAML in configAudit; wrote degraded summary.',
          };
          runLogs.push(logEntry);
          thisRunLogs.push(logEntry);
        } else if (isFastgptPlatform || isN8nPlatform) {
          const hasJson = Boolean(String(cfg?.json ?? '').trim());
          (metadata as any).configAuditStaticSummary = buildFastGptDegradedConfigAuditStaticSummary(
            hasJson
              ? 'Static audit returned no data (unexpected).'
              : isN8nPlatform
                ? 'No workflow export in task metadata (configAudit.json). Upload N8N workflow JSON to run static LLM audit.'
                : 'No workflow export in task metadata (configAudit.json). Upload FastGPT workflow JSON to run static LLM audit.',
          );
          const logEntry = {
            id: `run-${now.getTime()}-${isN8nPlatform ? 'n8n' : 'fastgpt'}-config-audit-static-warn`,
            timestamp: new Date().toISOString(),
            level: 'warn',
            source: isN8nPlatform ? 'n8n-config-audit-static' : 'fastgpt-config-audit-static',
            message: hasJson
              ? `${isN8nPlatform ? 'N8N' : 'FastGPT'} static audit produced no data; wrote degraded summary to metadata.`
              : `${isN8nPlatform ? 'N8N' : 'FastGPT'} static audit skipped: no JSON export in configAudit; wrote degraded summary.`,
          };
          runLogs.push(logEntry);
          thisRunLogs.push(logEntry);
        }
      } catch (staticErr: any) {
        logger.error('Config-audit static YAML analysis failed:', staticErr);
        const logEntry = {
          id: `run-${now.getTime()}-${staticLogPrefix}-config-audit-static-error`,
          timestamp: new Date().toISOString(),
          level: 'error',
          source: `${staticLogPrefix}-config-audit-static-error`,
          message: staticErr?.message || String(staticErr),
        };
        runLogs.push(logEntry);
        thisRunLogs.push(logEntry);
        if (isCozePlatform && !(metadata as any).configAuditStaticSummary) {
          (metadata as any).configAuditStaticSummary = buildCozeDegradedConfigAuditStaticSummary(
            staticErr?.message || String(staticErr),
          );
        }
        if ((isFastgptPlatform || isN8nPlatform) && !(metadata as any).configAuditStaticSummary) {
          (metadata as any).configAuditStaticSummary = buildFastGptDegradedConfigAuditStaticSummary(
            staticErr?.message || String(staticErr),
          );
        }
      }
    }

    metadata.runLogs = runLogs;
    if ((metadata as any).runProgress) {
      delete (metadata as any).runProgress;
    }

    // Persist each target response + LLM judge result as an attack_result (finding).
    const attackResultsTable = getAttackResultsTable();
    let persistedAttackResultRows = 0;
    let vulnerableResultCount = 0;
    if (attackResultsTable) {
      const getRequestMatchKey = (log: any) => {
        const promptPreview = String(log.prompt || '').slice(0, 200);
        return [
          String(log.source || ''),
          String(log.url || ''),
          String(log.commandId ?? 'null'),
          String(log.vulnerabilityId ?? 'null'),
          String(log.conversationRound ?? ''),
          String(log.compositeStageId ?? ''),
          promptPreview,
        ].join('|');
      };

      const targetLogsForInsert = (() => {
        const agentSources = new Set([
          'dify',
          'coze',
          'n8n',
          'fastgpt',
          'api',
          'langchain',
          'tencent-adp',
        ]);
        let logs = thisRunLogs.filter(
          (log: any) =>
            agentSources.has(String(log.source || '')) &&
            (log.responsePreview != null || log.error != null),
        );
        if (isMultiRoundPreRecordedMetadata(metadata)) {
          const primary = logs.filter((log: any) => log.multiRoundPrimary === true);
          if (primary.length > 0) {
            logs = primary;
          }
        }
        return logs;
      })();
      persistedAttackResultRows = targetLogsForInsert.length;

      const singleTestPrompt = String(
        (metadata as { singleTest?: { prompt?: unknown } })?.singleTest?.prompt ?? '',
      ).trim();

      for (const log of targetLogsForInsert) {
        const matchKey = getRequestMatchKey(log);
        const {
          vulnerable,
          reason,
          confidence: judgeConfidence,
        } = resolveFinalVulnerableForLog({
          taskKind,
          matchKey,
          allLogs: thisRunLogs,
        });
        const riskLevel = vulnerable ? 'high' : 'low';
        if (vulnerable) {
          vulnerableResultCount += 1;
        }
        const finalVerdict = {
          vulnerable,
          confidence: judgeConfidence ?? (vulnerable ? 0.8 : 0.2),
          reason,
          riskLevel,
        };
        const requestPayload = {
          prompt: String(log.prompt || singleTestPrompt || '').trim() || undefined,
          url: log.url,
        };
        const responsePayload: Record<string, unknown> =
          log.responsePreview != null ? { preview: log.responsePreview } : { error: log.error };
        const d = log.durationMs;
        if (typeof d === 'number' && Number.isFinite(d) && d >= 0) {
          responsePayload.durationMs = Math.round(d);
        }
        const row: any = {
          taskId,
          vulnerabilityId: log.vulnerabilityId || null,
          commandId: log.commandId || null,
          attackMode: existing.attackMode || 'simple',
          request: requestPayload,
          response: responsePayload,
          finalVerdict,
          createdAt: new Date(),
        };
        const detectionResults = resolveDetectionResultsForLog({
          taskKind,
          matchKey,
          allLogs: thisRunLogs,
        });
        if (detectionResults) {
          row.detectionResults = detectionResults;
        }
        if (getDbType() === 'mysql') {
          row.id = uuidv4();
          if (scanRunId) {
            row.scanRunId = scanRunId;
            row.platformFamily =
              (existing as { platformFamily?: string | null }).platformFamily ?? null;
            row.rawResultType = 'api_round';
            row.normalizedStatus = vulnerable ? 'fail' : 'pass';
            row.findingCandidateKey = `${taskId}|${String(log.vulnerabilityId ?? 'none')}|${scanRunId}`;
          }
        }
        try {
          await db.insert(attackResultsTable).values(row);
        } catch (insertErr: any) {
          logger.error('Insert attack_result error:', { error: insertErr?.message, taskId });
        }
      }
    }

    await syncFindingRecordsFromTaskRun({
      organizationId: organizationId!,
      taskId,
      scanRunId,
      platformFamily: (existing as { platformFamily?: string | null }).platformFamily ?? null,
    });

    if (vulnerableResultCount > 0) {
      await maybeNotifyAttackTaskUser({
        type: 'vulnerability_found',
        taskId,
        taskName: taskDisplayName ?? taskId,
        userId: taskOwnerUserId ?? '',
        organizationId: organizationId!,
        executionSettings,
        vulnerabilityCount: vulnerableResultCount,
      });
    }

    await completeMysqlScanRun(scanRunId, {
      taskId,
      persistedResultRows: persistedAttackResultRows,
    });

    if (await isTaskCanceled()) {
      metadata.runLogs = runLogs;
      if ((metadata as any).runProgress) {
        delete (metadata as any).runProgress;
      }
      await db
        .update(table)
        .set({
          status: 'canceled',
          updatedAt: new Date(),
          metadata,
        })
        .where(and(eq(table.id, taskId), eq(table.organizationId, organizationId)));
      notifyExternalTaskTerminalFromPayload({
        taskId,
        organizationId: organizationId!,
        status: 'canceled',
        metadata,
      });
      return;
    }

    const totalDurationMs = Date.now() - now.getTime();
    const llmJudgeLogs = thisRunLogs.filter((l: { source?: string }) => l.source === 'llm-judge');
    const planLog = thisRunLogs.find(
      (l: { message?: string }) =>
        typeof l.message === 'string' && l.message.startsWith('Config-static scan plan'),
    );
    const summaryParts = [
      `Task completed in ${totalDurationMs}ms`,
      `taskKind=${taskKind ?? 'unknown'}`,
      `useRule=${detectionConfig.useRule}`,
      `useLLM=${detectionConfig.useLLM}`,
      `vulnerabilities=${taskVulnerabilities.length}`,
      `llmJudgeLogs=${llmJudgeLogs.length}`,
    ];
    if (!detectionConfig.useLLM) {
      summaryParts.push(
        'note=useLLM is off — LM Studio is not called (enable LLM detection in task config)',
      );
    } else if (llmJudgeLogs.length === 0) {
      summaryParts.push(
        'warn=useLLM on but zero llm-judge logs — see config-static-plan / no-yaml / no-vulns / no-detection logs',
      );
    } else {
      const durations = llmJudgeLogs
        .map((l: { durationMs?: number }) => l.durationMs)
        .filter((d): d is number => typeof d === 'number' && Number.isFinite(d));
      if (durations.length > 0) {
        const sum = durations.reduce((a, b) => a + b, 0);
        summaryParts.push(`llmJudgeDurationMs total=${sum}, max=${Math.max(...durations)}`);
      }
      const fastFailures = llmJudgeLogs.filter(
        (l: { durationMs?: number; level?: string }) =>
          l.level === 'warn' || l.level === 'error' || (l.durationMs != null && l.durationMs < 500),
      ).length;
      if (fastFailures > 0 && totalDurationMs < 5000) {
        summaryParts.push(
          `warn=${fastFailures} llm-judge row(s) failed or finished <500ms — likely connection/config issue, not slow inference`,
        );
      }
    }
    if (planLog && typeof planLog.message === 'string') {
      summaryParts.push(`plan=${planLog.message.slice(0, 280)}`);
    }
    const completionSummaryLog = {
      id: `run-${now.getTime()}-completed-summary`,
      timestamp: new Date().toISOString(),
      level: 'info',
      source: 'system',
      message: summaryParts.join(' | '),
      durationMs: totalDurationMs,
    };
    runLogs.push(completionSummaryLog);
    thisRunLogs.push(completionSummaryLog);
    metadata.runLogs = runLogs;

    // Update task status and metadata to reflect this run.
    // 当前实现是一次检测跑完后标记为 completed。
    await db
      .update(table)
      .set({
        status: 'completed',
        updatedAt: now,
        metadata,
      })
      .where(and(eq(table.id, taskId), eq(table.organizationId, organizationId)));
    notifyExternalTaskTerminalFromPayload({
      taskId,
      organizationId: organizationId!,
      status: 'completed',
      metadata,
    });
    await maybeNotifyAttackTaskUser({
      type: 'complete',
      taskId,
      taskName: taskDisplayName ?? taskId,
      userId: taskOwnerUserId ?? '',
      organizationId: organizationId!,
      executionSettings,
    });
  } catch (error: any) {
    logger.error('Run attack task error (background):', error);

    await failMysqlScanRun(scanRunId, error?.message || String(error));

    try {
      const table = getAttackTasksTable();
      if (!table || !organizationId) {
        return;
      }

      // Append failure log into metadata.runLogs
      const failureLog = {
        id: `run-${now.getTime()}-failed`,
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Task run failed: ${error?.message || String(error)}`,
        source: 'system',
      };
      runLogs.push(failureLog);
      if (!metadata || typeof metadata !== 'object') {
        metadata = {};
      }
      (metadata as any).runLogs = runLogs;
      if ((metadata as any).runProgress) {
        delete (metadata as any).runProgress;
      }

      const [latest] = await db
        .select({ status: table.status })
        .from(table)
        .where(and(eq(table.id, taskId), eq(table.organizationId, organizationId)))
        .limit(1);
      if (latest?.status !== 'canceled') {
        await db
          .update(table)
          .set({
            status: 'failed',
            updatedAt: new Date(),
            metadata,
          })
          .where(and(eq(table.id, taskId), eq(table.organizationId, organizationId)));
        notifyExternalTaskTerminalFromPayload({
          taskId,
          organizationId: organizationId!,
          status: 'failed',
          metadata,
        });
        if (taskOwnerUserId) {
          await maybeNotifyAttackTaskUser({
            type: 'failure',
            taskId,
            taskName: taskDisplayName ?? taskId,
            userId: taskOwnerUserId,
            organizationId: organizationId!,
            executionSettings: executionSettings ?? parseAttackTaskExecutionSettings(metadata),
            errorMessage: error?.message || String(error),
          });
        }
      }
    } catch (updateError) {
      logger.error('Failed to update task status to failed after background error:', updateError);
    }
  }
}

/**
 * POST /api/v1/attack-tasks/:id/cancel
 * Cancel attack task execution
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const table = getAttackTasksTable();
    if (!table) {
      logger.error('attackTasksTable is undefined for current DB type');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
      });
    }

    // Ensure task exists and belongs to org
    const [existing] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: 'Attack task not found',
        },
      });
    }

    let meta = existing.metadata || {};
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = {};
      }
    }
    const mergedMeta =
      typeof meta === 'object' && meta !== null && !Array.isArray(meta)
        ? { ...(meta as Record<string, unknown>), canceledAt: new Date().toISOString() }
        : { canceledAt: new Date().toISOString() };

    // Update status to canceled (MySQL driver does not support .returning())
    await db
      .update(table)
      .set({
        status: 'canceled',
        updatedAt: new Date(),
        metadata: mergedMeta as unknown as Record<string, unknown>,
      })
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)));

    notifyExternalTaskTerminalFromPayload({
      taskId: id,
      organizationId: organizationId!,
      status: 'canceled',
      metadata: mergedMeta,
    });

    res.json({
      success: true,
      message: 'Task canceled successfully',
    });
  } catch (error: any) {
    logger.error('Cancel attack task error:', {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sql: error?.sql,
      sqlMessage: error?.sqlMessage,
      stack: error?.stack,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel task',
      },
    });
  }
});

/**
 * DELETE /api/v1/attack-tasks/:id
 * Delete attack task
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

    const table = getAttackTasksTable();
    if (!table) {
      logger.error('attackTasksTable is undefined for current DB type');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
      });
    }

    // Ensure the task exists and belongs to the organization
    const [existing] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: 'Attack task not found',
        },
      });
    }

    await db.delete(table).where(and(eq(table.id, id), eq(table.organizationId, organizationId)));

    res.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    logger.error('Delete attack task error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete attack task',
      },
    });
  }
});

/**
 * PUT /api/v1/attack-tasks/:id
 * Update attack task (basic fields)
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

    const table = getAttackTasksTable();
    if (!table) {
      logger.error('attackTasksTable is undefined for current DB type');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Attack tasks table not initialized' },
      });
    }

    // Only allow updating a subset of fields for now
    const payload = req.body || {};
    const updateValues: any = {};

    if (typeof payload.name === 'string') {
      updateValues.name = payload.name;
    }
    if (typeof payload.description === 'string' || payload.description === null) {
      updateValues.description = payload.description;
    }
    if (payload.attackMode) {
      updateValues.attackMode = payload.attackMode;
    }
    if (Array.isArray(payload.vulnerabilities)) {
      updateValues.vulnerabilities = payload.vulnerabilities;
    }
    if (payload.targetConfig !== undefined) {
      updateValues.targetConfig = payload.targetConfig;
    }
    if (payload.detectionConfig !== undefined) {
      updateValues.detectionConfig = payload.detectionConfig;
    }
    if (payload.agentConfig !== undefined) {
      updateValues.agentConfig = payload.agentConfig;
    }

    if (Object.keys(updateValues).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FIELDS_TO_UPDATE',
          message: 'No valid fields provided for update',
        },
      });
    }

    updateValues.updatedAt = new Date();

    await db
      .update(table)
      .set(updateValues)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)));

    // drizzle mysql driver doesn't support returning(), so fetch the updated row
    const [updated] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: 'Attack task not found',
        },
      });
    }

    res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    logger.error('Update attack task error:', {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sql: error?.sql,
      sqlMessage: error?.sqlMessage,
      stack: error?.stack,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update attack task',
      },
    });
  }
});

export default router;
