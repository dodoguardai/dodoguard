/**
 * Report Service
 * Handles report generation and management
 */

import fs from 'fs';
import path from 'path';

import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../database';
import logger from '../logger';
import { buildAgentSecurityAssessmentSummary } from '../reports/markdown/AgentSecurityAssessmentReport';
import { getApiBlackboxReportTitle } from '../reports/markdown/ApiBlackboxSecurityReport';
import {
  getDifyConfigTaskReportTitle,
  renderDifyConfigAuditReportFromTaskData,
} from '../reports/markdown/DifyConfigAuditSecurityReport';
import { resolveTaskReportKind } from '../reports/markdown/resolveTaskReportKind';
import { enrichSingleTestReportResult } from '../reports/markdown/singleTestReportEnrichment';
import { loadReportBrandConfig } from '../reports/reportBrandConfig';
import { applyReportProductBrand, REPORT_PRODUCT_BRAND_ZH } from '../reports/reportBrandText';
import { buildComplianceReportMarkdown } from './complianceReportLifecycleService';
import { getReportFormatStrategy, wrapMarkdownPlainAsHtmlDocument } from './reportFormatFactory';
import {
  listFindingRecordIdsForTask,
  listFindingRecordsForReport,
  resolveTemplateIdForMysqlTaskType,
} from './v4MysqlExecutionService';
import type { Browser, LaunchOptions, Page } from 'playwright';

import type { ComplianceReportPreview } from './complianceReportService';
import type { DifyConfigAuditResult } from './difyConfigAuditService';
import type { ReportData } from './reportTypes';

export type { DifyConfigAuditResult } from './difyConfigAuditService';
export type { ReportData } from './reportTypes';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function looksLikeHtmlDocument(content: string): boolean {
  return /^\s*(?:<!doctype\s+html\b|<html\b|<body\b)/i.test(content);
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore malformed metadata */
    }
  }
  return {};
}

function looksLikeComplianceReportPreview(value: unknown): value is ComplianceReportPreview {
  const record = jsonRecord(value);
  const summary = jsonRecord(record.summary);
  return (
    typeof record.reportNo === 'string' &&
    typeof record.taskName === 'string' &&
    Array.isArray(record.items) &&
    typeof summary.total === 'number' &&
    typeof record.conclusionLabel === 'string'
  );
}

/** Drizzle / drivers may return JSON columns as string; normalize for merge logic. */
function coerceSourceResultIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) {
        return p.map((x) => String(x)).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

type AttackRowForAgentMerge = {
  id?: string | null;
  vulnerabilityId?: string | null;
  scanRunId?: string | null;
  rawResultType?: string | null;
  createdAt?: Date | string | null;
  response?: unknown;
};

type RetestRunStats = {
  label: string;
  at?: string;
  riskByVulnerabilityId: Map<string, 'high' | 'medium' | 'low'>;
};

function normalizeRiskLevel(input: unknown): 'high' | 'medium' | 'low' {
  const s = String(input ?? '').toLowerCase();
  if (s === 'critical' || s === 'high') {
    return 'high';
  }
  if (s === 'medium') {
    return 'medium';
  }
  return 'low';
}

function computeRiskSummaryFromMap(m: Map<string, 'high' | 'medium' | 'low'>): {
  high: number;
  medium: number;
  low: number;
  total: number;
} {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const v of m.values()) {
    if (v === 'high') {
      high += 1;
    } else if (v === 'medium') {
      medium += 1;
    } else {
      low += 1;
    }
  }
  return { high, medium, low, total: m.size };
}

function buildRetestComparisonFromResults(results: Array<Record<string, unknown>>) {
  type Bucket = {
    t: number;
    runId: string;
    rows: Array<Record<string, unknown>>;
  };
  const buckets = new Map<string, Bucket>();
  for (const row of results) {
    const req = (row.request ?? {}) as Record<string, unknown>;
    const runIdRaw = row.scanRunId ?? req.scanRunId;
    const runId = String(runIdRaw ?? '').trim();
    if (!runId) {
      continue;
    }
    const created = new Date(String(row.createdAt ?? '')).getTime();
    const prev = buckets.get(runId);
    if (prev) {
      prev.rows.push(row);
      if (Number.isFinite(created) && created > prev.t) {
        prev.t = created;
      }
    } else {
      buckets.set(runId, {
        runId,
        t: Number.isFinite(created) ? created : 0,
        rows: [row],
      });
    }
  }
  if (buckets.size < 2) {
    return undefined;
  }
  const ordered = Array.from(buckets.values()).sort((a, b) => a.t - b.t);
  const baseline = ordered[0];
  const current = ordered[ordered.length - 1];
  const toStats = (b: Bucket, label: string): RetestRunStats => {
    const riskByVulnerabilityId = new Map<string, 'high' | 'medium' | 'low'>();
    for (const row of b.rows) {
      const vid = String(row.vulnerabilityId ?? '');
      if (!vid) {
        continue;
      }
      const verdict = (row.finalVerdict ?? {}) as Record<string, unknown>;
      const vulnerable =
        verdict.vulnerable === true || String(verdict.vulnerable ?? '').toLowerCase() === 'true';
      if (!vulnerable) {
        continue;
      }
      const level = normalizeRiskLevel(verdict.riskLevel);
      const prev = riskByVulnerabilityId.get(vid);
      if (!prev) {
        riskByVulnerabilityId.set(vid, level);
      } else if (prev !== 'high' && (level === 'high' || (level === 'medium' && prev === 'low'))) {
        riskByVulnerabilityId.set(vid, level);
      }
    }
    return {
      label,
      at: Number.isFinite(b.t) && b.t > 0 ? new Date(b.t).toISOString() : undefined,
      riskByVulnerabilityId,
    };
  };
  const baselineStats = toStats(baseline, '首次测试');
  const currentStats = toStats(current, ordered.length > 2 ? '最新复测' : '复测');
  const baselineSet = new Set(Array.from(baselineStats.riskByVulnerabilityId.keys()));
  const currentSet = new Set(Array.from(currentStats.riskByVulnerabilityId.keys()));
  const fixedRiskIds = Array.from(baselineSet).filter((id) => !currentSet.has(id));
  const unchangedRiskIds = Array.from(baselineSet).filter((id) => currentSet.has(id));
  const newRiskIds = Array.from(currentSet).filter((id) => !baselineSet.has(id));
  return {
    baselineLabel: baselineStats.label,
    currentLabel: currentStats.label,
    baselineAt: baselineStats.at,
    currentAt: currentStats.at,
    baselineRisk: computeRiskSummaryFromMap(baselineStats.riskByVulnerabilityId),
    currentRisk: computeRiskSummaryFromMap(currentStats.riskByVulnerabilityId),
    fixedRiskIds,
    unchangedRiskIds,
    newRiskIds,
  };
}

function extractPreviewFullFromAttackResponse(resp: unknown): {
  preview: string;
  full: string;
} {
  if (!resp || typeof resp !== 'object') {
    return { preview: '', full: '' };
  }
  const r = resp as Record<string, unknown>;
  const rawPrev = r.preview;
  const p =
    typeof rawPrev === 'string'
      ? rawPrev.trim()
      : rawPrev != null && typeof rawPrev === 'object'
        ? JSON.stringify(rawPrev)
        : '';
  const rawFull = r.full;
  const f =
    typeof rawFull === 'string'
      ? rawFull.trim()
      : rawFull != null && typeof rawFull === 'object'
        ? JSON.stringify(rawFull)
        : '';
  return { preview: p, full: f };
}

