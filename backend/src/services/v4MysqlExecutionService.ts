/**
 * MySQL v4: scan_runs + finding_records sync (see DESIGN_VS_IMPLEMENTATION_MATRIX.md).
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../database';
import logger from '../logger';

export function isMysqlV4(): boolean {
  return getDbType() === 'mysql';
}

export async function beginMysqlScanRun(params: {
  taskId: string;
  platformFamily?: string | null;
  scanMode?: string | null;
}): Promise<string | null> {
  if (!isMysqlV4()) { return null; }
  try {
    const { scanRunsTable } = require('../database/tables-mysql');
    const id = uuidv4();
    const now = new Date();
    await db.insert(scanRunsTable).values({
      id,
      taskId: params.taskId,
      platformFamily: params.platformFamily ?? null,
      scanMode: params.scanMode ?? null,
      status: 'running',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  } catch (e: unknown) {
    logger.error('beginMysqlScanRun failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function completeMysqlScanRun(
  scanRunId: string | null,
  summary: Record<string, unknown>,
): Promise<void> {
  if (!scanRunId || !isMysqlV4()) { return; }
  try {
    const { scanRunsTable } = require('../database/tables-mysql');
    const now = new Date();
    await db
      .update(scanRunsTable)
      .set({
        status: 'completed',
        endedAt: now,
        summary,
        updatedAt: now,
      })
      .where(eq(scanRunsTable.id, scanRunId));
  } catch (e: unknown) {
    logger.error('completeMysqlScanRun failed', {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function failMysqlScanRun(scanRunId: string | null, message: string): Promise<void> {
  if (!scanRunId || !isMysqlV4()) { return; }
  try {
    const { scanRunsTable } = require('../database/tables-mysql');
    const now = new Date();
    await db
      .update(scanRunsTable)
      .set({
        status: 'failed',
        endedAt: now,
        summary: { error: message },
        updatedAt: now,
      })
      .where(eq(scanRunsTable.id, scanRunId));
  } catch (e: unknown) {
    logger.error('failMysqlScanRun failed', {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function verdictVulnerable(finalVerdict: unknown): boolean {
  if (!finalVerdict || typeof finalVerdict !== 'object') { return false; }
  const v = (finalVerdict as { vulnerable?: unknown }).vulnerable;
  return v === true || String(v).toLowerCase() === 'true';
}

function riskToSeverity(riskLevel: string | undefined): string {
  const r = (riskLevel || 'high').toLowerCase();
  if (['critical', 'high', 'medium', 'low', 'info'].includes(r)) { return r; }
  return 'high';
}

/**
 * Upsert finding_records from attack_results for this scan run (vulnerable only).
 */
