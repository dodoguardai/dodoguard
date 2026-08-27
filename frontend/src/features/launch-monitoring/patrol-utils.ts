import { formatPatrolNextRunLabel } from './patrol-schedule-client';
import type { AgentAsset, SecurityScanFinding, SecurityScanTask } from '@/types/entities';

export type PatrolPlan = {
  enabled?: boolean;
  frequency?: string;
  frequencyLabel?: string;
  firstRunAt?: string;
  runAtTime?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  scope?: string;
  scopeLabel?: string;
  failurePolicy?: string;
  failurePolicyLabel?: string;
  replayFailedCases?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function patrolPlanFromTask(task: SecurityScanTask): PatrolPlan {
  const metadataPlan = asRecord(task.metadata?.patrolPlan);
  const runConfigPlan = asRecord(task.runConfig?.patrolPlan);
  const plan = { ...runConfigPlan, ...metadataPlan };
  return {
    enabled: typeof plan.enabled === 'boolean' ? plan.enabled : true,
    frequency: typeof plan.frequency === 'string' ? plan.frequency : undefined,
    frequencyLabel: typeof plan.frequencyLabel === 'string' ? plan.frequencyLabel : undefined,
    firstRunAt: typeof plan.firstRunAt === 'string' ? plan.firstRunAt : undefined,
    runAtTime: typeof plan.runAtTime === 'string' ? plan.runAtTime : undefined,
    nextRunAt: typeof plan.nextRunAt === 'string' ? plan.nextRunAt : undefined,
    lastRunAt: typeof plan.lastRunAt === 'string' ? plan.lastRunAt : undefined,
    scope: typeof plan.scope === 'string' ? plan.scope : undefined,
    scopeLabel: typeof plan.scopeLabel === 'string' ? plan.scopeLabel : undefined,
    failurePolicy: typeof plan.failurePolicy === 'string' ? plan.failurePolicy : undefined,
    failurePolicyLabel:
      typeof plan.failurePolicyLabel === 'string' ? plan.failurePolicyLabel : undefined,
    replayFailedCases:
      typeof plan.replayFailedCases === 'boolean' ? plan.replayFailedCases : undefined,
  };
}

export function isPatrolTask(task: SecurityScanTask): boolean {
  if (task.source === 'risk_retest') {
    return false;
  }
  return (
    task.metadata?.isPatrolPlan === true ||
    task.scanType === '周期巡检' ||
    task.scanType === '周期检测' ||
    task.source === '定期巡检' ||
    task.targetKind === 'agent_patrol_plan'
  );
}

export function formatPatrolNextRun(plan: PatrolPlan): string {
  if (plan.nextRunAt) {
    return formatPatrolNextRunLabel(plan.nextRunAt);
  }
  if (!plan.firstRunAt && !plan.runAtTime) {
    return '未设置';
  }
  return [plan.firstRunAt, plan.runAtTime].filter(Boolean).join(' ');
}

export function isPatrolDueToday(plan: PatrolPlan): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (plan.nextRunAt) {
    return plan.nextRunAt.slice(0, 10) === today;
  }
  return plan.firstRunAt === today;
}

export type PatrolRow = {
  task: SecurityScanTask;
  plan: PatrolPlan;
  asset?: AgentAsset;
  openFindings: SecurityScanFinding[];
  totalRisk: number;
};

export function mapPatrolStatus(task: SecurityScanTask): string {
  if (task.status === 'running') {
    return '检测中';
  }
  if (task.status === 'completed') {
    return '已完成';
  }
  if (task.status === 'pending') {
    return '待执行';
  }
  return task.status;
}

export function mapPatrolStatusFilter(task: SecurityScanTask, chip: string): boolean {
  if (!chip) {
    return true;
  }
  const label = mapPatrolStatus(task);
  return label === chip;
}
