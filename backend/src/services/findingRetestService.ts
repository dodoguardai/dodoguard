/**
 * Create a retest attack task from an existing finding (clone baseline task, narrow vulnerabilities).
 */

import { and, eq } from 'drizzle-orm';
import { db, getDbType } from '../database';
import { findingsService } from './findingsService';
import {
  AttackTaskQuotaCheckError,
  AttackTaskQuotaExceededError,
  insertAttackTaskRow,
} from './attackTaskInsertService';

export type FindingRetestMode = 'finding_scoped' | 'full_task';

function getAttackTasksTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../database/tables-mysql');
    return mysqlTables.attackTasksTable;
  }
  const pgTables = require('../database/tables-enterprise');
  return pgTables.attackTasksTable;
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw == null) {
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return typeof p === 'object' && p != null && !Array.isArray(p)
        ? { ...(p as Record<string, unknown>) }
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

export async function createRetestTaskFromFinding(params: {
  findingId: string;
  organizationId: string;
  userId: string;
  mode: FindingRetestMode;
  nameSuffix?: string;
  configAudit?: { yaml?: string; json?: string; fileName?: string };
}): Promise<
  | { ok: true; task: any }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: AttackTaskQuotaExceededError['details'];
    }
> {
  const finding = await findingsService.getById(params.findingId, params.organizationId);
  if (!finding?.taskId) {
    return { ok: false, status: 404, code: 'FINDING_NOT_FOUND', message: 'Finding not found' };
  }
  if (params.mode === 'finding_scoped' && !finding.vulnerabilityId) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_VULNERABILITY',
      message: 'Finding has no vulnerability id; use full_task mode or fix the finding',
    };
  }

  const table = getAttackTasksTable();
  if (!table) {
    return {
      ok: false,
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Attack tasks table not available',
    };
  }

  const [baseline] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, finding.taskId), eq(table.organizationId, params.organizationId)))
    .limit(1);

  if (!baseline) {
    return {
      ok: false,
      status: 404,
      code: 'BASELINE_TASK_NOT_FOUND',
      message: 'Baseline attack task not found',
    };
  }

  if (baseline.status === 'running') {
    return {
      ok: false,
      status: 409,
      code: 'BASELINE_TASK_RUNNING',
      message: 'Baseline task is still running; wait for it to finish before retesting',
    };
  }

  const vulnName = finding.vulnerabilityName || finding.vulnerabilityId || 'finding';
  const shortId = params.findingId.slice(0, 8);
  const baseName = params.nameSuffix?.trim()
    ? `Retest (${params.nameSuffix.trim()}): ${vulnName}`
    : `Retest: ${vulnName} (${shortId})`;

  const baselineVulns = Array.isArray(baseline.vulnerabilities) ? baseline.vulnerabilities : [];
  const vulnerabilities = params.mode === 'full_task' ? baselineVulns : [finding.vulnerabilityId];

  const meta = parseMetadata(baseline.metadata);
  meta.retestFindingId = params.findingId;
  meta.retestMode = params.mode;
  meta.retestBaselineTaskId = baseline.id;
  const taskKindRaw = meta.taskKind;
  const taskKind = typeof taskKindRaw === 'string' ? taskKindRaw : '';
  const requiresConfigAudit = taskKind === 'config_audit' || taskKind === 'config_static';
  if (requiresConfigAudit) {
    const yamlText =
      typeof params.configAudit?.yaml === 'string' ? params.configAudit.yaml.trim() : '';
    const jsonText =
      typeof params.configAudit?.json === 'string' ? params.configAudit.json.trim() : '';
    const payloadIsEmpty = !yamlText && !jsonText;
    if (payloadIsEmpty) {
      return {
        ok: false,
        status: 400,
        code: 'CONFIG_AUDIT_REQUIRED',
        message: 'Config task retest requires uploading config file again',
      };
    }
    meta.configAudit = {
      ...(yamlText ? { yaml: yamlText } : {}),
      ...(jsonText ? { json: jsonText } : {}),
      ...(typeof params.configAudit?.fileName === 'string' && params.configAudit.fileName.trim()
        ? { fileName: params.configAudit.fileName.trim() }
        : {}),
    };
  }

  const dbType = getDbType();
  const insertValues: any = {
    name: baseName,
    description: baseline.description ?? null,
    teamId: baseline.teamId ?? null,
    targetType: baseline.targetType,
    targetConfig: baseline.targetConfig,
    vulnerabilities,
    attackMode: baseline.attackMode,
    compositeAttackConfig: baseline.compositeAttackConfig ?? null,
    detectionConfig: baseline.detectionConfig,
    agentConfig: baseline.agentConfig ?? null,
    organizationId: params.organizationId,
    userId: params.userId,
    status: 'pending',
    metadata: meta,
  };

  if (dbType === 'mysql') {
    insertValues.taskTypeId = baseline.taskTypeId ?? null;
    insertValues.platformFamily = baseline.platformFamily ?? null;
    insertValues.scanMode = baseline.scanMode ?? null;
    insertValues.entrypointType = baseline.entrypointType ?? null;
    insertValues.artifactRefs = baseline.artifactRefs ?? null;
    insertValues.judgeConfig = baseline.judgeConfig ?? null;
    insertValues.reportPreference = baseline.reportPreference ?? null;
    insertValues.scheduleConfig = baseline.scheduleConfig ?? null;
    insertValues.retestOfTaskId = baseline.id;
    insertValues.baselineTaskId = baseline.id;
  } else {
    insertValues.metadata = {
      ...meta,
      retestOfTaskId: baseline.id,
      baselineTaskId: baseline.id,
    };
  }

  try {
    const newTask = await insertAttackTaskRow(table, insertValues);
    return { ok: true, task: newTask };
  } catch (e: unknown) {
    if (e instanceof AttackTaskQuotaExceededError) {
      return {
        ok: false,
        status: 403,
        code: e.code,
        message: `本月攻击任务数量配额已满。当前使用: ${e.details.currentUsage}/${e.details.limit === -1 ? '无限制' : e.details.limit}。`,
        details: e.details,
      };
    }
    if (e instanceof AttackTaskQuotaCheckError) {
      return {
        ok: false,
        status: 500,
        code: e.code,
        message: '配额检查失败，无法创建复测任务',
      };
    }
    const err = e as { message?: string };
    return {
      ok: false,
      status: 500,
      code: 'CREATE_TASK_FAILED',
      message: err?.message ?? 'Failed to create retest task',
    };
  }
}