function attackRowCreatedAtMs(createdAt: Date | string | null | undefined): number {
  if (createdAt instanceof Date) {
    return createdAt.getTime();
  }
  if (typeof createdAt === 'string') {
    const t = Date.parse(createdAt);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function preferredScanRunIdFromMappedRow(r: { request: Record<string, unknown> }): string | null {
  const s = (r.request as { scanRunId?: unknown }).scanRunId;
  if (s == null || s === '') {
    return null;
  }
  return String(s);
}

/**
 * When `sourceResultIds` is missing or stale, recover Coze/Dify API body from `attack_results`
 * for the same vulnerability (prefer same scan_run, then any row for the task).
 */
function pickFallbackPreviewFullForVulnerability(
  attackRows: AttackRowForAgentMerge[],
  vulnerabilityId: string,
  scanRunId: string | null,
): { preview: string; full: string } {
  const vid = String(vulnerabilityId ?? '');
  if (!vid) {
    return { preview: '', full: '' };
  }

  const collect = (
    restrictScan: boolean,
  ): Array<{ preview: string; full: string; apiRound: number; t: number }> => {
    const scored: Array<{
      preview: string;
      full: string;
      apiRound: number;
      t: number;
    }> = [];
    for (const ar of attackRows) {
      if (String(ar.vulnerabilityId ?? '') !== vid) {
        continue;
      }
      if (restrictScan && scanRunId && ar.scanRunId != null && String(ar.scanRunId) !== scanRunId) {
        continue;
      }
      const { preview, full } = extractPreviewFullFromAttackResponse(ar.response);
      if (!preview && !full) {
        continue;
      }
      scored.push({
        preview,
        full,
        apiRound: String(ar.rawResultType ?? '') === 'api_round' ? 1 : 0,
        t: attackRowCreatedAtMs(ar.createdAt ?? undefined),
      });
    }
    return scored;
  };

  let scored = collect(true);
  if (scored.length === 0 && scanRunId) {
    scored = collect(false);
  }
  if (scored.length === 0) {
    return { preview: '', full: '' };
  }
  scored.sort((a, b) => {
    if (b.apiRound !== a.apiRound) {
      return b.apiRound - a.apiRound;
    }
    return b.t - a.t;
  });
  return { preview: scored[0].preview, full: scored[0].full };
}

/** Map `finding_records` rows into the same shape as `attack_results` for templates. */
function severityToReportRiskLevel(severity: string | null | undefined): string {
  const s = (severity ?? 'medium').toLowerCase();
  if (['critical', 'high', 'medium', 'low'].includes(s)) {
    return s;
  }
  if (s === 'info') {
    return 'low';
  }
  return 'medium';
}

function mapFindingRecordsToReportResults(
  rows: Record<string, unknown>[],
  task: { attackMode?: string },
): Array<{
  vulnerabilityId: string;
  commandId: string;
  attackMode: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  detectionResults: Record<string, unknown>;
  finalVerdict: Record<string, unknown>;
  createdAt: string;
}> {
  const attackMode = task.attackMode ?? 'simple';
  return rows.map((fr) => {
    const id = String(fr.id ?? '');
    const vulnId = String(fr.vulnerabilityId ?? '');
    const severity = severityToReportRiskLevel(
      typeof fr.severity === 'string' ? fr.severity : undefined,
    );
    const summary =
      (typeof fr.summary === 'string' && fr.summary) ||
      (typeof fr.description === 'string' && fr.description) ||
      (typeof fr.title === 'string' && fr.title) ||
      '';
    const title = typeof fr.title === 'string' ? fr.title : '';
    let conf: number | undefined;
    if (fr.confidence != null && fr.confidence !== '') {
      const n = Number(fr.confidence);
      if (Number.isFinite(n)) {
        conf = n;
      }
    }
    const created =
      fr.createdAt instanceof Date
        ? fr.createdAt.toISOString()
        : String(fr.createdAt ?? new Date().toISOString());
    return {
      vulnerabilityId: vulnId,
      commandId: `finding_record:${id.slice(0, 8)}`,
      attackMode,
      request: {
        _source: 'finding_records',
        findingRecordId: id,
        title,
        sourceResultIds: coerceSourceResultIds(fr.sourceResultIds),
        scanRunId: fr.scanRunId != null ? String(fr.scanRunId) : null,
      },
      response: {
        severity: fr.severity,
        status: fr.status,
        summary: summary.slice(0, 4000),
      },
      detectionResults: {},
      finalVerdict: {
        vulnerable: true,
        riskLevel: severity,
        reason: summary || title,
        ...(conf !== undefined ? { confidence: conf } : {}),
      },
      createdAt: created,
    };
  });
}

/**
 * Merge `detection_results` from linked `attack_results` into finding_record–shaped report rows
 * (MySQL v4 reports prefer finding_records but previously left detectionResults empty).
 */
function sourceResultIdsFromMappedRow(r: { request: Record<string, unknown> }): string[] {
  const req = r.request;
  if (
    !req ||
    typeof req !== 'object' ||
    !Array.isArray((req as { sourceResultIds?: unknown[] }).sourceResultIds)
  ) {
    return [];
  }
  return ((req as { sourceResultIds: unknown[] }).sourceResultIds as unknown[])
    .map((x) => String(x))
    .filter(Boolean);
}

type AttackRowForRequestMerge = {
  id?: string | null;
  request?: unknown;
  commandId?: string | null;
  finalVerdict?: unknown;
};

/**
 * finding_records → report rows lack `request.url` / `prompt` and use placeholder commandId / finalVerdict.
 * Copy from the first linked `attack_results` row (sourceResultIds) so UI/report split static vs API correctly.
 */
function mergeRequestAndVerdictFromSourceAttackResults(
  mapped: ReturnType<typeof mapFindingRecordsToReportResults>,
  attackRows: AttackRowForRequestMerge[],
): ReturnType<typeof mapFindingRecordsToReportResults> {
  const byId = new Map<string, AttackRowForRequestMerge>();
  for (const row of attackRows) {
    const id = String(row?.id ?? '');
    if (id) {
      byId.set(id, row);
    }
  }
  return mapped.map((r) => {
    const ids = sourceResultIdsFromMappedRow(r);
    if (ids.length === 0) {
      return r;
    }
    let chosen: AttackRowForRequestMerge | undefined;
    for (const sid of ids) {
      const ar = byId.get(sid);
      if (ar) {
        chosen = ar;
        break;
      }
    }
    if (!chosen) {
      return r;
    }

    const prevReq =
      r.request && typeof r.request === 'object'
        ? ({ ...(r.request as Record<string, unknown>) } as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    const arReq =
      chosen.request && typeof chosen.request === 'object'
        ? (chosen.request as Record<string, unknown>)
        : {};

    let changed = false;
    if (typeof arReq.url === 'string') {
      prevReq.url = arReq.url;
      changed = true;
    }
    if ('prompt' in arReq) {
      prevReq.prompt = arReq.prompt;
      changed = true;
    }

    const arCmd =
      chosen.commandId != null && String(chosen.commandId).trim() !== ''
        ? String(chosen.commandId).trim()
        : '';
    const nextCommandId = arCmd || r.commandId;
    if (arCmd && arCmd !== r.commandId) {
      changed = true;
    }

    let nextFinalVerdict = r.finalVerdict;
    if (chosen.finalVerdict != null && typeof chosen.finalVerdict === 'object') {
      nextFinalVerdict = {
        ...(chosen.finalVerdict as Record<string, unknown>),
      } as typeof r.finalVerdict;
      changed = true;
    }

    if (!changed) {
      return r;
    }

    return {
      ...r,
      request: prevReq,
      commandId: nextCommandId,
      finalVerdict: nextFinalVerdict,
    };
  });
}

function mergeDetectionFromSourceAttackResults(
  mapped: ReturnType<typeof mapFindingRecordsToReportResults>,
  attackRows: Array<{ id?: string | null; detectionResults?: unknown }>,
): ReturnType<typeof mapFindingRecordsToReportResults> {
  const byId = new Map<string, { detectionResults?: unknown }>();
  for (const row of attackRows) {
    const id = String(row?.id ?? '');
    if (id) {
      byId.set(id, row);
    }
  }
  return mapped.map((r) => {
    const ids = sourceResultIdsFromMappedRow(r);
    if (ids.length === 0) {
      return r;
    }
    const merged = mergeDetectionJsonFromAttackRows(ids.map((id) => byId.get(id)).filter(Boolean));
    if (Object.keys(merged).length === 0) {
      return r;
    }
    return { ...r, detectionResults: merged };
  });
}

/**
 * finding_records 映射行的 `response` 只有 severity/status/summary；报告「智能体/Bot 输出」需要真实 API 正文。
 * 从 `sourceResultIds` 指向的 `attack_results.response.preview`（及 full）合并回来。
 */
function mergeAgentResponseFromSourceAttackResults(
  mapped: ReturnType<typeof mapFindingRecordsToReportResults>,
  attackRows: AttackRowForAgentMerge[],
): ReturnType<typeof mapFindingRecordsToReportResults> {
  const byId = new Map<string, AttackRowForAgentMerge>();
  for (const row of attackRows) {
    const id = String(row?.id ?? '');
    if (id) {
      byId.set(id, row);
    }
  }
  return mapped.map((r) => {
    const ids = sourceResultIdsFromMappedRow(r);
    let preview = '';
    let full = '';
    for (const sid of ids) {
      const ar = byId.get(sid);
      const { preview: p, full: f } = extractPreviewFullFromAttackResponse(ar?.response);
      if (p) {
        preview = p;
        if (f) {
          full = f;
        }
        break;
      }
      if (f && !full) {
        full = f;
      }
    }

    const vulnId = String(r.vulnerabilityId ?? '');
    const scanRunId = preferredScanRunIdFromMappedRow(r);
    if ((!preview || !full) && vulnId) {
      const fb = pickFallbackPreviewFullForVulnerability(attackRows, vulnId, scanRunId);
      if (!preview && fb.preview) {
        preview = fb.preview;
      }
      if (!full && fb.full) {
        full = fb.full;
      }
    }

    if (!preview && !full) {
      return r;
    }
    const prevResp = r.response && typeof r.response === 'object' ? r.response : {};
    return {
      ...r,
      response: {
        ...(prevResp as Record<string, unknown>),
        ...(preview ? { preview } : {}),
        ...(full ? { full } : {}),
      },
    };
  });
}

function mergeDetectionJsonFromAttackRows(
  rows: Array<{ detectionResults?: unknown } | undefined>,
): Record<string, unknown> {
  const ruleHits: unknown[] = [];
  const pathSet = new Set<string>();
  const snipSet = new Set<string>();
  for (const row of rows) {
    if (!row) {
      continue;
    }
    const det =
      row.detectionResults && typeof row.detectionResults === 'object'
        ? (row.detectionResults as Record<string, unknown>)
        : null;
    if (!det) {
      continue;
    }
    if (Array.isArray(det.ruleHits)) {
      ruleHits.push(...det.ruleHits);
    }
    const llm = det.llmEvidence;
    if (llm && typeof llm === 'object') {
      const ep = (llm as Record<string, unknown>).evidencePaths;
      if (Array.isArray(ep)) {
        for (const p of ep) {
          const s = String(p).trim();
          if (s) {
            pathSet.add(s);
          }
        }
      }
      const es = (llm as Record<string, unknown>).evidenceSnippets;
      if (Array.isArray(es)) {
        for (const x of es) {
          const s = String(x).trim();
          if (s) {
            snipSet.add(s);
          }
        }
      }
    }
  }
  const out: Record<string, unknown> = {};
  if (ruleHits.length > 0) {
    out.ruleHits = ruleHits;
  }
  if (pathSet.size > 0 || snipSet.size > 0) {
    out.llmEvidence = {
      ...(pathSet.size > 0 ? { evidencePaths: [...pathSet] } : {}),
      ...(snipSet.size > 0 ? { evidenceSnippets: [...snipSet] } : {}),
    };
  }
  return out;
}

// Resolve tables based on current DB type (MySQL or Postgres)
function getTables() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    // Use MySQL schema
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mysqlTables = require('../database/tables-mysql');
    return {
      reportsTable: mysqlTables.reportsTable,
      reportTemplatesTable: mysqlTables.reportTemplatesTable,
      reportRunsTable: mysqlTables.reportRunsTable,
      attackTasksTable: mysqlTables.attackTasksTable,
      attackResultsTable: mysqlTables.attackResultsTable,
      vulnerabilitiesTable: mysqlTables.vulnerabilitiesTable,
      organizationsTable: mysqlTables.organizationsTable,
      targetAgentsTable: mysqlTables.targetAgentsTable,
      attackCommandsTable: mysqlTables.attackCommandsTable,
    };
  }
  // Default to Postgres/enterprise schema
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pgTables = require('../database/tables-enterprise');
  return {
    reportsTable: pgTables.reportsTable,
    reportTemplatesTable: pgTables.reportTemplatesTable,
    reportRunsTable: undefined as undefined,
    attackTasksTable: pgTables.attackTasksTable,
    attackResultsTable: pgTables.attackResultsTable,
    vulnerabilitiesTable: pgTables.vulnerabilitiesTable,
    organizationsTable: pgTables.organizationsTable,
    targetAgentsTable: pgTables.targetAgentsTable,
    attackCommandsTable: undefined as undefined,
  };
}

function parseTaskVulnerabilityIds(raw: unknown): string[] {
  if (raw == null) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).filter(Boolean);
  }

  // MySQL json('vulnerabilities') may be returned as JSON string/object depending on driver.
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parseTaskVulnerabilityIds(parsed);
    } catch {
      return [];
    }
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;

    if (Array.isArray(obj.ids)) {
      return obj.ids.map((x) => String(x)).filter(Boolean);
    }
    if (Array.isArray(obj.vulnerabilities)) {
      return obj.vulnerabilities.map((x) => String(x)).filter(Boolean);
    }
    if (Array.isArray(obj.values)) {
      return obj.values.map((x) => String(x)).filter(Boolean);
    }

    // If keys are numeric indices, values() usually gives the intended list.
    const values = Object.values(obj);
    if (values.length > 0) {
      const filtered = values.filter((x) => x != null && x !== '');
      if (filtered.length > 0) {
        return filtered.map((x) => String(x)).filter(Boolean);
      }
    }
  }

  return [];
}

function coerceEpochMs(v: Date | string | undefined | null): number | null {
  if (v == null) {
    return null;
  }
  const d = v instanceof Date ? v : new Date(v);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

/** Sum `durationMs` from task `metadata.runLogs` when DB rows lack `response.durationMs`. */
function sumDurationMsFromTaskRunLogs(taskMetadata: unknown): number {
  if (!taskMetadata || typeof taskMetadata !== 'object') {
    return 0;
  }
  const logs = (taskMetadata as { runLogs?: unknown }).runLogs;
  if (!Array.isArray(logs)) {
    return 0;
  }
  let sum = 0;
  for (const log of logs) {
    if (log && typeof log === 'object') {
      const n = (log as Record<string, unknown>).durationMs;
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
        sum += n;
      }
    }
  }
  return Math.round(sum);
}

/** Earliest→latest `timestamp` span in `metadata.runLogs` (ISO strings), when durationMs 未汇总。 */
function elapsedMsFromRunLogTimestamps(taskMetadata: unknown): number {
  if (!taskMetadata || typeof taskMetadata !== 'object') {
    return 0;
  }
  const logs = (taskMetadata as { runLogs?: unknown }).runLogs;
  if (!Array.isArray(logs) || logs.length < 2) {
    return 0;
  }
  const times: number[] = [];
  for (const log of logs) {
    if (log && typeof log === 'object') {
      const ts = (log as Record<string, unknown>).timestamp;
      if (typeof ts === 'string' && ts.trim()) {
        const t = new Date(ts).getTime();
        if (!Number.isNaN(t)) {
          times.push(t);
        }
      }
    }
  }
  if (times.length < 2) {
    return 0;
  }
  const min = Math.min(...times);
  const max = Math.max(...times);
  return Math.max(0, max - min);
}

/** Single row `response.durationMs` (top-level or nested `full`). */
function responseDurationMsFromRow(response: unknown): number {
  if (!response || typeof response !== 'object') {
    return 0;
  }
  const res = response as Record<string, unknown>;
  const top = res.durationMs;
  if (typeof top === 'number' && Number.isFinite(top) && top >= 0) {
    return top;
  }
  const full = res.full;
  if (full && typeof full === 'object') {
    const n = (full as Record<string, unknown>).durationMs;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      return n;
    }
  }
  return 0;
}

/** Sum `durationMs` from persisted `attack_results.response` (agent calls), when present. */
function sumAttackResultResponseDurationMs(results: any[]): number {
  let sum = 0;
  for (const r of results) {
    sum += responseDurationMsFromRow(r?.response);
  }
  return Math.round(sum);
}

/**
 * Finding-record API rows lack `response.durationMs`; sum from linked `attack_results` by `sourceResultIds`.
 */
function mergeResponseDurationFromSourceAttackResults(
  mapped: ReturnType<typeof mapFindingRecordsToReportResults>,
  attackRows: Array<{ id?: string | null; response?: unknown }>,
): ReturnType<typeof mapFindingRecordsToReportResults> {
  const byId = new Map<string, { response?: unknown }>();
  for (const row of attackRows) {
    const id = String(row?.id ?? '');
    if (id) {
      byId.set(id, row);
    }
  }
  return mapped.map((r) => {
    const req = r.request;
    const ids =
      req &&
      typeof req === 'object' &&
      Array.isArray((req as { sourceResultIds?: unknown[] }).sourceResultIds)
        ? ((req as { sourceResultIds: unknown[] }).sourceResultIds as unknown[])
            .map((x) => String(x))
            .filter(Boolean)
        : [];
    if (ids.length === 0) {
      return r;
    }
    let sumMs = 0;
    for (const sid of ids) {
      const row = byId.get(sid);
      sumMs += responseDurationMsFromRow(row?.response);
    }
    if (sumMs <= 0) {
      return r;
    }
    return {
      ...r,
      response: {
        ...r.response,
        durationMs: Math.round(sumMs),
      },
    };
  });
}

/**
 * When report `results` come from `finding_records` mapping, rows lack real `response.durationMs`.
 * Still sum durations from persisted `attack_results` for the same task (MySQL / Postgres).
 */
async function sumDurationMsFromAttackResultsDb(taskId: string): Promise<number> {
  try {
    const { attackResultsTable } = getTables();
    if (!attackResultsTable) {
      return 0;
    }
    const rows = await db
      .select({ response: attackResultsTable.response })
      .from(attackResultsTable)
      .where(eq(attackResultsTable.taskId, taskId));
    return sumAttackResultResponseDurationMs(rows);
  } catch (e: unknown) {
    logger.warn('sumDurationMsFromAttackResultsDb failed', {
      message: e instanceof Error ? e.message : String(e),
      taskId,
    });
    return 0;
  }
}

/**
 * Load attack results for a task for the task-results API and UI (per-command pass rate, tables).
 * Always prefers persisted `attack_results` (full run: passes + fails). On MySQL, when that
 * table is empty but `finding_records` exist, falls back to mapping findings only — same as
 * legacy flows without persisted rounds.
 * Report generation (`getTaskData`) may still prefer `finding_records` for narrative text.
 */
