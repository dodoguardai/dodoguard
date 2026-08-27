/**
 * Merge findings from multiple engines.
 */

import { buildRootCauseMergeKey } from '../../shared/finding-groups';
import { enrichFinding } from './finding-meta';

import type { CapabilityScanResult, EngineRunStatus, ScanSeverity, UnifiedFinding } from './types';

const SEV_RANK: Record<ScanSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const REQUIRED_ENGINES_BY_STRATEGY: Record<string, string[]> = {
  quick: ['skillspector', 'cisco_skill_scanner'],
  standard: ['skillspector', 'cisco_skill_scanner'],
  deep_offline: ['skillspector', 'cisco_skill_scanner'],
  online_enhanced: ['skillspector', 'cisco_skill_scanner'],
  llm_only: ['llm'],
  debug: [],
};

function findingKey(f: UnifiedFinding): string {
  const root = buildRootCauseMergeKey(f);
  if (root) {
    return root;
  }
  const loc = f.location.toLowerCase().trim();
  const issue = f.issue.toLowerCase().slice(0, 80);
  return `${loc}::${issue}`;
}

function mergeRootCauseFields(
  existing: UnifiedFinding,
  incoming: UnifiedFinding,
): Pick<UnifiedFinding, 'location' | 'evidence'> {
  const countMatch = existing.location.match(/\(\+(\d+)\s+locations?\)$/);
  const baseLocation = countMatch
    ? existing.location.replace(/\s+\(\+\d+\s+locations?\)$/, '')
    : existing.location;
  let locationCount = countMatch ? 1 + Number(countMatch[1]) : 1;
  if (!baseLocation.includes(incoming.location) && !incoming.location.includes(baseLocation)) {
    locationCount += 1;
  }
  const location =
    locationCount > 1 ? `${baseLocation} (+${locationCount - 1} locations)` : baseLocation;

  const evidenceLines = new Set(
    `${existing.evidence}\n${incoming.evidence}`
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
  return {
    location,
    evidence: [...evidenceLines].join('\n').slice(0, 800),
  };
}

export function mergeFindings(findings: UnifiedFinding[]): UnifiedFinding[] {
  const byKey = new Map<string, UnifiedFinding>();

  for (const f of findings) {
    const enriched = enrichFinding(f);
    const key = findingKey(enriched);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...enriched,
        sourceEngines: [...enriched.sourceEngines],
        ruleIds: enriched.ruleIds ? [...enriched.ruleIds] : undefined,
      });
      continue;
    }

    const mergedEngines = new Set([...existing.sourceEngines, ...enriched.sourceEngines]);
    const mergedRules = new Set([...(existing.ruleIds ?? []), ...(enriched.ruleIds ?? [])]);
    const severity =
      SEV_RANK[enriched.severity] > SEV_RANK[existing.severity]
        ? enriched.severity
        : existing.severity;
    const rootMerged = key.startsWith('root:') ? mergeRootCauseFields(existing, enriched) : {};

    byKey.set(
      key,
      enrichFinding({
        ...existing,
        severity,
        sourceEngines: [...mergedEngines],
        ruleIds: mergedRules.size > 0 ? [...mergedRules] : undefined,
        evidence: key.startsWith('root:')
          ? (rootMerged.evidence ?? existing.evidence)
          : existing.evidence.length >= enriched.evidence.length
            ? existing.evidence
            : enriched.evidence,
        location: key.startsWith('root:')
          ? (rootMerged.location ?? existing.location)
          : existing.location,
      }),
    );
  }

  return [...byKey.values()].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
}

export function buildIntegrityFindings(
  engineStatuses: EngineRunStatus[],
  strategy: string,
): UnifiedFinding[] {
  const required = REQUIRED_ENGINES_BY_STRATEGY[strategy] ?? ['skillspector'];
  const findings: UnifiedFinding[] = [];

  for (const engine of required) {
    const status = engineStatuses.find((s) => s.engine === engine);
    if (!status || status.status === 'success') {
      continue;
    }
    const label = status.status === 'skipped' ? '未执行' : '执行失败';
    findings.push(
      enrichFinding({
        severity: 'low',
        category: 'SCAN_INTEGRITY',
        riskType: 'scan_integrity_risk',
        dimension: 'code_quality',
        location: `engine:${engine}`,
        issue: `关键扫描引擎 ${engine} ${label}`,
        evidence: status.message ?? status.status,
        recommendation: '安装或修复该引擎后重新扫描；此项为扫描完整性提示，不计入包体安全风险',
        sourceEngines: ['scan_orchestrator'],
        ruleIds: ['SCAN-INTEGRITY-001'],
        confidence: 'high',
        suggestedAction: 'review',
        processingStatus: 'hint',
      }),
    );
  }

  return findings;
}

export function resolveScanStatus(
  findings: UnifiedFinding[],
  engineStatuses: EngineRunStatus[],
  hasArchiveThreat: boolean,
): CapabilityScanResult['status'] {
  if (hasArchiveThreat || findings.some((f) => f.category === 'ARCHIVE_SECURITY')) {
    return 'completed_with_high_risk';
  }
  const successCount = engineStatuses.filter((s) => s.status === 'success').length;
  const anyFailed = engineStatuses.some((s) => s.status === 'failed' || s.status === 'timeout');
  if (successCount === 0) {
    return 'partial_completed';
  }
  if (anyFailed || findings.some((f) => f.riskType === 'scan_integrity_risk')) {
    return 'partial_completed';
  }
  return 'completed';
}