export async function syncFindingRecordsFromTaskRun(params: {
  organizationId: string;
  taskId: string;
  scanRunId: string | null;
  platformFamily?: string | null;
}): Promise<void> {
  if (!isMysqlV4() || !params.scanRunId) { return; }
  try {
    const {
      attackResultsTable,
      findingRecordsTable,
      vulnerabilitiesTable,
    } = require('../database/tables-mysql');

    const rows = await db
      .select()
      .from(attackResultsTable)
      .where(
        and(
          eq(attackResultsTable.taskId, params.taskId),
          eq(attackResultsTable.scanRunId, params.scanRunId),
        ),
      );

    const vulnIds = [
      ...new Set(
        rows.map((r: { vulnerabilityId: string | null }) => r.vulnerabilityId).filter(Boolean),
      ),
    ] as string[];
    const vulnMap: Record<string, { name: string; riskLevel?: string }> = {};
    if (vulnIds.length > 0) {
      const vulns = await db
        .select({
          id: vulnerabilitiesTable.id,
          name: vulnerabilitiesTable.name,
          riskLevel: vulnerabilitiesTable.riskLevel,
        })
        .from(vulnerabilitiesTable)
        .where(inArray(vulnerabilitiesTable.id, vulnIds));
      for (const v of vulns) {
        vulnMap[v.id] = { name: v.name, riskLevel: v.riskLevel ?? undefined };
      }
    }

    for (const ar of rows) {
      const verdict = ar.finalVerdict;
      if (!verdictVulnerable(verdict)) { continue; }

      const vulnId = ar.vulnerabilityId as string | null;
      const dedupeKey = `${params.taskId}|${vulnId ?? 'none'}|${params.scanRunId}`;
      const reason =
        verdict && typeof verdict === 'object' && 'reason' in verdict
          ? String((verdict as { reason?: unknown }).reason ?? '')
          : '';
      const riskLevel =
        verdict && typeof verdict === 'object' && 'riskLevel' in verdict
          ? String((verdict as { riskLevel?: unknown }).riskLevel ?? 'high')
          : 'high';
      const severity = riskToSeverity(riskLevel);
      const titleBase = vulnId && vulnMap[vulnId] ? vulnMap[vulnId].name : 'Security finding';
      const title = titleBase.length > 255 ? `${titleBase.slice(0, 252)}...` : titleBase;

      const existing = await db
        .select()
        .from(findingRecordsTable)
        .where(eq(findingRecordsTable.dedupeKey, dedupeKey))
        .limit(1);

      const conf =
        verdict && typeof verdict === 'object' && 'confidence' in verdict
          ? Number((verdict as { confidence?: unknown }).confidence)
          : undefined;

      if (existing[0]) {
        const prevIds = Array.isArray(existing[0].sourceResultIds)
          ? (existing[0].sourceResultIds as string[])
          : [];
        const nextIds = [...new Set([...prevIds, ar.id])];
        await db
          .update(findingRecordsTable)
          .set({
            sourceResultIds: nextIds,
            summary: reason || existing[0].summary,
            updatedAt: new Date(),
          })
          .where(eq(findingRecordsTable.id, existing[0].id));
      } else {
        await db.insert(findingRecordsTable).values({
          id: uuidv4(),
          organizationId: params.organizationId,
          taskId: params.taskId,
          scanRunId: params.scanRunId,
          vulnerabilityId: vulnId,
          platformFamily: params.platformFamily ?? null,
          title,
          severity,
          confidence: typeof conf === 'number' && Number.isFinite(conf) ? String(conf) : null,
          status: 'open',
          findingType: 'runtime',
          summary: reason || null,
          description: reason || null,
          observations: verdict as object,
          sourceResultIds: [ar.id],
          dedupeKey,
          metadata: { syncedFrom: 'attack_results' },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  } catch (e: unknown) {
    logger.error('syncFindingRecordsFromTaskRun failed', {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Resolve default report template from task_type_report_bindings (highest priority).
 */
export async function resolveTemplateIdForMysqlTaskType(
  taskTypeId: string | null | undefined,
): Promise<string | null> {
  if (!isMysqlV4() || !taskTypeId) { return null; }
  try {
    const { taskTypeReportBindingsTable } = require('../database/tables-mysql');
    const rows = await db
      .select({ templateId: taskTypeReportBindingsTable.templateId })
      .from(taskTypeReportBindingsTable)
      .where(
        and(
          eq(taskTypeReportBindingsTable.taskTypeId, taskTypeId),
          eq(taskTypeReportBindingsTable.enabled, true),
        ),
      )
      .orderBy(desc(taskTypeReportBindingsTable.priority))
      .limit(1);
    return rows[0]?.templateId ?? null;
  } catch {
    return null;
  }
}

export async function listFindingRecordIdsForTask(taskId: string): Promise<string[]> {
  if (!isMysqlV4()) { return []; }
  try {
    const { findingRecordsTable } = require('../database/tables-mysql');
    const rows = await db
      .select({ id: findingRecordsTable.id })
      .from(findingRecordsTable)
      .where(eq(findingRecordsTable.taskId, taskId));
    return rows.map((r: { id: string }) => r.id);
  } catch {
    return [];
  }
}

/** Full rows for report generation (scoped by org). */
export async function listFindingRecordsForReport(
  taskId: string,
  organizationId: string,
): Promise<Record<string, unknown>[]> {
  if (!isMysqlV4()) { return []; }
  try {
    const { findingRecordsTable } = require('../database/tables-mysql');
    return await db
      .select()
      .from(findingRecordsTable)
      .where(
        and(
          eq(findingRecordsTable.taskId, taskId),
          eq(findingRecordsTable.organizationId, organizationId),
        ),
      )
      .orderBy(desc(findingRecordsTable.createdAt));
  } catch (e: unknown) {
    logger.warn('listFindingRecordsForReport failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}