export async function getTaskAttackResultsForApi(
  taskId: string,
  organizationId: string,
): Promise<{ taskId: string; results: any[] } | null> {
  const { attackTasksTable, attackResultsTable } = getTables();
  const [task] = await db
    .select()
    .from(attackTasksTable)
    .where(
      and(eq(attackTasksTable.id, taskId), eq(attackTasksTable.organizationId, organizationId)),
    )
    .limit(1);

  if (!task) {
    return null;
  }

  let results: any[] = [];
  try {
    results = await db
      .select()
      .from(attackResultsTable)
      .where(eq(attackResultsTable.taskId, taskId))
      .orderBy(attackResultsTable.createdAt);
  } catch (error: any) {
    const code = error?.cause?.code || error?.code;
    if (code === 'ER_NO_SUCH_TABLE') {
      logger.warn(
        'attack_results table not found, continuing with empty results for task results API',
      );
      results = [];
    } else {
      throw error;
    }
  }

  if (results.length === 0 && getDbType() === 'mysql') {
    const frRows = await listFindingRecordsForReport(taskId, organizationId);
    if (frRows.length > 0) {
      results = mapFindingRecordsToReportResults(frRows, task);
      try {
        const arRows = await db
          .select({
            id: attackResultsTable.id,
            request: attackResultsTable.request,
            commandId: attackResultsTable.commandId,
            finalVerdict: attackResultsTable.finalVerdict,
            response: attackResultsTable.response,
            vulnerabilityId: attackResultsTable.vulnerabilityId,
            scanRunId: attackResultsTable.scanRunId,
            rawResultType: attackResultsTable.rawResultType,
            createdAt: attackResultsTable.createdAt,
          })
          .from(attackResultsTable)
          .where(eq(attackResultsTable.taskId, taskId));
        results = mergeRequestAndVerdictFromSourceAttackResults(results, arRows);
        results = mergeResponseDurationFromSourceAttackResults(results, arRows);
        results = mergeAgentResponseFromSourceAttackResults(results, arRows);
      } catch (error: unknown) {
        const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code;
        const errCode = code || (error as { code?: string }).code;
        if (errCode !== 'ER_NO_SUCH_TABLE') {
          logger.warn('mergeResponseDurationFromSourceAttackResults failed', {
            message: error instanceof Error ? error.message : String(error),
            taskId,
          });
        }
      }
    }
  }

  return { taskId, results };
}