export function overallRiskFromFindings(findings: UnifiedFinding[]): ScanSeverity {
  if (findings.some((f) => f.severity === 'critical')) {
    return 'critical';
  }
  if (findings.some((f) => f.severity === 'high')) {
    return 'high';
  }
  if (findings.some((f) => f.severity === 'medium')) {
    return 'medium';
  }
  return 'low';
}

export function buildSummary(
  findings: UnifiedFinding[],
  artifactKind: string,
  strategy: string,
): string {
  const risk = overallRiskFromFindings(findings);
  const crit = findings.filter((f) => f.severity === 'critical').length;
  const high = findings.filter((f) => f.severity === 'high').length;
  const medium = findings.filter((f) => f.severity === 'medium').length;
  const low = findings.filter((f) => f.severity === 'low').length;
  const kindLabel =
    artifactKind === 'mcp'
      ? 'MCP 源码包'
      : artifactKind === 'tool'
        ? '工具/插件包'
        : 'SKILLS 技能包';
  const riskLabel: Record<string, string> = {
    low: '低危',
    medium: '中危',
    high: '高危',
    critical: '严重',
  };
  const overall = riskLabel[risk] || risk;
  if (findings.length === 0) {
    return `已完成${kindLabel}安全扫描（策略：${strategy}），未发现需立即处置的正式风险，综合风险为${overall}。`;
  }
  const parts = [
    `已完成${kindLabel}安全扫描（策略：${strategy}），共识别 ${findings.length} 项发现，综合风险为${overall}。`,
  ];
  const breakdown: string[] = [];
  if (crit > 0) {
    breakdown.push(`严重 ${crit}`);
  }
  if (high > 0) {
    breakdown.push(`高危 ${high}`);
  }
  if (medium > 0) {
    breakdown.push(`中危 ${medium}`);
  }
  if (low > 0) {
    breakdown.push(`低危 ${low}`);
  }
  if (breakdown.length > 0) {
    parts.push(`其中：${breakdown.join('、')}。`);
  }
  return parts.join('');
}

export function defaultRecommendations(findings: UnifiedFinding[]): string[] {
  const recs = new Set<string>();
  for (const f of findings) {
    if (f.recommendation?.trim()) {
      recs.add(f.recommendation.trim());
    }
  }
  if (findings.some((f) => f.severity === 'critical' || f.severity === 'high')) {
    recs.add('优先修复严重/高危项后重新扫描确认。');
  }
  if (recs.size === 0) {
    recs.add('保持依赖与脚本来源可追溯，并定期复扫。');
  }
  return [...recs].slice(0, 12);
}

export function toLegacyAuditShape(result: CapabilityScanResult): {
  summary: string;
  overallRisk: ScanSeverity;
  findings: Array<{
    severity: ScanSeverity;
    category: string;
    location: string;
    issue: string;
    evidence: string;
    recommendation: string;
    dimension?: string;
    sourceFile?: string;
    sourceEngines?: string[];
    riskType?: string;
    suggestedAction?: string;
    llmAdjusted?: boolean;
    triageNote?: string;
    processingStatus?: string;
  }>;
  rawFindings?: Array<{
    severity: ScanSeverity;
    category: string;
    location: string;
    issue: string;
    evidence: string;
    recommendation: string;
    dimension?: string;
    sourceFile?: string;
    sourceEngines?: string[];
  }>;
  dispositionSummary?: CapabilityScanResult['dispositionSummary'];
  recommendations: string[];
  warnings?: string[];
  scannedFiles: { path: string }[];
  truncated?: boolean;
} {
  return {
    summary: result.summary,
    overallRisk: result.overallRisk,
    findings: result.findings.map((f) => ({
      severity: f.severity,
      category: f.category,
      location: f.location,
      issue: f.issue,
      evidence: f.evidence,
      recommendation: f.recommendation,
      dimension: f.dimension,
      sourceFile: f.sourceFile,
      sourceEngines: f.sourceEngines?.length ? [...f.sourceEngines] : undefined,
      riskType: f.riskType,
      suggestedAction: f.suggestedAction,
      llmAdjusted: f.llmAdjusted,
      triageNote: f.triageNote,
      processingStatus: f.processingStatus,
    })),
    rawFindings: result.rawFindings?.map((f) => ({
      severity: f.severity,
      category: f.category,
      location: f.location,
      issue: f.issue,
      evidence: f.evidence,
      recommendation: f.recommendation,
      dimension: f.dimension,
      sourceFile: f.sourceFile,
      sourceEngines: f.sourceEngines?.length ? [...f.sourceEngines] : undefined,
    })),
    dispositionSummary: result.dispositionSummary,
    recommendations: result.recommendations,
    warnings: result.warnings,
    scannedFiles: result.scannedFiles,
    truncated: result.truncated,
  };
}
