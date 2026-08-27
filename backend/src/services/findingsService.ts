/**
 * Findings Service
 * Aggregates vulnerability findings from attack_results (produced by attack task runs).
 */

import { db, getDbType } from '../database';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import logger from '../logger';
import {
  sqlEffectiveAttackResultRisk,
  sqlFindingRecordRiskBucket,
  sqlVerdictIsVulnerable,
} from './findingsRiskSql';

/** Dashboard counts from list rows (same risk as toFinding / toFindingFromRecord). Unknown levels bucket to medium. */
function countRiskLevelsFromFindingsData(data: Array<{ riskLevel?: unknown }>): {
  critical: number;
  high: number;
  medium: number;
  low: number;
} {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of data) {
    const r = String(f.riskLevel ?? 'medium')
      .toLowerCase()
      .trim();
    if (r === 'critical') {
      out.critical++;
    } else if (r === 'high') {
      out.high++;
    } else if (r === 'low') {
      out.low++;
    } else {
      out.medium++;
    }
  }
  return out;
}

function getTables() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../database/tables-mysql');
    return {
      attackResultsTable: mysqlTables.attackResultsTable,
      attackTasksTable: mysqlTables.attackTasksTable,
      vulnerabilitiesTable: mysqlTables.vulnerabilitiesTable,
      targetAgentsTable: mysqlTables.targetAgentsTable,
      findingRecordsTable: mysqlTables.findingRecordsTable,
    };
  }
  const pgTables = require('../database/tables-enterprise');
  return {
    attackResultsTable: pgTables.attackResultsTable,
    attackTasksTable: pgTables.attackTasksTable,
    vulnerabilitiesTable: pgTables.vulnerabilitiesTable,
    targetAgentsTable: pgTables.targetAgentsTable,
  };
}

function agentIdFromTaskTargetConfig(targetConfig: unknown): string {
  if (!targetConfig || typeof targetConfig !== 'object') { return ''; }
  const aid = (targetConfig as { agentId?: unknown }).agentId;
  return typeof aid === 'string' ? aid.trim() : '';
}

/** Narrow org tasks by optional taskId / agentId (must match before querying results). */
function filterTaskIdsForListParams(
  tasks: Array<{ id: string; targetConfig: unknown }>,
  params: { taskId?: string; agentId?: string },
): string[] {
  let rows = tasks;
  if (params.taskId) {
    rows = rows.filter((t) => t.id === params.taskId);
  }
  if (params.agentId) {
    const want = String(params.agentId).trim();
    rows = rows.filter((t) => agentIdFromTaskTargetConfig(t.targetConfig) === want);
  }
  return rows.map((t) => t.id);
}

/** Resolve agent name from target_agents; fallback to task.targetConfig.agentName or task.name */
function agentNameFor(agent: { name: string } | null | undefined, task: any): string {
  if (agent?.name) { return agent.name; }
  return task?.targetConfig?.agentName ?? task?.name ?? 'Attack target';
}

/** Map `attack_results.detection_results` JSON to API ruleResults + optional LLM evidence arrays. */
function mapDetectionSummaryPartsFromDet(det: Record<string, unknown> | null | undefined): {
  ruleResults: any[];
  evidencePaths?: string[];
  evidenceSnippets?: string[];
} {
  const d = det && typeof det === 'object' ? det : {};
  const rawHits = Array.isArray((d as any).ruleHits) ? (d as any).ruleHits : [];
  const ruleResults = rawHits.map((h: any) => ({
    ruleId: String(h.ruleId ?? ''),
    ruleName: String(h.ruleName ?? ''),
    matched: true,
    evidence: h.evidence != null ? String(h.evidence) : undefined,
    severity: h.severity != null ? String(h.severity) : undefined,
    confidence:
      typeof h.confidence === 'number' && Number.isFinite(h.confidence) ? h.confidence : 0.9,
    startLine: typeof h.startLine === 'number' ? h.startLine : undefined,
    endLine: typeof h.endLine === 'number' ? h.endLine : undefined,
    startColumn: typeof h.startColumn === 'number' ? h.startColumn : undefined,
    endColumn: typeof h.endColumn === 'number' ? h.endColumn : undefined,
    matchStart: typeof h.matchStart === 'number' ? h.matchStart : undefined,
    matchEnd: typeof h.matchEnd === 'number' ? h.matchEnd : undefined,
    contextSnippet: h.contextSnippet != null ? String(h.contextSnippet) : undefined,
    logicalPath: h.logicalPath != null ? String(h.logicalPath) : undefined,
    matchScope: h.matchScope != null ? String(h.matchScope) : undefined,
  }));

  const llmEv = (d as any).llmEvidence;
  let evidencePaths: string[] | undefined;
  let evidenceSnippets: string[] | undefined;
  if (llmEv && typeof llmEv === 'object') {
    if (Array.isArray(llmEv.evidencePaths)) {
      evidencePaths = llmEv.evidencePaths.map((x: unknown) => String(x)).filter(Boolean);
    }
    if (Array.isArray(llmEv.evidenceSnippets)) {
      evidenceSnippets = llmEv.evidenceSnippets.map((x: unknown) => String(x)).filter(Boolean);
    }
  }

  return {
    ruleResults,
    ...(evidencePaths && evidencePaths.length > 0 ? { evidencePaths } : {}),
    ...(evidenceSnippets && evidenceSnippets.length > 0 ? { evidenceSnippets } : {}),
  };
}

