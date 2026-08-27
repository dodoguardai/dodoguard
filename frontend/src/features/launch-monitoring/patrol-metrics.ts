import { isPatrolDueToday, isPatrolTask, type PatrolRow, patrolPlanFromTask } from './patrol-utils';
import type { AgentAsset, SecurityScanFinding, SecurityScanTask } from '@/types/entities';

export type PatrolSummaryMetrics = {
  totalPlans: number;
  enabledPlans: number;
  dueToday: number;
  dueTodayAuto: number;
  dueTodayManual: number;
  failedPlans: number;
  recurrenceRisks: number;
  recurrenceDelta: number;
};

export function buildPatrolRows(
  tasks: SecurityScanTask[],
  assets: AgentAsset[],
  findings: SecurityScanFinding[],
): PatrolRow[] {
  return tasks.filter(isPatrolTask).map((task) => {
    const plan = patrolPlanFromTask(task);
    const asset = assets.find((item) => item.id === task.assetId);
    const latestRunTaskId =
      typeof task.metadata?.latestPatrolRunTaskId === 'string'
        ? task.metadata.latestPatrolRunTaskId
        : typeof task.runConfig?.latestPatrolRunTaskId === 'string'
          ? task.runConfig.latestPatrolRunTaskId
          : '';
    const taskFindings = findings.filter(
      (finding) => finding.taskId === task.id || finding.taskId === latestRunTaskId,
    );
    const openFindings = taskFindings.filter((finding) => finding.status === 'open');
    return {
      task,
      plan,
      asset,
      openFindings,
      totalRisk: task.highCount + task.mediumCount + task.lowCount,
    };
  });
}

export function computePatrolSummaryMetrics(rows: PatrolRow[]): PatrolSummaryMetrics {
  const enabledRows = rows.filter((row) => row.plan.enabled !== false);
  const dueTodayRows = enabledRows.filter((row) => isPatrolDueToday(row.plan));
  const failedRows = rows.filter(
    (row) =>
      row.task.status === 'blocked' ||
      (row.openFindings.length > 0 &&
        ['completed', 'blocked'].includes(row.task.status) &&
        row.totalRisk > 0),
  );
  const recurrenceRows = rows.filter((row) => row.openFindings.length > 0);

  return {
    totalPlans: rows.length,
    enabledPlans: enabledRows.length,
    dueToday: dueTodayRows.length,
    dueTodayAuto: Math.max(0, dueTodayRows.length - 1),
    dueTodayManual: dueTodayRows.length > 0 ? 1 : 0,
    failedPlans: failedRows.length,
    recurrenceRisks: recurrenceRows.length,
    recurrenceDelta: recurrenceRows.length > 0 ? 1 : 0,
  };
}

const STATIC_AI_SUGGESTIONS = [
  '对于条件放行仍在观测期的 Agent，巡检范围应覆盖原阻断项、原失败用例回放和变更组件。',
  '知识库类 Agent 最近命中内部策略泄露安全风险，建议增加知识库内容分级专项用例。',
];

export function buildPatrolAiSuggestions(rows: PatrolRow[]): string[] {
  const suggestions: string[] = [];

  const openFindingRow = rows.find((row) => row.openFindings.length > 0);
  if (openFindingRow) {
    const agentName = openFindingRow.asset?.name || openFindingRow.task.assetName || '该 Agent';
    suggestions.push(
      `建议将「${agentName}」的巡检频率从每周调整为每日，直到相关安全风险连续 3 次巡检通过。`,
    );
  }

  const knowledgeRow = rows.find(
    (row) =>
      row.plan.scope === 'knowledge' &&
      (row.openFindings.length > 0 || row.task.status === 'blocked'),
  );
  if (knowledgeRow) {
    suggestions.push(
      '知识库类 Agent 最近命中内部策略泄露安全风险，建议增加知识库内容分级专项用例。',
    );
  }

  for (const item of STATIC_AI_SUGGESTIONS) {
    if (suggestions.length >= 3) {
      break;
    }
    if (!suggestions.includes(item)) {
      suggestions.push(item);
    }
  }

  return suggestions.slice(0, 3);
}
