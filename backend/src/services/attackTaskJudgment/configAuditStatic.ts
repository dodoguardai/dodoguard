/**
 * Static whole-YAML LLM audit during config gray-box / config-static tasks (Dify, Coze, or FastGPT export).
 */

import logger from '../../logger';
import { analyzeCozeConfigYaml } from '../cozeConfigAuditService';
import { analyzeDifyConfigYaml } from '../difyConfigAuditService';
import { analyzeFastGptConfigJson } from '../fastgptConfigAuditService';
import { parseFastGptConfigExportText } from '../fastgptConfigStructure';
import { reportService } from '../reportService';

export type ConfigAuditStaticSummaryPayload = {
  summary?: string;
  overallRisk?: string;
  findings?: unknown[];
  recommendations?: unknown;
  warnings?: unknown;
  truncated?: boolean;
  reportId?: string;
  findingsCount: number;
};

export function buildConfigAuditStaticSummaryPayload(
  d: {
    summary?: string;
    overallRisk?: string;
    findings?: unknown[];
    recommendations?: unknown;
    warnings?: unknown;
    truncated?: boolean;
  },
  reportId?: string,
): ConfigAuditStaticSummaryPayload {
  return {
    summary: d.summary,
    overallRisk: d.overallRisk,
    findings: d.findings,
    recommendations: d.recommendations,
    warnings: d.warnings,
    truncated: d.truncated,
    reportId,
    findingsCount: Array.isArray(d.findings) ? d.findings.length : 0,
  };
}

/** Degraded summary so task-mode Coze reports do not show the empty-state placeholder. */
export function buildCozeDegradedConfigAuditStaticSummary(
  reason: string,
): ConfigAuditStaticSummaryPayload {
  const r = String(reason || 'unknown error').trim() || 'unknown error';
  const short = r.length > 600 ? `${r.slice(0, 600)}…` : r;
  return {
    summary: `Coze workflow static LLM audit did not complete successfully. ${short}`,
    overallRisk: 'low',
    findings: [],
    recommendations: [],
    warnings: [r.length > 1200 ? `${r.slice(0, 1200)}…` : r],
    findingsCount: 0,
  };
}

/** Degraded summary for task-mode FastGPT static audit failures (parity with Coze). */
export function buildFastGptDegradedConfigAuditStaticSummary(
  reason: string,
): ConfigAuditStaticSummaryPayload {
  const r = String(reason || 'unknown error').trim() || 'unknown error';
  const short = r.length > 600 ? `${r.slice(0, 600)}…` : r;
  return {
    summary: `FastGPT workflow static LLM audit did not complete successfully. ${short}`,
    overallRisk: 'low',
    findings: [],
    recommendations: [],
    warnings: [r.length > 1200 ? `${r.slice(0, 1200)}…` : r],
    findingsCount: 0,
  };
}

export async function runStaticDifyConfigAuditForTask(params: {
  organizationId: string | undefined | null;
  yamlText: string | undefined | null;
  fileName: string | undefined | null;
  provider?: { id: string; config?: Record<string, unknown> };
}): Promise<{ data: any; reportId?: string } | null> {
  const yaml = params.yamlText?.trim();
  if (!yaml) {
    return null;
  }

  try {
    const data = await analyzeDifyConfigYaml({
      yamlText: yaml,
      fileName: params.fileName || undefined,
      provider: params.provider,
    });

    let reportId: string | undefined;
    if (params.organizationId) {
      try {
        reportId = await reportService.createAuditReport(params.organizationId, data as any, {
          fileName: params.fileName || undefined,
          reportType: 'dify_config_audit',
        });
      } catch (reportErr: any) {
        logger.warn('[configAuditStatic] Failed to save audit report', {
          message: reportErr?.message,
        });
      }
    }

    return { data: { ...data, reportId }, reportId };
  } catch (e: any) {
    logger.error('[configAuditStatic] analyzeDifyConfigYaml failed', { message: e?.message });
    throw e;
  }
}

export async function runStaticCozeConfigAuditForTask(params: {
  organizationId: string | undefined | null;
  yamlText: string | undefined | null;
  fileName: string | undefined | null;
  provider?: { id: string; config?: Record<string, unknown> };
}): Promise<{ data: any; reportId?: string } | null> {
  const yaml = params.yamlText?.trim();
  if (!yaml) {
    return null;
  }

  try {
    const data = await analyzeCozeConfigYaml({
      yamlText: yaml,
      fileName: params.fileName || undefined,
      provider: params.provider,
    });

    let reportId: string | undefined;
    if (params.organizationId) {
      try {
        reportId = await reportService.createAuditReport(params.organizationId, data as any, {
          fileName: params.fileName || undefined,
          reportType: 'coze_config_audit',
        });
      } catch (reportErr: any) {
        logger.warn('[configAuditStatic] Failed to save Coze audit report', {
          message: reportErr?.message,
        });
      }
    }

    return { data: { ...data, reportId }, reportId };
  } catch (e: any) {
    logger.error('[configAuditStatic] analyzeCozeConfigYaml failed', { message: e?.message });
    throw e;
  }
}

export async function runStaticFastGptConfigAuditForTask(params: {
  organizationId: string | undefined | null;
  jsonText: string | undefined | null;
  fileName: string | undefined | null;
  provider?: { id: string; config?: Record<string, unknown> };
}): Promise<{ data: any; reportId?: string } | null> {
  const raw = params.jsonText?.trim();
  if (!raw) {
    return null;
  }

  try {
    // FastGPT stores task metadata under `configAudit.json`.
    // Normalize text into canonical JSON string so the audit parser
    // accepts both raw JSON export and YAML-wrapped object payloads.
    const normalizedJsonText = JSON.stringify(parseFastGptConfigExportText(raw));
    const data = await analyzeFastGptConfigJson({
      jsonText: normalizedJsonText,
      fileName: params.fileName || undefined,
      provider: params.provider,
    });

    let reportId: string | undefined;
    if (params.organizationId) {
      try {
        reportId = await reportService.createAuditReport(params.organizationId, data as any, {
          fileName: params.fileName || undefined,
          reportType: 'fastgpt_config_audit',
        });
      } catch (reportErr: any) {
        logger.warn('[configAuditStatic] Failed to save FastGPT audit report', {
          message: reportErr?.message,
        });
      }
    }

    return { data: { ...data, reportId }, reportId };
  } catch (e: any) {
    logger.error('[configAuditStatic] analyzeFastGptConfigJson failed', { message: e?.message });
    throw e;
  }
}