async function loadVulnerabilitiesForReportTask(task: {
  vulnerabilities?: unknown;
}): Promise<ReportData['vulnerabilities']> {
  const ids = parseTaskVulnerabilityIds(task.vulnerabilities);
  if (ids.length === 0) {
    return [];
  }
  try {
    const tables = getTables() as ReturnType<typeof getTables> & {
      attackCommandsTable?: typeof import('../database/tables-mysql').attackCommandsTable;
    };
    const { vulnerabilitiesTable, attackCommandsTable } = tables;
    const rows = await db
      .select({
        id: vulnerabilitiesTable.id,
        name: vulnerabilitiesTable.name,
        type: (vulnerabilitiesTable as any).type,
        category: (vulnerabilitiesTable as any).category,
        riskLevel: vulnerabilitiesTable.riskLevel,
        description: vulnerabilitiesTable.description,
        affectedTargets: vulnerabilitiesTable.affectedTargets,
        exploitability: vulnerabilitiesTable.exploitability,
        patchStatus: vulnerabilitiesTable.patchStatus,
        owaspId: vulnerabilitiesTable.owaspId,
        tags: (vulnerabilitiesTable as any).tags,
        verificationMode: (vulnerabilitiesTable as any).verificationMode,
      })
      .from(vulnerabilitiesTable)
      .where(inArray(vulnerabilitiesTable.id, ids));

    let cmdCountByVuln: Map<string, number> | null = null;
    if (attackCommandsTable && ids.length > 0) {
      cmdCountByVuln = new Map(ids.map((id) => [id, 0]));
      const countRows = await db
        .select({
          vulnerabilityId: attackCommandsTable.vulnerabilityId,
          n: count(attackCommandsTable.id),
        })
        .from(attackCommandsTable)
        .where(inArray(attackCommandsTable.vulnerabilityId, ids))
        .groupBy(attackCommandsTable.vulnerabilityId);
      for (const row of countRows) {
        const vid = String(row.vulnerabilityId ?? '');
        if (vid) {
          cmdCountByVuln.set(vid, Number(row.n) || 0);
        }
      }
    }

    let detectionRulesCountByVuln: Map<string, number> | null = null;
    if (getDbType() === 'mysql' && ids.length > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { detectionRulesTable } = require('../database/tables-mysql');
        detectionRulesCountByVuln = new Map(ids.map((id) => [id, 0]));
        const ruleCountRows = await db
          .select({
            vulnerabilityId: detectionRulesTable.vulnerabilityId,
            n: count(detectionRulesTable.id),
          })
          .from(detectionRulesTable)
          .where(inArray(detectionRulesTable.vulnerabilityId, ids))
          .groupBy(detectionRulesTable.vulnerabilityId);
        for (const row of ruleCountRows) {
          const vid = String(row.vulnerabilityId ?? '');
          if (vid) {
            detectionRulesCountByVuln.set(vid, Number(row.n) || 0);
          }
        }
      } catch (e: unknown) {
        logger.warn('loadVulnerabilitiesForReportTask: detection_rules count skipped', {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return rows.map((v: (typeof rows)[number]) => ({
      id: v.id,
      name: v.name,
      type: v.type != null ? String(v.type) : undefined,
      category: v.category != null ? String(v.category) : null,
      riskLevel: String(v.riskLevel ?? 'medium'),
      description: String(v.description ?? ''),
      affectedTargets: Array.isArray(v.affectedTargets) ? v.affectedTargets : [],
      exploitability: v.exploitability,
      patchStatus: v.patchStatus,
      owaspId:
        v.owaspId != null && String(v.owaspId).trim() !== '' ? String(v.owaspId).trim() : undefined,
      verificationDataCount:
        cmdCountByVuln != null ? (cmdCountByVuln.get(String(v.id)) ?? 0) : undefined,
      detectionRulesCount:
        detectionRulesCountByVuln != null
          ? (detectionRulesCountByVuln.get(String(v.id)) ?? 0)
          : undefined,
      tags:
        v.tags == null
          ? []
          : Array.isArray(v.tags)
            ? (v.tags as unknown[]).map((t) => String(t))
            : typeof v.tags === 'string'
              ? (() => {
                  try {
                    const parsed = JSON.parse(v.tags);
                    return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
                  } catch {
                    return [];
                  }
                })()
              : [],
      verificationMode: v.verificationMode != null ? String(v.verificationMode) : null,
    }));
  } catch (e: unknown) {
    logger.warn('loadVulnerabilitiesForReportTask failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

export class ReportService {
  private reportsDir = path.join(process.cwd(), 'reports');

  constructor() {
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /** 容器 / Podman 等非完整桌面环境需关闭 Chromium sandbox。 */
  private shouldUseChromiumNoSandboxForPdf(): boolean {
    if (
      process.env.PLAYWRIGHT_PDF_FORCE_NO_SANDBOX === '1' ||
      process.env.PLAYWRIGHT_PDF_FORCE_NO_SANDBOX === 'true'
    ) {
      return true;
    }
    try {
      if (fs.existsSync('/.dockerenv')) {
        return true;
      }
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      return /(docker|kubepods|containerd|libpod)/i.test(cgroup);
    } catch {
      return false;
    }
  }

  /**
   * Playwright 自带的 Chromium 在 Alpine(musl) 上不可用；优先环境变量，其次常见 Linux 系统路径。
   */
  private resolveChromiumExecutablePathForPdf(): string | undefined {
    const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
    if (fromEnv && fs.existsSync(fromEnv)) {
      return fromEnv;
    }
    if (fromEnv) {
      logger.warn('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set but file is missing', {
        path: fromEnv,
      });
    }
    if (process.platform !== 'linux') {
      return undefined;
    }
    const candidates = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/lib/chromium/chromium',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return undefined;
  }

  private chromiumLaunchOptionsForPdf(): LaunchOptions {
    const opts: LaunchOptions = { headless: true, timeout: 30_000 };
    const execPath = this.resolveChromiumExecutablePathForPdf();
    if (execPath) {
      opts.executablePath = execPath;
      if (this.shouldUseChromiumNoSandboxForPdf()) {
        opts.args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
      }
    }
    return opts;
  }

  /**
   * `networkidle` 要求 500ms 内无进行中网络请求，报告 HTML 常见外链字体/图片/分析脚本会长期占用连接，
   * 导致 30s 超时。PDF 场景用 `load`（DOM + 子资源 load 事件）更稳定；超大页可通过环境变量拉长超时。
   */
  private pdfSetContentTimeoutMs(): number {
    const raw = process.env.PLAYWRIGHT_PDF_SET_CONTENT_TIMEOUT_MS?.trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 5_000 && n <= 600_000) {
        return Math.floor(n);
      }
    }
    return 120_000;
  }

  private pdfGenerationTimeoutMs(): number {
    const raw = process.env.PLAYWRIGHT_PDF_TOTAL_TIMEOUT_MS?.trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 10_000 && n <= 900_000) {
        return Math.floor(n);
      }
    }
    return 180_000;
  }

  private async withPdfTimeout<T>(
    operation: Promise<T>,
    stage: string,
    onTimeout?: () => void,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutMs = this.pdfGenerationTimeoutMs();
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new Error(`PDF generation timed out at ${stage} after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async closePdfBrowserWithin(browser: Browser, timeoutMs = 5_000): Promise<void> {
    await Promise.race([
      browser.close().catch((error) => {
        logger.warn('Failed to close PDF Chromium browser', {
          message: error instanceof Error ? error.message : String(error),
        });
      }),
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        timer.unref?.();
      }),
    ]);
  }

  /** 单页：setContent + pdf（调用方负责提供已打开的 `page`）。 */
  private async renderHtmlToPdfOnPage(page: Page, htmlContent: string): Promise<Buffer> {
    const repeatingChrome = this.extractPdfRepeatingChrome(htmlContent);
    const splitHtml = repeatingChrome ? this.splitHtmlReportCoverAndBody(htmlContent) : null;
    // PDF-only visual override: keep HTML preview style unchanged while removing
    // page-like outer frames (border/shadow/margins) in exported PDF.
    const pdfStyleOverride = `<style id="pdf-full-bleed-override">
@page { ${repeatingChrome ? 'size: A4;' : 'margin: 0;'} }
html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
.page-shell, .doc-shell { margin: 0 !important; padding: 0 !important; }
.cover-card, .doc, .paper {
  border: 0 !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  margin: 0 !important;
}
${repeatingChrome ? '.doc > .doc-header, .doc > .doc-footer { display: none !important; }' : ''}
</style>`;
    const htmlForPdf = htmlContent.includes('</head>')
      ? htmlContent.replace('</head>', `${pdfStyleOverride}</head>`)
      : `${pdfStyleOverride}${htmlContent}`;

    const contentTimeout = this.pdfSetContentTimeoutMs();
    if (repeatingChrome && splitHtml) {
      const coverPdfStyleOverride = `<style id="pdf-cover-full-bleed-override">
@page { margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
.page-shell, .doc-shell { margin: 0 !important; padding: 0 !important; }
.cover-card, .paper {
  border: 0 !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  margin: 0 !important;
}
</style>`;
      const coverHtml = splitHtml.coverHtml.includes('</head>')
        ? splitHtml.coverHtml.replace('</head>', `${coverPdfStyleOverride}</head>`)
        : `${coverPdfStyleOverride}${splitHtml.coverHtml}`;
      await page.setContent(coverHtml, {
        waitUntil: 'domcontentloaded',
        timeout: contentTimeout,
      });
      const coverPdf = await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },
      });

      const bodyHtml = splitHtml.bodyHtml.includes('</head>')
        ? splitHtml.bodyHtml.replace('</head>', `${pdfStyleOverride}</head>`)
        : `${pdfStyleOverride}${splitHtml.bodyHtml}`;
      await page.setContent(bodyHtml, {
        waitUntil: 'domcontentloaded',
        timeout: contentTimeout,
      });
      const bodyPdf = await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: repeatingChrome.headerTemplate,
        footerTemplate: repeatingChrome.footerTemplate,
        margin: {
          top: '104px',
          right: '0',
          bottom: '68px',
          left: '0',
        },
      });
      return await this.mergePdfBuffers([Buffer.from(coverPdf), Buffer.from(bodyPdf)]);
    }

    await page.setContent(htmlForPdf, {
      waitUntil: 'domcontentloaded',
      timeout: contentTimeout,
    });
    const pdf = await page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: Boolean(repeatingChrome),
      headerTemplate: repeatingChrome?.headerTemplate,
      footerTemplate: repeatingChrome?.footerTemplate,
      margin: repeatingChrome
        ? {
            top: '104px',
            right: '0',
            bottom: '68px',
            left: '0',
          }
        : {
            top: '0',
            right: '0',
            bottom: '0',
            left: '0',
          },
    });
    return Buffer.from(pdf);
  }

  private splitHtmlReportCoverAndBody(
    htmlContent: string,
  ): { coverHtml: string; bodyHtml: string } | null {
    const coverElement = this.extractHtmlElementByClass(htmlContent, ['section'], 'cover-card');
    const docElement = this.extractHtmlElementByClass(htmlContent, ['main', 'div'], 'doc');
    if (!coverElement || !docElement) {
      return null;
    }
    return {
      coverHtml: `${htmlContent.slice(0, docElement.start)}${htmlContent.slice(docElement.end)}`,
      bodyHtml: `${htmlContent.slice(0, coverElement.start)}${htmlContent.slice(coverElement.end)}`,
    };
  }

  private extractHtmlElementByClass(
    htmlContent: string,
    tagNames: string[],
    className: string,
  ): { start: number; end: number; html: string } | null {
    const source = String(htmlContent || '');
    for (const tagName of tagNames) {
      const openTagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
      let openMatch: RegExpExecArray | null;
      while ((openMatch = openTagPattern.exec(source))) {
        const openTag = openMatch[0];
        const classMatch = openTag.match(/\bclass\s*=\s*["']([^"']*)["']/i);
        const classes = classMatch?.[1]?.split(/\s+/).filter(Boolean) ?? [];
        if (!classes.includes(className)) {
          continue;
        }

        const elementStart = openMatch.index;
        const scanPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
        scanPattern.lastIndex = elementStart + openTag.length;
        let depth = 1;
        let scanMatch: RegExpExecArray | null;
        while ((scanMatch = scanPattern.exec(source))) {
          if (scanMatch[0].startsWith(`</`)) {
            depth -= 1;
            if (depth === 0) {
              const elementEnd = scanPattern.lastIndex;
              return {
                start: elementStart,
                end: elementEnd,
                html: source.slice(elementStart, elementEnd),
              };
            }
          } else if (!/\/\s*>$/.test(scanMatch[0])) {
            depth += 1;
          }
        }
      }
    }
    return null;
  }

  private async mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
    if (buffers.length <= 1) {
      if (!buffers[0]) {
        throw new Error('PDF merge received no input');
      }
      return buffers[0];
    }

    const { PDFDocument } = await import('pdf-lib');
    const writer = await PDFDocument.create();
    let expectedPages = 0;
    for (const buffer of buffers) {
      const source = await PDFDocument.load(buffer);
      const pageIndices = source.getPageIndices();
      expectedPages += pageIndices.length;
      const pages = await writer.copyPages(source, pageIndices);
      for (const page of pages) {
        writer.addPage(page);
      }
    }
    const merged = Buffer.from(await writer.save());
    const verification = await PDFDocument.load(merged);
    if (verification.getPageCount() !== expectedPages) {
      throw new Error(
        `PDF merge page count mismatch: expected ${expectedPages}, got ${verification.getPageCount()}`,
      );
    }
    return merged;
  }

  private extractPdfRepeatingChrome(
    htmlContent: string,
  ): { headerTemplate: string; footerTemplate: string } | null {
    const source = String(htmlContent || '');
    const headerMatch = source.match(
      /<div\s+class=["']doc-header-frame["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<div\s+class=["']doc-inner["']/i,
    );
    const footerMatch = source.match(
      /<div\s+class=["']doc-footer-frame["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    );
    if (!headerMatch?.[1] || !footerMatch?.[1]) {
      return null;
    }
    const headerInner = headerMatch[1].trim();
    const footerInner = footerMatch[1].trim();
    if (!headerInner || !footerInner) {
      return null;
    }
    const chromeCss = `
      <style>
        html, body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
        .pdf-header, .pdf-footer {
          width: 100%;
          font-family: "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .pdf-header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 72px;
          padding: 0 36px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          border-bottom: 1px solid #e5e7eb;
          background: linear-gradient(90deg, rgba(185, 28, 28, 0.08), rgba(185, 28, 28, 0.02));
          color: #111827;
        }
        .pdf-footer {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 34px;
          padding: 7px 56px 0;
          color: #667085;
          font-size: 11px;
          line-height: 1.5;
          text-align: center;
        }
        .pdf-footer-line {
          border-top: 1px solid #e5e7eb;
          padding-top: 6px;
        }
        .doc-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .doc-header-logo { width: 26px; height: 26px; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
        .doc-header-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
        .doc-header-title { font-size: 15px; font-weight: 800; letter-spacing: 0.6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 560px; }
        .doc-header-meta { color: #667085; font-size: 12px; letter-spacing: 0.2px; flex: 0 0 auto; white-space: nowrap; }
      </style>`;
    return {
      headerTemplate: `${chromeCss}<div class="pdf-header">${headerInner}</div>`,
      footerTemplate: `${chromeCss}<div class="pdf-footer"><div class="pdf-footer-line">${footerInner}</div></div>`,
    };
  }

  /**
   * `html-to-docx` 对复杂 CSS（封面层叠、水印、渐变、固定高度等）兼容性较差，容易排版错乱。
   * 这里从同源 HTML 中提取标题与正文，转换为 Word 友好的简化文档结构，尽量保持与 PDF 一致的阅读顺序与层级。
   */
  private buildDocxFriendlyHtml(htmlContent: string): string {
    const source = String(htmlContent || '');
    const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || 'Security Report';
    const reportDate = new Date().toISOString().slice(0, 10);
    const mdBlockMatch = source.match(
      /<div class="md">([\s\S]*?)<\/div>\s*(?:<div class="doc-note"|<\/div>\s*<\/div>\s*<\/div>)/i,
    );
    let bodyHtml = mdBlockMatch?.[1]?.trim() || source;

    // Avoid duplicate top title: markdown body often starts with the same H1 as <title>.
    bodyHtml = bodyHtml.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '');

    // `html-to-docx` usually keeps inline styles better than class/<style> rules.
    bodyHtml = this.applyDocxInlineStyles(bodyHtml);

    const themeMain = '#991b1b';
    const themeStrong = '#7f1d1d';
    const themeSoft = '#fee2e2';
    const themeSoftBg = '#fff1f2';
    const themeBorder = '#fecaca';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    body {
      font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif;
      color: #0f172a;
      line-height: 1.7;
      font-size: 12pt;
      margin: 0;
      background: #f8fafc;
    }
    h1, h2, h3, h4 {
      color: #111827;
      line-height: 1.35;
      margin: 0.8em 0 0.4em;
    }
    h1 { font-size: 22pt; }
    h2 {
      font-size: 16pt;
      border-left: 4px solid #b91c1c;
      padding-left: 8px;
    }
    h3 { font-size: 14pt; }
    p { margin: 0.4em 0; }
    ul, ol { margin: 0.4em 0 0.6em 1.4em; }
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin: 0.7em 0;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 6px 8px;
      vertical-align: top;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    th { background: #f3f4f6; }
    .status-pill {
      display: inline;
      max-width: 100%;
      padding: 0;
      border-radius: 0;
      border: 0;
      background: transparent;
      font-weight: 700;
      line-height: inherit;
      text-align: inherit;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .status-pill.success {
      color: #047857;
      background: transparent;
      border: 0;
    }
    .status-pill.warn {
      color: #b45309;
      background: transparent;
      border: 0;
    }
    .status-pill.danger {
      color: #b91c1c;
      background: transparent;
      border: 0;
    }
    blockquote {
      border-left: 3px solid #b91c1c;
      padding-left: 10px;
      color: #374151;
      margin: 0.6em 0;
    }
    code {
      font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
      background: #f3f4f6;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 10pt;
    }
    pre {
      font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 8px;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 10pt;
      line-height: 1.5;
    }
    .doc-shell {
      padding: 0;
      margin: 0;
    }
    .hero {
      padding: 18px 22px;
      color: #ffffff;
      background: linear-gradient(135deg, ${themeStrong} 0%, ${themeMain} 45%, #dc2626 100%);
      border-bottom: 4px solid ${themeStrong};
    }
    .hero-title {
      margin: 0;
      font-size: 20pt;
      font-weight: 700;
      line-height: 1.3;
      color: #ffffff;
    }
    .hero-subtitle {
      margin: 6px 0 0;
      font-size: 10.5pt;
      color: #fee2e2;
    }
    .cover {
      margin: 0;
      min-height: 860px;
      padding: 70px 54px 60px;
      background: linear-gradient(145deg, #fafafa 0%, #f3f4f6 55%, #e5e7eb 100%);
      border: 1px solid #d1d5db;
    }
    .cover-badge {
      display: inline-block;
      padding: 5px 12px;
      font-size: 10pt;
      letter-spacing: 0.8px;
      color: ${themeStrong};
      border: 1px solid ${themeBorder};
      background: ${themeSoftBg};
    }
    .cover-title {
      margin: 26px 0 12px;
      font-size: 34pt;
      font-weight: 800;
      line-height: 1.24;
      color: #111827;
    }
    .cover-subtitle {
      margin: 0 0 24px;
      font-size: 13pt;
      color: #374151;
      line-height: 1.65;
    }
    .cover-divider {
      width: 220px;
      height: 6px;
      background: linear-gradient(90deg, ${themeStrong} 0%, #dc2626 100%);
      margin: 22px 0 28px;
    }
    .cover-meta {
      margin-top: 30px;
      border: 1px solid #d1d5db;
      background: #ffffff;
      width: 100%;
      border-collapse: collapse;
    }
    .cover-meta td {
      border: 1px solid #d1d5db;
      padding: 10px 12px;
      font-size: 11pt;
      color: #111827;
      vertical-align: top;
    }
    .cover-meta td:first-child {
      width: 34%;
      background: ${themeSoft};
      color: ${themeStrong};
      font-weight: 600;
    }
    .page-break {
      page-break-after: always;
    }
    .paper {
      margin: 14px;
      padding: 18px 20px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="doc-shell">
    <div class="cover page-break">
      <span class="cover-badge">CONFIDENTIAL REPORT</span>
      <h1 class="cover-title">${title}</h1>
      <p class="cover-subtitle">智能体安全评估与验证文档</p>
      <div class="cover-divider"></div>
      <table class="cover-meta">
        <tr><td>报告名称</td><td>${title}</td></tr>
        <tr><td>报告日期</td><td>${reportDate}</td></tr>
        <tr><td>报告平台</td><td>${REPORT_PRODUCT_BRAND_ZH}安全平台</td></tr>
        <tr><td>文档级别</td><td>内部文档 / 请按需分发</td></tr>
      </table>
    </div>
    <div class="hero">
      <p class="hero-title">${title}</p>
      <p class="hero-subtitle">${REPORT_PRODUCT_BRAND_ZH}安全报告</p>
    </div>
    <div class="paper">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
  }

  /** Merge/append style attr onto a raw tag attribute segment (e.g. ` class="x"`). */
  private mergeStyleAttr(attrs: string, styleToAppend: string): string {
    const styleRe = /\sstyle=(['"])([\s\S]*?)\1/i;
    const m = attrs.match(styleRe);
    if (!m) {
      return `${attrs} style="${styleToAppend}"`;
    }
    const quote = m[1];
    const existing = (m[2] || '').trim();
    const merged = existing ? `${existing}; ${styleToAppend}` : styleToAppend;
    return attrs.replace(styleRe, ` style=${quote}${merged}${quote}`);
  }

  /** Convert key semantic tags to inline styles for more stable Word rendering. */
  private applyDocxInlineStyles(html: string): string {
    const styleMap: Array<{ tag: string; style: string }> = [
      {
        tag: 'h1',
        style:
          'font-size:24pt; line-height:1.28; margin:22pt 0 12pt; color:#0f172a; font-weight:800;',
      },
      {
        tag: 'h2',
        style:
          'font-size:17pt; line-height:1.32; margin:16pt 0 10pt; color:#111827; font-weight:700; border-left:4px solid #b91c1c; padding:5px 0 5px 9px; background:#fafafa;',
      },
      {
        tag: 'h3',
        style:
          'font-size:14pt; line-height:1.35; margin:12pt 0 7pt; color:#111827; font-weight:700;',
      },
      {
        tag: 'h4',
        style:
          'font-size:12.5pt; line-height:1.35; margin:10pt 0 6pt; color:#111827; font-weight:700;',
      },
      {
        tag: 'p',
        style: 'margin:8pt 0 10pt; line-height:1.78; color:#0f172a;',
      },
      { tag: 'ul', style: 'margin:8pt 0 12pt 22pt;' },
      { tag: 'ol', style: 'margin:8pt 0 12pt 22pt;' },
      { tag: 'li', style: 'margin:4pt 0; line-height:1.72;' },
      {
        tag: 'table',
        style:
          'width:100%; border-collapse:collapse; margin:12pt 0 14pt; border:1px solid #cbd5e1; background:#ffffff;',
      },
      {
        tag: 'th',
        style:
          'border:1px solid #cbd5e1; padding:7px 9px; text-align:left; background:#fee2e2; color:#111827; font-weight:700;',
      },
      {
        tag: 'td',
        style:
          'border:1px solid #cbd5e1; padding:7px 9px; vertical-align:top; color:#111827; background:#ffffff;',
      },
      {
        tag: 'blockquote',
        style:
          'margin:10pt 0 12pt; padding:9px 12px; border-left:3px solid #b91c1c; background:#fff5f5; color:#374151;',
      },
      {
        tag: 'pre',
        style:
          "font-family:Menlo,Monaco,Consolas,'Courier New',monospace; background:#f8fafc; border:1px solid #e2e8f0; padding:10px; white-space:pre-wrap; word-break:break-word; font-size:10pt; line-height:1.5; margin:8pt 0 12pt;",
      },
      {
        tag: 'code',
        style:
          "font-family:Menlo,Monaco,Consolas,'Courier New',monospace; background:#f3f4f6; border:1px solid #e5e7eb; padding:1px 3px; font-size:10pt;",
      },
    ];

    let out = html;
    for (const row of styleMap) {
      const re = new RegExp(`<${row.tag}(\\b[^>]*)>`, 'gi');
      out = out.replace(re, (_all, attrs: string) => {
        const merged = this.mergeStyleAttr(attrs || '', row.style);
        return `<${row.tag}${merged}>`;
      });
    }
    return out;
  }

  private rethrowPlaywrightPdfError(error: unknown): never {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to render PDF via Playwright', {
      message: err.message,
      stack: err.stack,
    });
    const missingBrowser =
      /Executable doesn't exist|browserType\.launch|chromium_headless_shell|download new browsers|playwright install/i.test(
        err.message,
      );
    if (missingBrowser) {
      throw new Error(
        'PDF_RENDERER_UNAVAILABLE: Playwright Chromium is not available. On the host run: npm run playwright:install (or npx playwright install chromium) and restart the API. In Docker (Alpine), install the chromium package and set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (see project Dockerfile).',
      );
    }
    throw new Error(
      `PDF generation failed in browser renderer. Please ensure Playwright Chromium is installed. Root cause: ${err.message}`,
    );
  }

  private async renderHtmlToPdfBuffer(htmlContent: string): Promise<Buffer> {
    try {
      const { chromium } = await import('playwright');
      const browser = await this.withPdfTimeout(
        chromium.launch(this.chromiumLaunchOptionsForPdf()),
        'browser launch',
      );
      let closePromise: Promise<void> | undefined;
      const closeBrowser = () => {
        closePromise ??= this.closePdfBrowserWithin(browser);
        return closePromise;
      };
      try {
        const context = await browser.newContext({
          viewport: { width: 794, height: 1123 },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        return await this.withPdfTimeout(
          this.renderHtmlToPdfOnPage(page, htmlContent),
          'render',
          () => void closeBrowser(),
        );
      } finally {
        await closeBrowser();
      }
    } catch (error) {
      this.rethrowPlaywrightPdfError(error);
    }
  }

  async renderHtmlSnapshotToDocxBuffer(htmlContent: string): Promise<Buffer> {
    const { default: htmlToDocx } = await import('html-to-docx');
    const docxHtml = this.buildDocxFriendlyHtml(htmlContent);
    const output = await htmlToDocx(docxHtml, undefined, {
      table: { row: { cantSplit: true } },
    });
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  }

  /**
   * Zip one PDF per PoC HTML document (Playwright). Validates organization access to the task.
   */
  async buildPocSuitePdfZipBuffer(
    taskId: string,
    organizationId: string,
    documents: Array<{ baseName: string; html: string }>,
  ): Promise<Buffer> {
    const taskData = await this.getTaskData(taskId, organizationId);
    if (!taskData) {
      throw new Error('Task not found');
    }

    const MAX_DOCS = 12;
    const MAX_HTML_CHARS = 12_000_000;
    if (!Array.isArray(documents) || documents.length === 0 || documents.length > MAX_DOCS) {
      throw new Error('Invalid documents payload');
    }

    const { zipSync } = await import('fflate');
    const files: Record<string, Uint8Array> = {};
    const usedNames = new Set<string>();

    const sanitizeBase = (raw: string): string => {
      const s = String(raw ?? '')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
      return s || 'document';
    };

    type Prepared = { entryName: string; html: string };
    const prepared: Prepared[] = [];
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const html = typeof doc?.html === 'string' ? doc.html : '';
      if (!html || html.length > MAX_HTML_CHARS) {
        throw new Error(`Invalid HTML for document index ${i}`);
      }
      const base = sanitizeBase(typeof doc?.baseName === 'string' ? doc.baseName : '');
      let entryName = `${base}.pdf`;
      let n = 2;
      while (usedNames.has(entryName)) {
        entryName = `${base}-${n}.pdf`;
        n++;
      }
      usedNames.add(entryName);
      prepared.push({ entryName, html });
    }

    // 每个文档单独 launch Chromium 极慢且易触发客户端超时；整包只启动一次浏览器，逐页渲染。
    let browser: Browser | undefined;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch(this.chromiumLaunchOptionsForPdf());
      const context = await browser.newContext({
        viewport: { width: 794, height: 1123 },
        deviceScaleFactor: 1,
      });
      try {
        for (const { entryName, html } of prepared) {
          const page = await context.newPage();
          try {
            const pdf = await this.renderHtmlToPdfOnPage(page, html);
            files[entryName] = new Uint8Array(pdf);
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    } catch (error) {
      this.rethrowPlaywrightPdfError(error);
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    return Buffer.from(zipSync(files, { level: 6 }));
  }

  /**
   * Generate report
   */
  async generateReport(
    taskId: string,
    organizationId: string,
    format: 'pdf' | 'html' | 'md' | 'docx' = 'pdf',
    templateId?: string,
  ): Promise<string> {
    let reportRunId: string | null = null;
    try {
      // Get task data
      const taskData = await this.getTaskData(taskId, organizationId);
      if (!taskData) {
        throw new Error('Task not found');
      }

      // Resolve template: explicit id > task_type_report_bindings (MySQL) > default
      let effectiveTemplateId = templateId;
      if (!effectiveTemplateId && getDbType() === 'mysql') {
        const taskRow = taskData.task as { taskTypeId?: string | null };
        if (taskRow?.taskTypeId) {
          const bound = await resolveTemplateIdForMysqlTaskType(taskRow.taskTypeId);
          if (bound) {
            effectiveTemplateId = bound;
          }
        }
      }
      const template = effectiveTemplateId
        ? await this.getReportTemplate(effectiveTemplateId)
        : await this.getDefaultTemplate();

      // Generate report content
      const reportData = await this.prepareReportData(taskData);
      const taskReportKind = resolveTaskReportKind({
        taskTypeCode: reportData.taskTypeCode,
        taskKind: reportData.taskKind,
        platformFamily: reportData.platformFamily,
        taskMetadata: reportData.taskMetadata,
      });
      const requestedFormat = format;
      const effectiveFormat: 'pdf' | 'html' | 'md' | 'docx' = requestedFormat;

      // DOCX reuses the same HTML rendering as PDF to keep report styling consistent.
      const strategyFormat = requestedFormat === 'docx' ? 'html' : requestedFormat;
      const formatStrategy = getReportFormatStrategy(strategyFormat);
      const { content } = await formatStrategy.generateContent(reportData, {
        format: strategyFormat,
        template,
      });

      // `content` for pdf strategy is the underlying HTML (PdfReportStrategy reuses HTML).
      // We keep a preview string so the UI can render even when the stored file is a real PDF.
      const previewContent = applyReportProductBrand(
        typeof content === 'string' ? content : content.toString('utf-8'),
      );

      // For PDF/DOCX, generate file bytes from the same HTML representation.
      let finalContent: string | Buffer = previewContent;
      if (requestedFormat === 'pdf') {
        finalContent = await this.renderHtmlToPdfBuffer(previewContent);
      } else if (requestedFormat === 'docx') {
        const { default: htmlToDocx } = await import('html-to-docx');
        const docxHtml = this.buildDocxFriendlyHtml(previewContent);
        finalContent = await htmlToDocx(docxHtml, undefined, {
          table: { row: { cantSplit: true } },
        });
      }

      // Build additional metadata for richer UI rendering
      const summaryMeta = {
        totalFindings: reportData.summary.totalFindings,
        vulnerableFindings: reportData.summary.vulnerableFindings,
        highRiskCount: reportData.summary.highRiskCount,
        mediumRiskCount: reportData.summary.mediumRiskCount,
        lowRiskCount: reportData.summary.lowRiskCount,
        executionTime: reportData.summary.executionTime,
        completedAt: reportData.summary.completedAt,
        testStart: reportData.summary.testStart,
        testEnd: reportData.summary.testEnd,
      };

      const documentInfo = {
        documentName:
          taskReportKind === 'api_blackbox'
            ? getApiBlackboxReportTitle(reportData)
            : taskReportKind === 'dify_config_static' ||
                taskReportKind === 'dify_config_audit' ||
                taskReportKind === 'coze_config_static' ||
                taskReportKind === 'coze_config_audit' ||
                taskReportKind === 'fastgpt_config_static' ||
                taskReportKind === 'fastgpt_config_audit'
              ? getDifyConfigTaskReportTitle(reportData)
              : `${reportData.taskName || 'Attack Task'} 渗透测试报告`,
        securityLevel: '秘密文档，请勿外传',
        author: `${REPORT_PRODUCT_BRAND_ZH}安全测试平台`,
        reportDate: new Date().toISOString(),
      };
      const assessmentSummary =
        taskReportKind === 'api_blackbox'
          ? buildAgentSecurityAssessmentSummary(reportData)
          : undefined;

      const findingsPreview = reportData.results.map((r, index) => {
        const verdict = (r as any).finalVerdict || {};
        const vulnerable =
          verdict.vulnerable === true || String(verdict.vulnerable).toLowerCase() === 'true';
        const req =
          (r as any).request && typeof (r as any).request === 'object' ? (r as any).request : {};
        const resultId =
          (r as any).id != null && String((r as any).id).length > 0
            ? String((r as any).id)
            : typeof (req as any).findingRecordId === 'string'
              ? String((req as any).findingRecordId)
              : undefined;
        return {
          index: index + 1,
          vulnerabilityId: r.vulnerabilityId,
          riskLevel: verdict.riskLevel || 'low',
          vulnerable,
          reason: verdict.reason || '',
          createdAt: r.createdAt,
          commandId: r.commandId,
          ...(resultId ? { resultId } : {}),
        };
      });

      // Save report to database
      const fileName = `report_${taskId}_${Date.now()}.${effectiveFormat}`;
      const filePath = path.join(this.reportsDir, fileName);

      // Write file
      fs.writeFileSync(filePath, finalContent);

      // Get file size
      const stats = fs.statSync(filePath);

      // Save to database
      const tables = getTables() as ReturnType<typeof getTables> & {
        reportRunsTable?: typeof import('../database/tables-mysql').reportRunsTable;
      };
      const { reportsTable, reportRunsTable } = tables;

      const findingIdsForReport =
        getDbType() === 'mysql' ? await listFindingRecordIdsForTask(taskId) : [];
      const templateRowId = (template as { id?: string } | null)?.id;
      reportRunId = getDbType() === 'mysql' && templateRowId ? uuidv4() : null;
      if (getDbType() === 'mysql' && reportRunsTable && templateRowId && reportRunId) {
        const now = new Date();
        await db.insert(reportRunsTable).values({
          id: reportRunId,
          taskId,
          organizationId,
          templateId: templateRowId,
          reportType: 'attack_task',
          status: 'running',
          inputFindingIds: findingIdsForReport.length > 0 ? findingIdsForReport : null,
          renderContext: { format: effectiveFormat },
          createdAt: now,
          updatedAt: now,
        });
      }

      // Build insert payload; for MySQL we must explicitly provide an id
      const dbType = getDbType();
      const staticSummary = (reportData.taskMetadata as any)?.configAuditStaticSummary as
        | {
            summary?: string;
            overallRisk?: string;
            findings?: unknown[];
            recommendations?: string[];
            warnings?: string[];
            truncated?: boolean;
          }
        | undefined;
      const difyAuditData =
        taskReportKind === 'dify_config_audit' ||
        taskReportKind === 'dify_config_static' ||
        taskReportKind === 'coze_config_audit' ||
        taskReportKind === 'coze_config_static' ||
        taskReportKind === 'fastgpt_config_audit' ||
        taskReportKind === 'fastgpt_config_static'
          ? {
              summary: String(staticSummary?.summary ?? ''),
              overallRisk: String(staticSummary?.overallRisk ?? ''),
              findings: Array.isArray(staticSummary?.findings) ? staticSummary!.findings : [],
              recommendations: Array.isArray(staticSummary?.recommendations)
                ? staticSummary!.recommendations
                : [],
              warnings: Array.isArray(staticSummary?.warnings)
                ? staticSummary!.warnings
                : undefined,
              truncated: Boolean(staticSummary?.truncated),
            }
          : undefined;
      const resolvedReportType =
        taskReportKind === 'dify_config_audit'
          ? 'dify_config_audit'
          : taskReportKind === 'dify_config_static'
            ? 'dify_config_static'
            : taskReportKind === 'coze_config_audit'
              ? 'coze_config_audit'
              : taskReportKind === 'coze_config_static'
                ? 'coze_config_static'
                : taskReportKind === 'fastgpt_config_audit'
                  ? 'fastgpt_config_audit'
                  : taskReportKind === 'fastgpt_config_static'
                    ? 'fastgpt_config_static'
                    : 'agent_security_assessment';
      const insertValues: any = {
        taskId,
        organizationId,
        templateId: templateRowId ?? templateId,
        reportType: resolvedReportType,
        format: effectiveFormat,
        // Store preview content for all formats so UI can render consistently.
        content:
          effectiveFormat === 'md' ||
          effectiveFormat === 'html' ||
          effectiveFormat === 'pdf' ||
          effectiveFormat === 'docx'
            ? previewContent
            : undefined,
        filePath: fileName,
        fileSize: stats.size,
        metadata: {
          generatedAt: new Date().toISOString(),
          format,
          templateUsed: template?.name || 'default',
          // Embed basic task metadata so the UI can show task name instead of raw ID
          taskName: reportData.taskName,
          taskDescription: reportData.taskDescription,
          targetType: reportData.targetType,
          attackMode: reportData.attackMode,
          ...((reportData.taskMetadata as Record<string, unknown> | undefined)?.runSource
            ? {
                runSource: (reportData.taskMetadata as Record<string, unknown>).runSource,
              }
            : {}),
          summary: summaryMeta,
          ...(assessmentSummary
            ? {
                assessment: {
                  totalCases: assessmentSummary.totalCases,
                  passedCases: assessmentSummary.passedCases,
                  failedCases: assessmentSummary.failedCases,
                  passRate: Math.round(assessmentSummary.passRate * 100) / 100,
                  passThreshold: assessmentSummary.passThreshold,
                  conclusion: assessmentSummary.conclusion,
                  conclusionLabel: assessmentSummary.conclusionLabel,
                  launchAdvice: assessmentSummary.launchAdvice,
                },
              }
            : {}),
          documentInfo,
          findingsPreview,
          ...(difyAuditData
            ? {
                overallRisk: difyAuditData.overallRisk,
                findingsCount: difyAuditData.findings.length,
                auditData: difyAuditData,
              }
            : {}),
        },
      };
      if (dbType === 'mysql' && !insertValues.id) {
        insertValues.id = uuidv4();
      }
      if (dbType === 'mysql' && reportRunId) {
        insertValues.reportRunId = reportRunId;
        insertValues.sourceFindingIds = findingIdsForReport.length > 0 ? findingIdsForReport : null;
        insertValues.status = 'draft';
      }

      let report: any;
      if (dbType === 'mysql') {
        // mysql driver does not support .returning()
        await db.insert(reportsTable).values(insertValues);
        report = insertValues;
        if (reportRunsTable && reportRunId) {
          await db
            .update(reportRunsTable)
            .set({
              status: 'completed',
              outputReportId: report.id,
              updatedAt: new Date(),
            })
            .where(eq(reportRunsTable.id, reportRunId));
        }
      } else {
        const [inserted] = await db.insert(reportsTable).values(insertValues).returning();
        report = inserted;
      }

      logger.info(`Report generated: ${report.id} for task ${taskId} (${format})`);
      return report.id;
    } catch (error) {
      try {
        if (getDbType() === 'mysql' && reportRunId) {
          const t = getTables() as {
            reportRunsTable?: typeof import('../database/tables-mysql').reportRunsTable;
          };
          if (t.reportRunsTable) {
            await db
              .update(t.reportRunsTable)
              .set({
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : String(error),
                updatedAt: new Date(),
              })
              .where(eq(t.reportRunsTable.id, reportRunId));
          }
        }
      } catch {
        // ignore cleanup errors
      }
      logger.error(`Generate report error for task ${taskId}: ${errorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Create an audit report (e.g. Dify Config gray-box scanning) and save to reports table.
   * Used for task-mode audits that write results into Reports.
   */
  async createAuditReport(
    organizationId: string,
    auditData: DifyConfigAuditResult,
    options?: {
      fileName?: string;
      reportType?:
        | 'dify_config_audit'
        | 'skills_md_audit'
        | 'mcp_source_audit'
        | 'coze_config_audit'
        | 'fastgpt_config_audit'
        | 'n8n_config_audit';
      markdownTitle?: string;
    },
  ): Promise<string> {
    const { reportsTable } = getTables();
    const _dbType = getDbType();
    const reportId = uuidv4();
    const reportType = options?.reportType ?? 'dify_config_audit';
    const markdownTitle =
      options?.markdownTitle ??
      (reportType === 'skills_md_audit'
        ? 'SKILLS 技能包安全审计报告'
        : reportType === 'mcp_source_audit'
          ? 'MCP 服务端源码安全审计报告'
          : reportType === 'coze_config_audit'
            ? 'Coze Config Audit Report'
            : reportType === 'fastgpt_config_audit'
              ? 'FastGPT Config Audit Report'
              : reportType === 'n8n_config_audit'
                ? 'n8n 工作流配置安全审计报告'
                : 'Dify 配置安全审计报告');
    const defaultTitleLabel =
      reportType === 'skills_md_audit'
        ? 'SKILLS 技能包安全审计'
        : reportType === 'mcp_source_audit'
          ? 'MCP 源码安全审计'
          : reportType === 'coze_config_audit'
            ? 'Coze Config Audit'
            : reportType === 'fastgpt_config_audit'
              ? 'FastGPT Config Audit'
              : reportType === 'n8n_config_audit'
                ? 'n8n 配置安全审计'
                : 'Dify 配置安全审计';
    const title =
      options?.fileName || `${defaultTitleLabel} - ${new Date().toISOString().slice(0, 10)}`;
    const { renderDifyConfigAuditReportFromAuditResult } = await import(
      '../reports/markdown/DifyConfigAuditSecurityReport'
    );
    const { renderCozeConfigAuditReportFromAuditResult } = await import(
      '../reports/markdown/CozeConfigAuditSecurityReport'
    );
    const { renderFastGptConfigAuditReportFromAuditResult } = await import(
      '../reports/markdown/FastGptConfigAuditSecurityReport'
    );
    const { renderSkillsMdAuditReportFromAuditResult } = await import(
      '../reports/markdown/SkillsMdAuditSecurityReport'
    );
    const markdown =
      reportType === 'skills_md_audit'
        ? renderSkillsMdAuditReportFromAuditResult(
            auditData as DifyConfigAuditResult & {
              scannedFiles?: { path: string }[];
            },
            options?.fileName,
            { reportTitle: markdownTitle, kind: 'skills' },
          )
        : reportType === 'mcp_source_audit'
          ? renderSkillsMdAuditReportFromAuditResult(
              auditData as DifyConfigAuditResult & {
                scannedFiles?: { path: string }[];
              },
              options?.fileName,
              { reportTitle: markdownTitle, kind: 'mcp' },
            )
          : reportType === 'coze_config_audit'
            ? renderCozeConfigAuditReportFromAuditResult(auditData, options?.fileName, {
                reportTitle: markdownTitle,
              })
            : reportType === 'fastgpt_config_audit'
              ? renderFastGptConfigAuditReportFromAuditResult(auditData, options?.fileName, {
                  reportTitle: markdownTitle,
                })
              : renderDifyConfigAuditReportFromAuditResult(auditData, options?.fileName, {
                  reportTitle: markdownTitle,
                });

    const brandedMarkdown = applyReportProductBrand(markdown);
    const fileName = `report_audit_${reportId}.md`;
    const filePath = path.join(this.reportsDir, fileName);
    fs.writeFileSync(filePath, brandedMarkdown, 'utf-8');
    const stats = fs.statSync(filePath);

    const insertValues: any = {
      id: reportId,
      taskId: null,
      organizationId,
      reportType,
      title,
      format: 'md',
      content: brandedMarkdown,
      filePath: fileName,
      fileSize: stats.size,
      metadata: {
        auditType: reportType,
        overallRisk: auditData.overallRisk,
        findingsCount: auditData.findings.length,
        createdAt: new Date().toISOString(),
        fileName: options?.fileName,
        auditData: {
          summary: auditData.summary,
          overallRisk: auditData.overallRisk,
          findings: auditData.findings,
          recommendations: auditData.recommendations,
          warnings: auditData.warnings,
          truncated: auditData.truncated,
        },
      },
    };

    await db.insert(reportsTable).values(insertValues);

    logger.info(`Audit report created: ${reportId} for organization ${organizationId}`);
    return reportId;
  }

  async createManualQnaExcelReport(
    organizationId: string,
    input: {
      title: string;
      markdown: string;
      sourceFileName: string;
      targetDisplayName?: string;
      rowCount: number;
    },
  ): Promise<string> {
    const { reportsTable } = getTables();
    const reportId = uuidv4();
    const brandedMarkdown = applyReportProductBrand(input.markdown);
    const fileName = `report_qna_excel_${reportId}.md`;
    const filePath = path.join(this.reportsDir, fileName);
    fs.writeFileSync(filePath, brandedMarkdown, 'utf-8');
    const stats = fs.statSync(filePath);

    await db.insert(reportsTable).values({
      id: reportId,
      taskId: null,
      organizationId,
      reportType: 'qna_excel_manual',
      title: input.title,
      format: 'md',
      content: brandedMarkdown,
      filePath: fileName,
      fileSize: stats.size,
      metadata: {
        source: 'manual_qna_excel',
        reportNo: `MAN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${reportId.replace(/-/g, '').slice(-6).toUpperCase()}`,
        sourceFileName: input.sourceFileName,
        targetDisplayName: input.targetDisplayName,
        rowCount: input.rowCount,
        createdAt: new Date().toISOString(),
      },
    } as any);

    logger.info(`Manual Q&A Excel report created: ${reportId} for organization ${organizationId}`);
    return reportId;
  }

  /**
   * Dify 配置类 Markdown 报告在落库时会把正文快照进 `content`；模板或节点解析逻辑升级后，
   * 详情页「完整报告」仍读库会显示旧文案（如「全文命中」）。对关联 task 的 md 报告在读取时按当前任务数据重渲染正文（仅响应体，不写回库）。
   */
  private async withRefreshedDifyMarkdownPreview(
    report: Record<string, unknown>,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const taskId = report.taskId as string | null | undefined;
    const reportType = String(report.reportType ?? '').toLowerCase();
    const fmt = String(report.format ?? '').toLowerCase();
    if (
      !taskId ||
      (reportType !== 'dify_config_audit' &&
        reportType !== 'dify_config_static' &&
        reportType !== 'coze_config_audit' &&
        reportType !== 'coze_config_static' &&
        reportType !== 'fastgpt_config_audit' &&
        reportType !== 'fastgpt_config_static') ||
      fmt !== 'md'
    ) {
      return report;
    }
    try {
      const taskData = await this.getTaskData(taskId, organizationId);
      if (!taskData) {
        return report;
      }
      const reportData = await this.prepareReportData(taskData);
      const kind = resolveTaskReportKind({
        taskTypeCode: reportData.taskTypeCode,
        taskKind: reportData.taskKind,
        platformFamily: reportData.platformFamily,
        taskMetadata: reportData.taskMetadata,
      });
      if (
        kind !== 'dify_config_audit' &&
        kind !== 'dify_config_static' &&
        kind !== 'coze_config_audit' &&
        kind !== 'coze_config_static' &&
        kind !== 'fastgpt_config_audit' &&
        kind !== 'fastgpt_config_static'
      ) {
        return report;
      }
      const fresh = renderDifyConfigAuditReportFromTaskData(reportData);
      return { ...report, content: fresh };
    } catch (e: unknown) {
      logger.warn('Failed to refresh Dify config markdown preview; using stored content', {
        reportId: report.id,
        message: e instanceof Error ? e.message : String(e),
      });
      return report;
    }
  }

  /**
   * Get report by ID
   */
  async getReport(reportId: string, organizationId: string) {
    try {
      const { reportsTable } = getTables();
      const [report] = await db
        .select()
        .from(reportsTable)
        .where(and(eq(reportsTable.id, reportId), eq(reportsTable.organizationId, organizationId)))
        .limit(1);

      if (!report) {
        return null;
      }
      return (await this.withRefreshedDifyMarkdownPreview(
        report as Record<string, unknown>,
        organizationId,
      )) as typeof report;
    } catch (error) {
      logger.error(`Get report error for ${reportId}: ${errorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Get reports for organization
   */
  async getReports(
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
      taskId?: string;
      format?: string;
      reportType?: string | string[];
    } = {},
  ) {
    try {
      const { limit = 50, offset = 0, taskId, format, reportType } = options;
      const { reportsTable } = getTables();

      const whereConditions = [eq(reportsTable.organizationId, organizationId)];

      if (taskId) {
        whereConditions.push(eq(reportsTable.taskId, taskId));
      }

      if (format) {
        whereConditions.push(eq(reportsTable.format, format as any));
      }

      const reportTypes = Array.isArray(reportType)
        ? reportType
        : typeof reportType === 'string'
          ? reportType
              .split(',')
              .map((type) => type.trim())
              .filter(Boolean)
          : [];
      if (reportTypes.length === 1) {
        whereConditions.push(eq(reportsTable.reportType, reportTypes[0] as any));
      } else if (reportTypes.length > 1) {
        whereConditions.push(inArray(reportsTable.reportType, reportTypes as any[]));
      }

      let reports: any[] = [];
      let count = 0;

      try {
        reports = await db
          .select()
          .from(reportsTable)
          .where(and(...whereConditions))
          .orderBy(desc(reportsTable.createdAt))
          .limit(limit)
          .offset(offset);

        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(reportsTable)
          .where(and(...whereConditions));
        count = countResult[0]?.count ?? 0;
      } catch (error: any) {
        const code = error?.cause?.code || error?.code;
        if (code === 'ER_NO_SUCH_TABLE') {
          logger.warn('reports table not found, returning empty reports list');
          reports = [];
          count = 0;
        } else {
          throw error;
        }
      }

      return {
        reports,
        total: count,
        limit,
        offset,
      };
    } catch (error) {
      logger.error(`Get reports error: ${errorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Download report file
   */
  async downloadReport(
    reportId: string,
    organizationId: string,
    requestedFormat?: string,
  ): Promise<{
    filePath: string;
    fileName: string;
    contentType: string;
  }> {
    try {
      const report = await this.getReport(reportId, organizationId);
      if (!report) {
        throw new Error('Report not found');
      }

      const storedFormat = String(report.format || 'pdf').toLowerCase();
      const want = requestedFormat ? String(requestedFormat).toLowerCase() : storedFormat;

      const normalizeWant = (f: string) => {
        if (f === 'markdown') {
          return 'md';
        }
        if (f === 'htm') {
          return 'html';
        }
        if (f === 'word' || f === 'doc') {
          return 'docx';
        }
        return f;
      };
      const normalizedWant = normalizeWant(want);

      const allowed = new Set(['md', 'html', 'pdf', 'docx']);
      if (!allowed.has(normalizedWant)) {
        throw new Error(`Unsupported download format: ${normalizedWant}`);
      }

      let storedContent = typeof report.content === 'string' ? report.content.trim() : '';
      const reportMetadata = jsonRecord(report.metadata);
      const reportType = String(report.reportType ?? '').toLowerCase();
      const compliancePreview = looksLikeComplianceReportPreview(reportMetadata.preview)
        ? reportMetadata.preview
        : undefined;
      const isComplianceAssessmentReport =
        reportType === 'compliance_assessment' || Boolean(compliancePreview);

      if (compliancePreview) {
        const preview = {
          ...compliancePreview,
          status:
            report.status === 'archived'
              ? 'archived'
              : report.status === 'published'
                ? 'finalized'
                : compliancePreview.status,
        } satisfies ComplianceReportPreview;
        storedContent = buildComplianceReportMarkdown(preview).trim();
      }
      const contentBackedReport =
        storedContent && (!report.filePath || !report.taskId || isComplianceAssessmentReport);

      if (contentBackedReport) {
        const brandConfig = await loadReportBrandConfig();
        const title =
          String(report.title ?? '').trim() ||
          String(reportMetadata.reportNo ?? '').trim() ||
          `report-${report.id}`;
        const htmlContent = looksLikeHtmlDocument(storedContent)
          ? applyReportProductBrand(storedContent)
          : applyReportProductBrand(
              wrapMarkdownPlainAsHtmlDocument(storedContent, title, brandConfig),
            );
        let output: string | Buffer;
        let contentType: string;

        if (normalizedWant === 'md') {
          output = applyReportProductBrand(storedContent);
          contentType = 'text/markdown';
        } else if (normalizedWant === 'html') {
          output = htmlContent;
          contentType = 'text/html';
        } else if (normalizedWant === 'pdf') {
          output = await this.renderHtmlToPdfBuffer(htmlContent);
          contentType = 'application/pdf';
        } else {
          const { default: htmlToDocx } = await import('html-to-docx');
          const docxHtml = this.buildDocxFriendlyHtml(htmlContent);
          output = await htmlToDocx(docxHtml, undefined, {
            table: { row: { cantSplit: true } },
          });
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }

        const safeTitle = title
          .replace(/[/\\?%*:|"<>]/g, '_')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100);
        const derivedName = `${safeTitle || `report-${report.id}`}.${normalizedWant}`;
        const derivedPath = path.join(this.reportsDir, derivedName);
        fs.writeFileSync(derivedPath, output);
        return {
          filePath: derivedPath,
          fileName: derivedName,
          contentType,
        };
      }

      // If user asks for the stored format, stream the existing file.
      if (!requestedFormat || normalizedWant === storedFormat) {
        const fullPath = path.join(this.reportsDir, report.filePath);
        if (!fs.existsSync(fullPath)) {
          throw new Error('Report file not found');
        }
        const formatStrategy = getReportFormatStrategy(storedFormat);
        return {
          filePath: fullPath,
          fileName: report.filePath,
          contentType: formatStrategy.getContentType(),
        };
      }

      // Otherwise: regenerate content on-demand from task data and return a derived file.
      const taskData = await this.getTaskData(report.taskId, organizationId);
      if (!taskData) {
        throw new Error('Task not found');
      }
      const template = report.templateId
        ? await this.getReportTemplate(report.templateId)
        : await this.getDefaultTemplate();
      const reportData = await this.prepareReportData(taskData);

      // HTML is the intermediate representation for pdf/docx.
      // Prefer persisted HTML-like report content so "HTML -> PDF/DOCX" is consistent.
      const storedPreview =
        typeof report.content === 'string' && /<html|<body|<h1|<table|<p/i.test(report.content)
          ? report.content
          : null;
      let htmlContent: string;
      if (storedPreview) {
        htmlContent = applyReportProductBrand(storedPreview);
      } else {
        const htmlStrategy = getReportFormatStrategy('html');
        const { content: htmlContentRaw } = await htmlStrategy.generateContent(reportData, {
          format: 'html',
          template,
        });
        htmlContent =
          typeof htmlContentRaw === 'string' ? htmlContentRaw : htmlContentRaw.toString('utf-8');
        htmlContent = applyReportProductBrand(htmlContent);
      }

      const fileExt = normalizedWant;
      let output: string | Buffer;
      let contentType: string;

      if (normalizedWant === 'md') {
        const mdStrategy = getReportFormatStrategy('md');
        const { content } = await mdStrategy.generateContent(reportData, {
          format: 'md',
          template,
        });
        output = applyReportProductBrand(
          typeof content === 'string' ? content : content.toString('utf-8'),
        );
        contentType = mdStrategy.getContentType();
      } else if (normalizedWant === 'html') {
        output = htmlContent;
        contentType = 'text/html';
      } else if (normalizedWant === 'pdf') {
        output = await this.renderHtmlToPdfBuffer(htmlContent);
        contentType = 'application/pdf';
      } else {
        // docx: convert rendered HTML to DOCX to preserve headings/tables styling.
        const { default: htmlToDocx } = await import('html-to-docx');
        const docxHtml = this.buildDocxFriendlyHtml(htmlContent);
        output = await htmlToDocx(docxHtml, undefined, {
          table: { row: { cantSplit: true } },
        });
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }

      const baseName = String(report.filePath || `report_${report.taskId}`).replace(
        /\.(pdf|html|md|docx)$/i,
        '',
      );
      const derivedName = `${baseName}.${fileExt}`;
      const derivedPath = path.join(this.reportsDir, derivedName);
      fs.writeFileSync(derivedPath, output);

      return {
        filePath: derivedPath,
        fileName: derivedName,
        contentType,
      };
    } catch (error) {
      logger.error(`Download report error for ${reportId}: ${errorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Delete report
   */
  async deleteReport(reportId: string, organizationId: string): Promise<void> {
    try {
      const report = await this.getReport(reportId, organizationId);
      if (!report) {
        throw new Error('Report not found');
      }

      // Delete file
      const fullPath = path.join(this.reportsDir, report.filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }

      // Delete from database
      const { reportsTable } = getTables();
      await db.delete(reportsTable).where(eq(reportsTable.id, reportId));

      logger.info(`Report deleted: ${reportId}`);
    } catch (error) {
      logger.error(`Delete report error for ${reportId}: ${errorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Get report templates
   */
  async getReportTemplates() {
    try {
      const { reportTemplatesTable } = getTables();
      const templates = await db
        .select()
        .from(reportTemplatesTable)
        .where(eq(reportTemplatesTable.enabled, true))
        .orderBy(reportTemplatesTable.name);

      return templates;
    } catch (error) {
      logger.error(`Get report templates error: ${errorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Get task data for report
   */
  private async getTaskData(taskId: string, organizationId: string) {
    try {
      const { attackTasksTable, attackResultsTable } = getTables();
      // Get task
      const [task] = await db
        .select()
        .from(attackTasksTable)
        .where(
          and(eq(attackTasksTable.id, taskId), eq(attackTasksTable.organizationId, organizationId)),
        )
        .limit(1);

      if (!task) {
        return null;
      }

      /** MySQL v4：若已有归一化发现，则报告正文以 `finding_records` 为准；否则仍用 `attack_results`。 */
      let results: any[] = [];
      let resultsSource: 'finding_records' | 'attack_results' = 'attack_results';

      if (getDbType() === 'mysql') {
        const frRows = await listFindingRecordsForReport(taskId, organizationId);
        if (frRows.length > 0) {
          results = mapFindingRecordsToReportResults(frRows, task);
          resultsSource = 'finding_records';
          try {
            const arRows = await db
              .select({
                id: attackResultsTable.id,
                request: attackResultsTable.request,
                commandId: attackResultsTable.commandId,
                finalVerdict: attackResultsTable.finalVerdict,
                detectionResults: attackResultsTable.detectionResults,
                response: attackResultsTable.response,
                vulnerabilityId: attackResultsTable.vulnerabilityId,
                scanRunId: attackResultsTable.scanRunId,
                rawResultType: attackResultsTable.rawResultType,
                createdAt: attackResultsTable.createdAt,
              })
              .from(attackResultsTable)
              .where(eq(attackResultsTable.taskId, taskId));
            results = mergeRequestAndVerdictFromSourceAttackResults(results, arRows);
            results = mergeDetectionFromSourceAttackResults(results, arRows);
            results = mergeAgentResponseFromSourceAttackResults(results, arRows);
          } catch (error: unknown) {
            const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code;
            const errCode = code || (error as { code?: string }).code;
            if (errCode === 'ER_NO_SUCH_TABLE') {
              logger.warn(
                'attack_results table missing; finding_records report rows lack merged detection',
              );
            } else {
              logger.warn(
                'Failed to merge attack_results detection into finding_records report rows',
                {
                  message: error instanceof Error ? error.message : String(error),
                },
              );
            }
          }
        }
      }

      if (resultsSource === 'attack_results') {
        try {
          results = await db
            .select()
            .from(attackResultsTable)
            .where(eq(attackResultsTable.taskId, taskId))
            .orderBy(attackResultsTable.createdAt);
        } catch (error: any) {
          const code = error?.cause?.code || error?.code;
          if (code === 'ER_NO_SUCH_TABLE') {
            logger.warn(
              'attack_results table not found, continuing with empty results for reports',
            );
            results = [];
          } else {
            throw error;
          }
        }
      }

      let taskType: { code: string; name: string } | null = null;
      if (getDbType() === 'mysql' && (task as { taskTypeId?: string | null }).taskTypeId) {
        try {
          const { taskTypesTable } = require('../database/tables-mysql');
          const [row] = await db
            .select({ code: taskTypesTable.code, name: taskTypesTable.name })
            .from(taskTypesTable)
            .where(eq(taskTypesTable.id, (task as { taskTypeId: string }).taskTypeId))
            .limit(1);
          if (row) {
            taskType = row;
          }
        } catch (e: unknown) {
          logger.warn('Could not load task_types for report', {
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return {
        task,
        results,
        taskType,
        resultsSource,
      };
    } catch (error) {
      logger.error(`Get task data error for ${taskId}: ${errorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Prepare report data
   */
  private async prepareReportData(taskData: any): Promise<ReportData> {
    const { task, results, taskType, resultsSource } = taskData as {
      task: {
        id: string;
        organizationId: string;
        name?: string;
        description?: string;
        targetType?: string;
        targetConfig?: Record<string, unknown> | null;
        attackMode?: string;
        createdAt?: Date | string;
        updatedAt?: Date | string;
        metadata?: unknown;
        vulnerabilities?: unknown;
      };
      results: any[];
      taskType: { code: string; name: string } | null;
      resultsSource?: 'finding_records' | 'attack_results';
    };
    const rawMeta = task.metadata as Record<string, unknown> | null | undefined;
    const taskKind = rawMeta?.taskKind as
      | 'api_test'
      | 'config_audit'
      | 'config_static'
      | 'single_test'
      | undefined;
    const vulnerabilities = await loadVulnerabilitiesForReportTask(task);
    const vulnerabilityNameById = new Map<string, string>();
    for (const vuln of vulnerabilities) {
      vulnerabilityNameById.set(vuln.id, vuln.name);
    }

    let organizationName: string | undefined;
    try {
      const { organizationsTable } = getTables() as ReturnType<typeof getTables> & {
        organizationsTable?: any;
      };
      if (organizationsTable) {
        const [orgRow] = await db
          .select({ name: organizationsTable.name })
          .from(organizationsTable)
          .where(eq(organizationsTable.id, task.organizationId))
          .limit(1);
        if (orgRow?.name) {
          organizationName = String(orgRow.name);
        }
      }
    } catch (e: unknown) {
      logger.warn('Failed to load organization name for report data', {
        message: e instanceof Error ? e.message : String(e),
        organizationId: task.organizationId,
      });
    }

    let targetDisplayType = task.targetType;
    let targetName: string | undefined;
    if (task.targetType === 'agent') {
      const targetCfg =
        task.targetConfig && typeof task.targetConfig === 'object' ? task.targetConfig : {};
      const agentId =
        typeof (targetCfg as { agentId?: unknown }).agentId === 'string'
          ? (targetCfg as { agentId: string }).agentId
          : undefined;
      targetName =
        typeof (targetCfg as { agentName?: unknown }).agentName === 'string'
          ? String((targetCfg as { agentName?: string }).agentName).trim()
          : undefined;
      let agentType: string | undefined =
        typeof (targetCfg as { agentType?: unknown }).agentType === 'string'
          ? String((targetCfg as { agentType?: string }).agentType)
          : typeof (targetCfg as { type?: unknown }).type === 'string'
            ? String((targetCfg as { type?: string }).type)
            : undefined;
      if (!agentType && agentId) {
        try {
          const { targetAgentsTable } = getTables() as ReturnType<typeof getTables> & {
            targetAgentsTable?: any;
          };
          if (targetAgentsTable) {
            const [agentRow] = await db
              .select({
                type: targetAgentsTable.type,
                name: targetAgentsTable.name,
              })
              .from(targetAgentsTable)
              .where(eq(targetAgentsTable.id, agentId))
              .limit(1);
            if (agentRow?.type) {
              agentType = String(agentRow.type);
            }
            if (!targetName && agentRow?.name) {
              targetName = String(agentRow.name).trim();
            }
          }
        } catch (e: unknown) {
          logger.warn('Failed to load target agent type for report data', {
            message: e instanceof Error ? e.message : String(e),
            agentId,
          });
        }
      }
      if (agentType && agentType.trim() !== '') {
        targetDisplayType = agentType;
      }
    }
    if (!targetName) {
      targetName = task.name;
    }

    const commandTextById = new Map<string, string>();
    const commandTextByVulnerabilityId = new Map<string, string>();
    const expectedSuccessByCommandId = new Map<string, string>();
    const nonVulnerabilityByCommandId = new Map<string, string>();
    const expectedSuccessByVulnerabilityId = new Map<string, string>();
    const nonVulnerabilityByVulnerabilityId = new Map<string, string>();
    const commandIds = Array.from(
      new Set(
        (results as any[])
          .map((r) => String(r?.commandId ?? '').trim())
          .filter((id) => id && !id.startsWith('finding_record:')),
      ),
    );
    try {
      const { attackCommandsTable } = getTables() as ReturnType<typeof getTables> & {
        attackCommandsTable?: any;
      };
      if (attackCommandsTable) {
        if (commandIds.length > 0) {
          const rows = await db
            .select({
              id: attackCommandsTable.id,
              vulnerabilityId: attackCommandsTable.vulnerabilityId,
              name: attackCommandsTable.name,
              content: attackCommandsTable.content,
              expectedSuccess: attackCommandsTable.expectedSuccess,
              nonVulnerability: attackCommandsTable.nonVulnerability,
            })
            .from(attackCommandsTable)
            .where(inArray(attackCommandsTable.id, commandIds));
          for (const row of rows) {
            const text = String(row.content ?? '').trim();
            const cmdName = String(row.name ?? '').trim();
            if (text) {
              commandTextById.set(String(row.id), text);
              if (
                row.vulnerabilityId &&
                !commandTextByVulnerabilityId.has(String(row.vulnerabilityId))
              ) {
                commandTextByVulnerabilityId.set(String(row.vulnerabilityId), text);
              }
            } else if (cmdName) {
              commandTextById.set(String(row.id), cmdName);
              if (
                row.vulnerabilityId &&
                !commandTextByVulnerabilityId.has(String(row.vulnerabilityId))
              ) {
                commandTextByVulnerabilityId.set(String(row.vulnerabilityId), cmdName);
              }
            }
            const exp = String(row.expectedSuccess ?? '').trim();
            if (exp) {
              expectedSuccessByCommandId.set(String(row.id), exp);
              if (
                row.vulnerabilityId &&
                !expectedSuccessByVulnerabilityId.has(String(row.vulnerabilityId))
              ) {
                expectedSuccessByVulnerabilityId.set(String(row.vulnerabilityId), exp);
              }
            }
            const nonV = String(row.nonVulnerability ?? '').trim();
            if (nonV) {
              nonVulnerabilityByCommandId.set(String(row.id), nonV);
              if (
                row.vulnerabilityId &&
                !nonVulnerabilityByVulnerabilityId.has(String(row.vulnerabilityId))
              ) {
                nonVulnerabilityByVulnerabilityId.set(String(row.vulnerabilityId), nonV);
              }
            }
          }
        }

        const vulnerabilityIds = Array.from(
          new Set((results as any[]).map((r) => String(r?.vulnerabilityId ?? '')).filter(Boolean)),
        );
        if (vulnerabilityIds.length > 0) {
          const vulnRows = await db
            .select({
              vulnerabilityId: attackCommandsTable.vulnerabilityId,
              name: attackCommandsTable.name,
              content: attackCommandsTable.content,
              expectedSuccess: attackCommandsTable.expectedSuccess,
              nonVulnerability: attackCommandsTable.nonVulnerability,
            })
            .from(attackCommandsTable)
            .where(inArray(attackCommandsTable.vulnerabilityId, vulnerabilityIds));
          for (const row of vulnRows) {
            const vid = String(row.vulnerabilityId ?? '');
            if (!vid || commandTextByVulnerabilityId.has(vid)) {
              continue;
            }
            const text = String(row.content ?? '').trim();
            const cmdName = String(row.name ?? '').trim();
            if (text) {
              commandTextByVulnerabilityId.set(vid, text);
            } else if (cmdName) {
              commandTextByVulnerabilityId.set(vid, cmdName);
            }
            const exp = String(row.expectedSuccess ?? '').trim();
            if (exp && !expectedSuccessByVulnerabilityId.has(vid)) {
              expectedSuccessByVulnerabilityId.set(vid, exp);
            }
            const nonV = String(row.nonVulnerability ?? '').trim();
            if (nonV && !nonVulnerabilityByVulnerabilityId.has(vid)) {
              nonVulnerabilityByVulnerabilityId.set(vid, nonV);
            }
          }
        }
      }
    } catch (e: unknown) {
      logger.warn('Failed to load command text for report data', {
        message: e instanceof Error ? e.message : String(e),
        commandCount: commandIds.length,
      });
    }

    const resultIdsFromFindings = Array.from(
      new Set(
        (results as any[])
          .flatMap((r) => {
            const ids =
              r?.request &&
              typeof r.request === 'object' &&
              Array.isArray((r.request as { sourceResultIds?: unknown[] }).sourceResultIds)
                ? ((r.request as { sourceResultIds?: unknown[] }).sourceResultIds as unknown[])
                : [];
            return ids.map((id) => String(id)).filter(Boolean);
          })
          .filter(Boolean),
      ),
    );
    const commandIdBySourceResultId = new Map<string, string>();
    if (resultIdsFromFindings.length > 0) {
      try {
        const { attackResultsTable } = getTables() as ReturnType<typeof getTables> & {
          attackResultsTable?: any;
        };
        if (attackResultsTable) {
          const sourceRows = await db
            .select({
              id: attackResultsTable.id,
              commandId: attackResultsTable.commandId,
            })
            .from(attackResultsTable)
            .where(inArray(attackResultsTable.id, resultIdsFromFindings));
          for (const row of sourceRows) {
            const rid = String(row.id ?? '');
            const cid = String(row.commandId ?? '');
            if (rid && cid) {
              commandIdBySourceResultId.set(rid, cid);
            }
          }
        }
      } catch (e: unknown) {
        logger.warn('Failed to resolve source result command IDs for report data', {
          message: e instanceof Error ? e.message : String(e),
          sourceResultCount: resultIdsFromFindings.length,
        });
      }
    }

    // Group results by vulnerability
    const vulnerabilityResults = new Map();

    for (const result of results) {
      if (!vulnerabilityResults.has(result.vulnerabilityId)) {
        vulnerabilityResults.set(result.vulnerabilityId, []);
      }
      vulnerabilityResults.get(result.vulnerabilityId).push(result);
    }

    // Calculate summary
    const summary: ReportData['summary'] = {
      totalVulnerabilities: vulnerabilityResults.size,
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0,
      executionTime: 0,
      completedAt: new Date().toISOString(),
      totalFindings: results.length,
      vulnerableFindings: 0,
    };

    let earliestCreatedAt: Date | undefined;
    let latestCreatedAt: Date | undefined;
    let vulnerableFindings = 0;

    for (const r of results as any[]) {
      if (r?.createdAt) {
        const created = new Date(r.createdAt);
        if (!Number.isNaN(created.getTime())) {
          if (!earliestCreatedAt || created < earliestCreatedAt) {
            earliestCreatedAt = created;
          }
          if (!latestCreatedAt || created > latestCreatedAt) {
            latestCreatedAt = created;
          }
        }
      }
      const verdict = r?.finalVerdict;
      if (verdict && typeof verdict === 'object') {
        const v = (verdict as any).vulnerable;
        if (v === true || String(v).toLowerCase() === 'true') {
          vulnerableFindings += 1;
        }
      }
    }

    if (earliestCreatedAt && latestCreatedAt) {
      summary.completedAt = latestCreatedAt.toISOString();
      summary.testStart = earliestCreatedAt.toISOString();
      summary.testEnd = latestCreatedAt.toISOString();
    }
    summary.vulnerableFindings = vulnerableFindings;

    /**
     * 执行耗时：优先各 API 回合 `response.durationMs` 之和（真实请求耗时），再 runLogs / DB；
     * 避免用「首条与末条 attack_result / finding 的 createdAt 差」当耗时 —— 易把分批落库、跨天合并、任务挂起算成数十分钟～数小时。
     */
    let executionMs = sumAttackResultResponseDurationMs(results as any[]);
    if (executionMs <= 0) {
      executionMs = await sumDurationMsFromAttackResultsDb(task.id);
    }
    if (executionMs <= 0) {
      executionMs = sumDurationMsFromTaskRunLogs(rawMeta);
    }
    if (executionMs <= 0 && earliestCreatedAt && latestCreatedAt) {
      const span = Math.max(0, latestCreatedAt.getTime() - earliestCreatedAt.getTime());
      if (getDbType() === 'mysql' && resultsSource === 'finding_records') {
        const t0 = coerceEpochMs(task.createdAt);
        const t1 = coerceEpochMs(task.updatedAt);
        if (t0 != null && t1 != null && t1 >= t0) {
          executionMs = t1 - t0;
        } else {
          executionMs = span;
        }
      } else {
        executionMs = span;
      }
    }
    if (executionMs <= 0) {
      const fromLogSpan = elapsedMsFromRunLogTimestamps(rawMeta);
      if (fromLogSpan > 0) {
        executionMs = fromLogSpan;
      } else {
        const t0 = coerceEpochMs(task.createdAt);
        const t1 = coerceEpochMs(task.updatedAt);
        if (t0 != null && t1 != null && t1 >= t0) {
          executionMs = t1 - t0;
        }
      }
    }
    summary.executionTime = executionMs;

    // Count risk levels (simplified)
    for (const [, vulnResults] of vulnerabilityResults) {
      const lastResult = vulnResults[vulnResults.length - 1];
      const riskLevel = lastResult.finalVerdict?.riskLevel || 'low';

      switch (riskLevel) {
        case 'critical':
        case 'high':
          summary.highRiskCount++;
          break;
        case 'medium':
          summary.mediumRiskCount++;
          break;
        default:
          summary.lowRiskCount++;
      }
    }

    const src: ReportData['resultsSource'] =
      getDbType() === 'mysql' ? (resultsSource ?? 'attack_results') : undefined;
    const retestComparison = buildRetestComparisonFromResults(
      results as Array<Record<string, unknown>>,
    );

    const createdAtStr =
      task.createdAt instanceof Date
        ? task.createdAt.toISOString()
        : typeof task.createdAt === 'string'
          ? task.createdAt
          : '';

    const rawPlatformFamily = (task as Record<string, unknown>)['platformFamily'];
    const platformFamily =
      typeof rawPlatformFamily === 'string' ? rawPlatformFamily.trim() || null : null;

    return {
      taskId: task.id,
      organizationId: task.organizationId,
      organizationName,
      resultsSource: src,
      taskTypeCode: taskType?.code,
      taskTypeName: taskType?.name,
      platformFamily,
      taskKind,
      taskMetadata: rawMeta ?? undefined,
      taskName: task.name,
      taskDescription: task.description,
      targetName,
      targetType: task.targetType,
      targetDisplayType,
      attackMode: task.attackMode,
      createdAt: createdAtStr,
      vulnerabilities,
      results: results.map((r: any) => {
        const row = {
          vulnerabilityId: r.vulnerabilityId,
          vulnerabilityName: vulnerabilityNameById.get(String(r.vulnerabilityId)),
          commandId: r.commandId,
          verificationCommand:
            commandTextById.get(String(r.commandId ?? '')) ||
            (() => {
              const ids =
                r?.request &&
                typeof r.request === 'object' &&
                Array.isArray((r.request as { sourceResultIds?: unknown[] }).sourceResultIds)
                  ? ((r.request as { sourceResultIds?: unknown[] }).sourceResultIds as unknown[])
                  : [];
              for (const srcId of ids) {
                const resolvedCmdId = commandIdBySourceResultId.get(String(srcId));
                if (resolvedCmdId) {
                  const txt = commandTextById.get(resolvedCmdId);
                  if (txt) {
                    return txt;
                  }
                }
              }
              return undefined;
            })() ||
            commandTextByVulnerabilityId.get(String(r.vulnerabilityId ?? '')),
          expectedSuccess:
            expectedSuccessByCommandId.get(String(r.commandId ?? '')) ||
            expectedSuccessByVulnerabilityId.get(String(r.vulnerabilityId ?? '')),
          nonVulnerability:
            nonVulnerabilityByCommandId.get(String(r.commandId ?? '')) ||
            nonVulnerabilityByVulnerabilityId.get(String(r.vulnerabilityId ?? '')),
          attackMode: r.attackMode,
          request: r.request,
          response: r.response,
          detectionResults: r.detectionResults,
          finalVerdict: r.finalVerdict,
          createdAt: r.createdAt,
        };
        return taskKind === 'single_test'
          ? enrichSingleTestReportResult(row, rawMeta ?? undefined)
          : row;
      }),
      summary,
      retestComparison,
    };
  }

  /**
   * Get report template
   */
  private async getReportTemplate(templateId: string) {
    try {
      const { reportTemplatesTable } = getTables();
      const [template] = await db
        .select()
        .from(reportTemplatesTable)
        .where(eq(reportTemplatesTable.id, templateId))
        .limit(1);

      return template || null;
    } catch (error) {
      logger.error(`Get report template error for ${templateId}: ${errorMessage(error)}`);
      return null;
    }
  }

  /**
   * Get default template (first enabled DB row, else inline fallback without id)
   */
  private async getDefaultTemplate() {
    try {
      const { reportTemplatesTable } = getTables();
      const [row] = await db
        .select()
        .from(reportTemplatesTable)
        .where(eq(reportTemplatesTable.enabled, true))
        .orderBy(asc(reportTemplatesTable.name))
        .limit(1);
      if (row) {
        return row;
      }
    } catch {
      // ignore
    }
    return {
      name: 'default',
      htmlTemplate: '<html><body>{{content}}</body></html>',
      styles: 'body { font-family: Arial, sans-serif; }',
    };
  }
}

export const reportService = new ReportService();
