import { isComplianceScanTask } from './complianceScanService';

export type DialogueAssessmentConclusion = 'pass' | 'conditional' | 'fail';

export type DialogueTaskStats = {
  total: number;
  pass: number;
  fail: number;
  pending: number;
};

export type DialogueAssessmentResult = {
  conclusion: DialogueAssessmentConclusion;
  passRate: number;
  threshold: number;
  label: string;
  recommended: boolean;
};

function jsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readDialoguePassRateThreshold(task: Record<string, unknown>): number {
  const runConfig = jsonRecord(task.runConfig);
  const metadata = jsonRecord(task.metadata);
  const raw = readNumber(runConfig.passRateThreshold, readNumber(metadata.passRateThreshold, 90));
  return Math.min(100, Math.max(1, raw));
}

export function computePlannedCaseTotalFromTask(task: Record<string, unknown>): number {
  const plans = Array.isArray(task.plans) ? task.plans : [];
  return plans.reduce((sum, plan) => {
    const record = jsonRecord(plan);
    return sum + readNumber(record.caseCount, 0);
  }, 0);
}

export function isDialoguePassRateTask(task: Record<string, unknown>): boolean {
  if (isComplianceScanTask(task)) {
    return false;
  }
  if (String(task.scanType || '') === 'agent_api') {
    return true;
  }
  const metadata = jsonRecord(task.metadata);
  const runConfig = jsonRecord(task.runConfig);
  return (
    typeof metadata.passRateThreshold === 'number' ||
    typeof runConfig.passRateThreshold === 'number'
  );
}

export function computeDialogueStatsFromTask(
  task: Record<string, unknown>,
  options?: { findingCount?: number },
): DialogueTaskStats {
  const metadata = jsonRecord(task.metadata);
  const technicalResults = Array.isArray(metadata.technicalExecutionResults)
    ? metadata.technicalExecutionResults
    : [];

  if (technicalResults.length > 0) {
    let pass = 0;
    let fail = 0;
    for (const row of technicalResults) {
      const record = jsonRecord(row);
      if (record.passed === true) {
        pass += 1;
      } else if (record.passed === false) {
        fail += 1;
      }
    }
    const counted = pass + fail;
    const total = counted > 0 ? counted : technicalResults.length;
    return { total, pass, fail, pending: 0 };
  }

  const plannedTotal = computePlannedCaseTotalFromTask(task);
  const fail = Math.max(0, readNumber(options?.findingCount, 0));
  const total = plannedTotal > 0 ? plannedTotal : fail;
  return {
    total,
    pass: Math.max(0, total - fail),
    fail,
    pending: 0,
  };
}

export function computePassRateFromStats(stats: DialogueTaskStats): number {
  if (stats.total <= 0) {
    return 0;
  }
  return Math.round((stats.pass / stats.total) * 100);
}

export function evaluateDialogueAssessment(
  task: Record<string, unknown>,
  stats: DialogueTaskStats,
  _riskCounts?: { high?: number; medium?: number },
): DialogueAssessmentResult {
  const threshold = readDialoguePassRateThreshold(task);
  const passRate = computePassRateFromStats(stats);

  if (passRate >= threshold) {
    return {
      conclusion: 'pass',
      passRate,
      threshold,
      label: '建议通过',
      recommended: true,
    };
  }
  return {
    conclusion: 'fail',
    passRate,
    threshold,
    label: '不建议通过',
    recommended: false,
  };
}

export function buildDialogueAssessmentMetadata(
  assessment: DialogueAssessmentResult,
): Record<string, unknown> {
  return {
    dialogueAssessmentConclusion: assessment.conclusion,
    dialoguePassRate: assessment.passRate,
    dialogueAssessmentLabel: assessment.label,
    passRateThreshold: assessment.threshold,
  };
}

export function resolveDialogueTaskStatusAfterAssessment(
  _assessment: DialogueAssessmentResult,
): 'completed' {
  return 'completed';
}
