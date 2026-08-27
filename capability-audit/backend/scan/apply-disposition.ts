/**
 * Apply processing-status classification to scan findings.
 */

import {
  classifyProcessingStatus,
  countDispositionStats,
  type DispositionStats,
  type ProcessingStatus,
} from '../../shared/finding-disposition';
import { inferSkillAuditDimension } from '../../shared/dimension-inference';
import { adjudicateEnvReadFinding } from '../../shared/env-read-adjudication';
import { adjudicateRiskTypeFinding } from '../../shared/risk-type-adjudication';
import { enrichFinding } from './finding-meta';
import type { ScanSeverity, UnifiedFinding } from './types';

export type DispositionSummary = {
  stats: DispositionStats;
  summaryZh: string;
  summaryEn: string;
};

function applyEngineReportedDimension(f: UnifiedFinding): UnifiedFinding {
  return {
    ...f,
    dimension: inferSkillAuditDimension(f),
  };
}

export function applyFindingDisposition(findings: UnifiedFinding[]): UnifiedFinding[] {
  return findings.map((f) => {
    const envAdj = adjudicateEnvReadFinding(f);
    const riskAdj = envAdj ? null : adjudicateRiskTypeFinding(f);
    const adj = envAdj ?? riskAdj;
    const llmTriaged = f.sourceEngines.includes('llm_triage') && f.processingStatus != null;
    if (llmTriaged && !adj) {
      return enrichFinding(applyEngineReportedDimension(f));
    }

    const base = enrichFinding({
      ...applyEngineReportedDimension({
        ...f,
        ...(adj
          ? {
              severity: adj.severity,
              ...(adj.dimension ? { dimension: adj.dimension } : {}),
              ...(adj.riskType ? { riskType: adj.riskType } : {}),
              ...(adj.issue ? { issue: adj.issue } : {}),
              ...(adj.recommendation ? { recommendation: adj.recommendation } : {}),
            }
          : {}),
      }),
      // Trust secondary adjudication over weak-dimension re-inference
      ...(adj?.dimension ? { dimension: adj.dimension } : {}),
      ...(adj?.riskType ? { riskType: adj.riskType } : {}),
      ...(adj ? { severity: adj.severity } : {}),
      ...(adj?.issue ? { issue: adj.issue } : {}),
      ...(adj?.recommendation ? { recommendation: adj.recommendation } : {}),
    });
    const processingStatus = adj?.processingStatus ?? classifyProcessingStatus(base);
    return {
      ...base,
      processingStatus,
      triageNote: f.triageNote?.trim() || adj?.note,
    };
  });
}

export function overallRiskFromFormalFindings(findings: UnifiedFinding[]): ScanSeverity {
  const formal = findings.filter(
    (f) => f.processingStatus === 'confirmed' || f.processingStatus === 'suspected',
  );
  if (formal.some((f) => f.severity === 'critical')) {
    return 'critical';
  }
  if (formal.some((f) => f.severity === 'high')) {
    return 'high';
  }
  if (formal.some((f) => f.severity === 'medium')) {
    return 'medium';
  }
  if (formal.length === 0) {
    return 'low';
  }
  return 'low';
}

export function buildDispositionSummary(
  rawCount: number,
  findings: UnifiedFinding[],
): DispositionSummary {
  const stats = countDispositionStats(findings);
  const downgraded = stats.hint + stats.reference_sample + stats.false_positive;

  const summaryZh =
    rawCount > findings.length
      ? `复审后确认 ${stats.formalRiskCount} 类有效风险（确认 ${stats.confirmed} / 疑似 ${stats.suspected}），` +
        `${downgraded} 条原始命中降级为提示项或参考样例，证据已保留。`
      : `确认 ${stats.confirmed} 类确认风险、${stats.suspected} 类疑似风险；` +
        `${stats.hint} 条提示项、${stats.reference_sample} 条参考样例命中。`;

  const summaryEn =
    rawCount > findings.length
      ? `After review: ${stats.formalRiskCount} formal risk type(s) (confirmed ${stats.confirmed} / suspected ${stats.suspected}); ` +
        `${downgraded} raw hit(s) downgraded to hints or reference samples; evidence preserved.`
      : `${stats.confirmed} confirmed, ${stats.suspected} suspected; ` +
        `${stats.hint} hint(s), ${stats.reference_sample} reference sample hit(s).`;

  return { stats, summaryZh, summaryEn };
}

export type { ProcessingStatus };