/** Merge detection from multiple attack_result rows (e.g. finding_records.source_result_ids). */
function mergeDetectionSummaryFromAttackRows(
  rows: any[],
  finalVerdict: any,
  riskLevel: string,
): { finalVerdict: any; ruleResults: any[]; llmResult: any } {
  const ruleResults: any[] = [];
  const pathSet = new Set<string>();
  const snipSet = new Set<string>();
  for (const ar of rows) {
    const det =
      ar?.detectionResults && typeof ar.detectionResults === 'object' ? ar.detectionResults : null;
    const parts = mapDetectionSummaryPartsFromDet(det as Record<string, unknown>);
    ruleResults.push(...parts.ruleResults);
    parts.evidencePaths?.forEach((p) => pathSet.add(p));
    parts.evidenceSnippets?.forEach((s) => snipSet.add(s));
  }
  const seen = new Set<string>();
  const deduped = ruleResults.filter((r) => {
    const k = `${r.ruleId}|${r.matchStart ?? ''}|${r.startLine ?? ''}|${String(r.evidence || '').slice(0, 64)}`;
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
  return {
    finalVerdict,
    ruleResults: deduped,
    llmResult: {
      vulnerable: finalVerdict.vulnerable,
      confidence: finalVerdict.confidence,
      reasoning: finalVerdict.reason,
      riskLevel,
      ...(pathSet.size > 0 ? { evidencePaths: [...pathSet] } : {}),
      ...(snipSet.size > 0 ? { evidenceSnippets: [...snipSet] } : {}),
    },
  };
}

/** Map attack_result row + task + vulnerability + optional agent to frontend Finding shape */
function toFinding(ar: any, task: any, vuln: any, agent?: { name: string } | null): any {
  const verdict =
    ar.finalVerdict && typeof ar.finalVerdict === 'object'
      ? ar.finalVerdict
      : { vulnerable: false, confidence: 0, reason: '' };
  const meta = ar.metadata && typeof ar.metadata === 'object' ? ar.metadata : {};
  const riskLevel = verdict.riskLevel || (verdict.vulnerable ? 'high' : 'medium');
  const taskId = ar.taskId ?? task?.id;
  const vulnId = ar.vulnerabilityId ?? vuln?.id;
  const agentId = task?.targetConfig?.agentId ?? '';
  const agentName = agentNameFor(agent, task);

  const finding: any = {
    id: ar.id,
    taskId,
    vulnerabilityId: vulnId || '',
    vulnerabilityName: vuln?.name ?? vulnId ?? 'Unknown',
    agentId,
    agentName,
    riskLevel,
    status: meta.status || 'open',
    detectedAt: ar.createdAt ? new Date(ar.createdAt).toISOString() : new Date().toISOString(),
    finalVerdict: {
      vulnerable: verdict.vulnerable === true || verdict.vulnerable === 'true',
      confidence: typeof verdict.confidence === 'number' ? verdict.confidence : 0.5,
      reason: verdict.reason ?? '',
      riskLevel,
    },
  };

  finding.vulnerability = vuln
    ? { id: vuln.id, name: vuln.name, description: vuln.description, riskLevel: vuln.riskLevel }
    : undefined;
  finding.task = task
    ? { id: task.id, name: task.name, status: task.status, targetType: task.targetType }
    : undefined;

  const det =
    ar.detectionResults && typeof ar.detectionResults === 'object' ? ar.detectionResults : {};
  const parts = mapDetectionSummaryPartsFromDet(det as Record<string, unknown>);

  finding.detectionSummary = {
    finalVerdict: finding.finalVerdict,
    ruleResults: parts.ruleResults,
    llmResult:
      verdict.vulnerable != null
        ? {
            vulnerable: finding.finalVerdict.vulnerable,
            confidence: finding.finalVerdict.confidence,
            reasoning: finding.finalVerdict.reason,
            riskLevel,
            ...(parts.evidencePaths && parts.evidencePaths.length > 0
              ? { evidencePaths: parts.evidencePaths }
              : {}),
            ...(parts.evidenceSnippets && parts.evidenceSnippets.length > 0
              ? { evidenceSnippets: parts.evidenceSnippets }
              : {}),
          }
        : undefined,
  };
  const req = ar.request && typeof ar.request === 'object' ? ar.request : {};
  const res = ar.response && typeof ar.response === 'object' ? ar.response : {};
  finding.conversation = [
    {
      id: 'req-1',
      role: 'attacker',
      content: req.prompt || JSON.stringify(req),
      timestamp: finding.detectedAt,
    },
    {
      id: 'res-1',
      role: 'agent',
      content: res.preview || res.full || JSON.stringify(res),
      timestamp: finding.detectedAt,
    },
  ];
  finding.solutions = vuln?.solutions ?? [];
  if (meta.auditNotes != null) { finding.auditNotes = meta.auditNotes; }

  return finding;
}

/** Map finding_records row to the same API shape as attack_result–based findings (MySQL v4). */
function toFindingFromRecord(
  fr: any,
  task: any,
  vuln: any,
  agent?: { name: string } | null,
  /** Linked `attack_results` rows (from source_result_ids) to merge ruleHits / llmEvidence into detectionSummary. */
  attackResultRows?: any[],
): any {
  const riskLevel = fr.severity || 'medium';
  const meta = fr.metadata && typeof fr.metadata === 'object' ? fr.metadata : {};
  const agentId = task?.targetConfig?.agentId ?? '';
  const agentName = agentNameFor(agent, task);
  const vulnerable = riskLevel === 'critical' || riskLevel === 'high' || riskLevel === 'medium';

  const finding: any = {
    id: fr.id,
    taskId: fr.taskId,
    vulnerabilityId: fr.vulnerabilityId || '',
    vulnerabilityName: vuln?.name ?? fr.vulnerabilityId ?? 'Unknown',
    agentId,
    agentName,
    riskLevel,
    status: fr.status || meta.status || 'open',
    detectedAt: fr.createdAt ? new Date(fr.createdAt).toISOString() : new Date().toISOString(),
    finalVerdict: {
      vulnerable,
      confidence: fr.confidence != null ? Number(fr.confidence) : 0.8,
      reason: fr.summary || fr.description || '',
      riskLevel,
    },
    source: 'finding_records',
  };

  finding.vulnerability = vuln
    ? { id: vuln.id, name: vuln.name, description: vuln.description, riskLevel: vuln.riskLevel }
    : undefined;
  finding.task = task
    ? { id: task.id, name: task.name, status: task.status, targetType: task.targetType }
    : undefined;

  const rows = Array.isArray(attackResultRows) ? attackResultRows.filter(Boolean) : [];
  if (rows.length > 0) {
    finding.detectionSummary = mergeDetectionSummaryFromAttackRows(
      rows,
      finding.finalVerdict,
      riskLevel,
    );
  } else {
    finding.detectionSummary = {
      finalVerdict: finding.finalVerdict,
      ruleResults: [],
      llmResult: {
        vulnerable: finding.finalVerdict.vulnerable,
        confidence: finding.finalVerdict.confidence,
        reasoning: finding.finalVerdict.reason,
        riskLevel,
      },
    };
  }
  finding.conversation = [];
  finding.solutions = vuln?.solutions ?? [];
  return finding;
}

export const findingsService = {
  async list(
    organizationId: string,
    params: {
      limit?: number;
      offset?: number;
      search?: string;
      riskLevel?: string;
      status?: string;
      agentId?: string;
      taskId?: string;
    } = {},
  ): Promise<{ data: any[]; total: number; limit: number; offset: number; hasMore: boolean }> {
    const { attackResultsTable, attackTasksTable, vulnerabilitiesTable } = getTables();
    if (!attackResultsTable || !attackTasksTable) {
      return {
        data: [],
        total: 0,
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
        hasMore: false,
      };
    }

    const limit = Math.min(params.limit ?? 20, 100);
    const offset = params.offset ?? 0;

    try {
      const tasks = await db
        .select({ id: attackTasksTable.id, targetConfig: attackTasksTable.targetConfig })
        .from(attackTasksTable)
        .where(eq(attackTasksTable.organizationId, organizationId));
      const taskIds = filterTaskIdsForListParams(tasks, params);
      if (taskIds.length === 0) {
        return { data: [], total: 0, limit, offset, hasMore: false };
      }

      const dbType = getDbType();
      const tables = getTables() as ReturnType<typeof getTables> & { findingRecordsTable?: any };

      if (dbType === 'mysql' && tables.findingRecordsTable) {
        const { findingRecordsTable, attackResultsTable } = tables;
        const frWhere = [inArray(findingRecordsTable.taskId, taskIds)];
        if (params.riskLevel) {
          frWhere.push(
            sql`${sqlFindingRecordRiskBucket(findingRecordsTable.severity)} = ${params.riskLevel.toLowerCase()}`,
          );
        }
        const frTotalRow = await db
          .select({ count: sql<number>`count(*)` })
          .from(findingRecordsTable)
          .where(and(...frWhere));
        const frTotal = Number(frTotalRow[0]?.count ?? 0);
        if (frTotal > 0) {
          const rows = await db
            .select()
            .from(findingRecordsTable)
            .where(and(...frWhere))
            .orderBy(desc(findingRecordsTable.createdAt))
            .limit(limit + 1)
            .offset(offset);
          const hasMore = rows.length > limit;
          const page = hasMore ? rows.slice(0, limit) : rows;
          const taskIdsSeen = [
            ...new Set(page.map((r: { taskId?: string | null }) => r.taskId).filter(Boolean)),
          ] as string[];
          const tasksMap: Record<string, any> = {};
          if (taskIdsSeen.length > 0) {
            const taskRows = await db
              .select()
              .from(attackTasksTable)
              .where(inArray(attackTasksTable.id, taskIdsSeen));
            for (const t of taskRows) {
              tasksMap[t.id] = t;
            }
          }
          const agentIds = [
            ...new Set(
              Object.values(tasksMap)
                .map((t: any) =>
                  t?.targetConfig && typeof t.targetConfig === 'object'
                    ? (t.targetConfig as any).agentId
                    : null,
                )
                .filter(Boolean),
            ),
          ] as string[];
          const agentsMap: Record<string, { name: string }> = {};
          if (agentIds.length > 0 && tables.targetAgentsTable) {
            const targetAgentsTable = tables.targetAgentsTable;
            const agentRows = await db
              .select({ id: targetAgentsTable.id, name: targetAgentsTable.name })
              .from(targetAgentsTable)
              .where(inArray(targetAgentsTable.id, agentIds));
            for (const a of agentRows) {
              agentsMap[a.id] = { name: a.name };
            }
          }
          const vulnIds = [
            ...new Set(
              page
                .map((r: { vulnerabilityId?: string | null }) => r.vulnerabilityId)
                .filter(Boolean),
            ),
          ] as string[];
          const vulnsMap: Record<string, any> = {};
          if (vulnerabilitiesTable && vulnIds.length > 0) {
            const vulnRows = await db
              .select()
              .from(vulnerabilitiesTable)
              .where(inArray(vulnerabilitiesTable.id, vulnIds));
            for (const v of vulnRows) {
              vulnsMap[v.id] = v;
            }
          }

          const allSourceIds = new Set<string>();
          for (const fr of page) {
            const ids = Array.isArray((fr as any).sourceResultIds)
              ? (fr as any).sourceResultIds
              : [];
            for (const id of ids) {
              if (typeof id === 'string' && id.trim()) {
                allSourceIds.add(id);
              }
            }
          }
          const arById = new Map<string, any>();
          if (allSourceIds.size > 0 && attackResultsTable) {
            const idList = [...allSourceIds];
            const arRows = await db
              .select()
              .from(attackResultsTable)
              .where(inArray(attackResultsTable.id, idList));
            for (const r of arRows) {
              arById.set(String((r as any).id), r);
            }
          }

          let mapped = page.map((fr: Record<string, unknown>) => {
            const task = tasksMap[String(fr.taskId ?? '')];
            const agentId = task?.targetConfig?.agentId;
            const agent = agentId ? agentsMap[agentId] : undefined;
            const vid = fr.vulnerabilityId ? String(fr.vulnerabilityId) : null;
            const vuln = vid ? vulnsMap[vid] : null;
            const ids = Array.isArray(fr.sourceResultIds) ? (fr.sourceResultIds as string[]) : [];
            const attackRows = ids.map((id) => arById.get(id)).filter(Boolean);
            return toFindingFromRecord(fr as any, task, vuln, agent, attackRows);
          });
          if (params.agentId) {
            mapped = mapped.filter((f: { agentId?: string }) => f.agentId === params.agentId);
          }
          return {
            data: mapped,
            total: frTotal,
            limit,
            offset,
            hasMore,
          };
        }
      }

      let whereConditions: any[];

      if (dbType === 'mysql') {
        whereConditions = [inArray(attackResultsTable.taskId, taskIds)];
        if (params.riskLevel) {
          whereConditions.push(sqlVerdictIsVulnerable(attackResultsTable.finalVerdict, 'mysql'));
          whereConditions.push(
            sql`${sqlEffectiveAttackResultRisk(attackResultsTable.finalVerdict, 'mysql')} = ${params.riskLevel.toLowerCase()}`,
          );
        }
      } else {
        whereConditions = [inArray(attackResultsTable.taskId, taskIds)];
        if (params.riskLevel) {
          whereConditions.push(sqlVerdictIsVulnerable(attackResultsTable.finalVerdict, 'postgres'));
          whereConditions.push(
            sql`${sqlEffectiveAttackResultRisk(attackResultsTable.finalVerdict, 'postgres')} = ${params.riskLevel.toLowerCase()}`,
          );
        }
      }

      const results = await db
        .select()
        .from(attackResultsTable)
        .where(and(...whereConditions))
        .orderBy(desc(attackResultsTable.createdAt))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = results.length > limit;
      const page = hasMore ? results.slice(0, limit) : results;

      const taskIdsSeen = [...new Set(page.map((r: { taskId: string }) => r.taskId))];
      const tasksMap: Record<string, any> = {};
      const taskRows = await db
        .select()
        .from(attackTasksTable)
        .where(inArray(attackTasksTable.id, taskIdsSeen));
      for (const t of taskRows) {
        tasksMap[t.id] = t;
      }

      const agentIds = [
        ...new Set(
          taskRows
            .map((t: { targetConfig?: unknown }) =>
              t.targetConfig && typeof t.targetConfig === 'object'
                ? (t.targetConfig as { agentId?: string }).agentId
                : null,
            )
            .filter(Boolean),
        ),
      ] as string[];
      const agentsMap: Record<string, { name: string }> = {};
      const tablesWithAgents = getTables() as ReturnType<typeof getTables> & {
        targetAgentsTable?: any;
      };
      if (agentIds.length > 0 && tablesWithAgents.targetAgentsTable) {
        const targetAgentsTable = tablesWithAgents.targetAgentsTable;
        const agentRows = await db
          .select({ id: targetAgentsTable.id, name: targetAgentsTable.name })
          .from(targetAgentsTable)
          .where(inArray(targetAgentsTable.id, agentIds));
        for (const a of agentRows) {
          agentsMap[a.id] = { name: a.name };
        }
      }

      const vulnIds = [
        ...new Set(
          page.map((r: { vulnerabilityId?: string | null }) => r.vulnerabilityId).filter(Boolean),
        ),
      ] as string[];
      const vulnsMap: Record<string, any> = {};
      if (vulnerabilitiesTable && vulnIds.length > 0) {
        const vulnRows = await db
          .select()
          .from(vulnerabilitiesTable)
          .where(inArray(vulnerabilitiesTable.id, vulnIds));
        for (const v of vulnRows) {
          vulnsMap[v.id] = v;
        }
      }

      const allFindings = page.map((ar: Record<string, unknown>) => {
        const task = tasksMap[String(ar.taskId ?? '')];
        const agentId = task?.targetConfig?.agentId;
        const agent = agentId ? agentsMap[agentId] : undefined;
        const vid = ar.vulnerabilityId ? String(ar.vulnerabilityId) : null;
        return toFinding(ar as any, task, vid ? vulnsMap[vid] : null, agent);
      });

      // 只保留真正“有漏洞”的记录（vulnerable === true）
      const vulnerableFindings = allFindings.filter(
        (f: { finalVerdict?: { vulnerable?: boolean } }) =>
          f.finalVerdict && f.finalVerdict.vulnerable === true,
      );

      const data = vulnerableFindings.slice(0, limit);
      return {
        data,
        total: vulnerableFindings.length,
        limit,
        offset,
        hasMore,
      };
    } catch (err: any) {
      logger.error('Findings list error:', { message: err?.message });
      throw err;
    }
  },

  /** Count vulnerable findings by risk level for dashboard stats. Counts distinct vulnerabilities (same vuln in multiple results = 1). */
  async getCountsByRiskLevel(
    organizationId: string,
  ): Promise<{ critical: number; high: number; medium: number; low: number }> {
    const tables = getTables() as ReturnType<typeof getTables> & { findingRecordsTable?: any };
    const { attackResultsTable, attackTasksTable } = tables;
    const out = { critical: 0, high: 0, medium: 0, low: 0 };
    if (!attackTasksTable) { return out; }
    try {
      const tasks = await db
        .select({ id: attackTasksTable.id })
        .from(attackTasksTable)
        .where(eq(attackTasksTable.organizationId, organizationId));
      const taskIds = tasks.map((t: { id: string }) => t.id);
      if (taskIds.length === 0) { return out; }
      const dbType = getDbType();
      if (dbType === 'mysql' && tables.findingRecordsTable) {
        const { findingRecordsTable } = tables;
        const frTotal = await db
          .select({ count: sql<number>`count(*)` })
          .from(findingRecordsTable)
          .where(inArray(findingRecordsTable.taskId, taskIds));
        if (Number(frTotal[0]?.count ?? 0) > 0) {
          const levels = ['critical', 'high', 'medium', 'low'] as const;
          for (const level of levels) {
            const [row] = await db
              .select({
                count: sql<number>`count(*)`,
              })
              .from(findingRecordsTable)
              .where(
                and(
                  inArray(findingRecordsTable.taskId, taskIds),
                  sql`${sqlFindingRecordRiskBucket(findingRecordsTable.severity)} = ${level}`,
                ),
              );
            out[level] = Number(row?.count ?? 0);
          }
          const sumFr = out.critical + out.high + out.medium + out.low;
          if (sumFr === 0) {
            try {
              const { data } = await this.list(organizationId, { limit: 20000 });
              if (data.length > 0) {
                logger.warn(
                  'getCountsByRiskLevel: finding_records SQL buckets were 0; reconciled from list()',
                  { organizationId, rowCount: data.length },
                );
                return countRiskLevelsFromFindingsData(data);
              }
            } catch (fbErr: unknown) {
              logger.warn('getCountsByRiskLevel finding_records fallback failed', {
                message: fbErr instanceof Error ? fbErr.message : String(fbErr),
              });
            }
          }
          return out;
        }
      }
      if (!attackResultsTable) { return out; }
      const levels = ['critical', 'high', 'medium', 'low'] as const;
      const arDb: 'mysql' | 'postgres' = dbType === 'mysql' ? 'mysql' : 'postgres';
      for (const level of levels) {
        const baseWhere = and(
          inArray(attackResultsTable.taskId, taskIds),
          sqlVerdictIsVulnerable(attackResultsTable.finalVerdict, arDb),
          sql`${sqlEffectiveAttackResultRisk(attackResultsTable.finalVerdict, arDb)} = ${level}`,
        );
        // Count distinct vulnerabilities so the same vuln in multiple results/tasks counts as 1
        const [row] = await db
          .select({
            count: sql<number>`COUNT(DISTINCT COALESCE(${attackResultsTable.vulnerabilityId}, ${attackResultsTable.id}))`,
          })
          .from(attackResultsTable)
          .where(baseWhere);
        out[level] = Number(row?.count ?? 0);
      }
      const sumAr = out.critical + out.high + out.medium + out.low;
      if (sumAr === 0) {
        try {
          const { data } = await this.list(organizationId, { limit: 20000 });
          if (data.length > 0) {
            logger.warn(
              'getCountsByRiskLevel: attack_results SQL buckets were 0; reconciled from list()',
              { organizationId, rowCount: data.length },
            );
            return countRiskLevelsFromFindingsData(data);
          }
        } catch (fbErr: unknown) {
          logger.warn('getCountsByRiskLevel attack_results fallback failed', {
            message: fbErr instanceof Error ? fbErr.message : String(fbErr),
          });
        }
      }
      return out;
    } catch (err: any) {
      logger.error('getCountsByRiskLevel error:', { message: err?.message });
      try {
        const { data } = await this.list(organizationId, { limit: 20000 });
        if (data.length > 0) {
          logger.warn('getCountsByRiskLevel: reconciled from list() after SQL error', {
            organizationId,
            rowCount: data.length,
          });
          return countRiskLevelsFromFindingsData(data);
        }
      } catch {
        /* ignore */
      }
      return out;
    }
  },

  /** Recent high/critical risk findings for dashboard (limit 5). Deduplicated by vulnerability so same vuln appears once. */
  async listRecentHighRisk(organizationId: string, limit = 5): Promise<any[]> {
    const high = await this.list(organizationId, { limit: limit * 2, riskLevel: 'high' });
    const critical = await this.list(organizationId, { limit: limit * 2, riskLevel: 'critical' });
    let combined = [...critical.data, ...high.data];
    if (combined.length === 0) {
      try {
        const page = await this.list(organizationId, { limit: 100 });
        combined = page.data.filter((f: { riskLevel?: unknown }) => {
          const r = String(f.riskLevel ?? '').toLowerCase();
          return r === 'critical' || r === 'high';
        });
      } catch (e: unknown) {
        logger.warn('listRecentHighRisk: fallback list failed', {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const byDate = combined.sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );
    const seen = new Set<string>();
    const deduped = byDate.filter((f) => {
      const key = f.vulnerabilityId || f.id;
      if (seen.has(key)) { return false; }
      seen.add(key);
      return true;
    });
    return deduped.slice(0, limit);
  },

  async getById(findingId: string, organizationId: string): Promise<any | null> {
    const tables = getTables() as ReturnType<typeof getTables> & {
      targetAgentsTable?: any;
      findingRecordsTable?: any;
    };
    const { attackResultsTable, attackTasksTable, vulnerabilitiesTable } = tables;
    if (!attackTasksTable) { return null; }

    try {
      if (getDbType() === 'mysql' && tables.findingRecordsTable) {
        const frRows = await db
          .select()
          .from(tables.findingRecordsTable)
          .where(eq(tables.findingRecordsTable.id, findingId))
          .limit(1);
        const fr = frRows[0];
        if (fr && fr.taskId) {
          const taskRows = await db
            .select()
            .from(attackTasksTable)
            .where(eq(attackTasksTable.id, fr.taskId))
            .limit(1);
          const task = taskRows[0];
          if (!task || task.organizationId !== organizationId) { return null; }
          let agent: { name: string } | null = null;
          const agentId = task?.targetConfig?.agentId;
          if (agentId && tables.targetAgentsTable) {
            const agentRows = await db
              .select({ id: tables.targetAgentsTable.id, name: tables.targetAgentsTable.name })
              .from(tables.targetAgentsTable)
              .where(eq(tables.targetAgentsTable.id, agentId))
              .limit(1);
            if (agentRows[0]) { agent = { name: agentRows[0].name }; }
          }
          let vuln = null;
          if (fr.vulnerabilityId && vulnerabilitiesTable) {
            const vulnRows = await db
              .select()
              .from(vulnerabilitiesTable)
              .where(eq(vulnerabilitiesTable.id, fr.vulnerabilityId))
              .limit(1);
            vuln = vulnRows[0];
          }

          let attackRows: any[] = [];
          if (attackResultsTable) {
            const srcIds = Array.isArray(fr.sourceResultIds)
              ? (fr.sourceResultIds as unknown[]).filter(
                  (x): x is string => typeof x === 'string' && x.trim().length > 0,
                )
              : [];
            if (srcIds.length > 0) {
              attackRows = await db
                .select()
                .from(attackResultsTable)
                .where(inArray(attackResultsTable.id, srcIds));
            } else if (fr.taskId && fr.vulnerabilityId) {
              const conds: any[] = [
                eq(attackResultsTable.taskId, fr.taskId),
                eq(attackResultsTable.vulnerabilityId, fr.vulnerabilityId),
              ];
              if (fr.scanRunId) {
                conds.push(eq(attackResultsTable.scanRunId, fr.scanRunId));
              }
              attackRows = await db
                .select()
                .from(attackResultsTable)
                .where(and(...conds))
                .orderBy(desc(attackResultsTable.createdAt))
                .limit(8);
            }
          }

          return toFindingFromRecord(fr, task, vuln, agent, attackRows);
        }
      }

      if (!attackResultsTable) { return null; }
      const rows = await db
        .select()
        .from(attackResultsTable)
        .where(eq(attackResultsTable.id, findingId))
        .limit(1);
      const ar = rows[0];
      if (!ar) { return null; }

      const taskRows = await db
        .select()
        .from(attackTasksTable)
        .where(eq(attackTasksTable.id, ar.taskId))
        .limit(1);
      const task = taskRows[0];
      if (!task || task.organizationId !== organizationId) { return null; }

      let agent: { name: string } | null = null;
      const agentId = task?.targetConfig?.agentId;
      if (agentId && tables.targetAgentsTable) {
        const agentRows = await db
          .select({ id: tables.targetAgentsTable.id, name: tables.targetAgentsTable.name })
          .from(tables.targetAgentsTable)
          .where(eq(tables.targetAgentsTable.id, agentId))
          .limit(1);
        if (agentRows[0]) { agent = { name: agentRows[0].name }; }
      }

      let vuln = null;
      if (ar.vulnerabilityId && vulnerabilitiesTable) {
        const vulnRows = await db
          .select()
          .from(vulnerabilitiesTable)
          .where(eq(vulnerabilitiesTable.id, ar.vulnerabilityId))
          .limit(1);
        vuln = vulnRows[0];
      }
      return toFinding(ar, task, vuln, agent);
    } catch (err: any) {
      logger.error('Findings getById error:', { message: err?.message });
      return null;
    }
  },

  async delete(findingId: string, organizationId: string): Promise<boolean> {
    const tables = getTables() as ReturnType<typeof getTables> & { findingRecordsTable?: any };
    const { attackResultsTable, attackTasksTable } = tables;
    if (!attackTasksTable) { return false; }

    try {
      if (getDbType() === 'mysql' && tables.findingRecordsTable) {
        const frRows = await db
          .select()
          .from(tables.findingRecordsTable)
          .where(eq(tables.findingRecordsTable.id, findingId))
          .limit(1);
        const fr = frRows[0];
        if (fr?.taskId) {
          const taskRows = await db
            .select({ organizationId: attackTasksTable.organizationId })
            .from(attackTasksTable)
            .where(eq(attackTasksTable.id, fr.taskId))
            .limit(1);
          const task = taskRows[0];
          if (!task || task.organizationId !== organizationId) { return false; }
          await db
            .delete(tables.findingRecordsTable)
            .where(eq(tables.findingRecordsTable.id, findingId));
          return true;
        }
      }

      if (!attackResultsTable) { return false; }
      const rows = await db
        .select({ taskId: attackResultsTable.taskId })
        .from(attackResultsTable)
        .where(eq(attackResultsTable.id, findingId))
        .limit(1);
      const ar = rows[0];
      if (!ar) { return false; }

      const taskRows = await db
        .select({ organizationId: attackTasksTable.organizationId })
        .from(attackTasksTable)
        .where(eq(attackTasksTable.id, ar.taskId))
        .limit(1);
      const task = taskRows[0];
      if (!task || task.organizationId !== organizationId) { return false; }

      await db.delete(attackResultsTable).where(eq(attackResultsTable.id, findingId));
      return true;
    } catch (err: any) {
      logger.error('Findings delete error:', { message: err?.message });
      return false;
    }
  },

  async update(
    findingId: string,
    organizationId: string,
    payload: { status?: string; auditNotes?: string },
  ): Promise<any | null> {
    const tables = getTables() as ReturnType<typeof getTables> & { findingRecordsTable?: any };
    const { attackResultsTable, attackTasksTable } = tables;
    if (!attackTasksTable) { return null; }

    try {
      if (getDbType() === 'mysql' && tables.findingRecordsTable) {
        const frRows = await db
          .select()
          .from(tables.findingRecordsTable)
          .where(eq(tables.findingRecordsTable.id, findingId))
          .limit(1);
        const fr = frRows[0];
        if (fr?.taskId) {
          const taskRows = await db
            .select()
            .from(attackTasksTable)
            .where(eq(attackTasksTable.id, fr.taskId))
            .limit(1);
          const task = taskRows[0];
          if (!task || task.organizationId !== organizationId) { return null; }
          const nextMeta = fr.metadata && typeof fr.metadata === 'object' ? { ...fr.metadata } : {};
          if (payload.auditNotes !== undefined) { (nextMeta as any).auditNotes = payload.auditNotes; }
          await db
            .update(tables.findingRecordsTable)
            .set({
              status: payload.status ?? fr.status,
              metadata: Object.keys(nextMeta).length ? nextMeta : fr.metadata,
              updatedAt: new Date(),
            } as any)
            .where(eq(tables.findingRecordsTable.id, findingId));
          return this.getById(findingId, organizationId);
        }
      }

      if (!attackResultsTable) { return null; }
      const metaColumn = (attackResultsTable as any).metadata;
      if (!metaColumn) { return null; }

      const rows = await db
        .select()
        .from(attackResultsTable)
        .where(eq(attackResultsTable.id, findingId))
        .limit(1);
      const ar = rows[0];
      if (!ar) { return null; }

      const taskRows = await db
        .select()
        .from(attackTasksTable)
        .where(eq(attackTasksTable.id, ar.taskId))
        .limit(1);
      const task = taskRows[0];
      if (!task || task.organizationId !== organizationId) { return null; }

      const existingMeta = ar.metadata && typeof ar.metadata === 'object' ? ar.metadata : {};
      const nextMeta: any = { ...existingMeta };
      if (payload.status !== undefined) { nextMeta.status = payload.status; }
      if (payload.auditNotes !== undefined) { nextMeta.auditNotes = payload.auditNotes; }

      await db
        .update(attackResultsTable)
        .set({ metadata: nextMeta } as any)
        .where(eq(attackResultsTable.id, findingId));

      return this.getById(findingId, organizationId);
    } catch (err: any) {
      logger.error('Findings update error:', { message: err?.message });
      return null;
    }
  },
};
