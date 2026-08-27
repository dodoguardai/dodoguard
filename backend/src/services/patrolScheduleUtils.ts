export type PatrolFrequency = 'daily' | 'weekly' | 'monthly';

export type PatrolPlanSchedule = {
  frequency: PatrolFrequency;
  firstRunAt: string;
  runAtTime: string;
  enabled?: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunError?: string;
};

const DEFAULT_RUN_TIME = '02:00';

function parseRunAtTime(runAtTime?: string): { hours: number; minutes: number } {
  const value = (runAtTime || DEFAULT_RUN_TIME).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    return { hours: 2, minutes: 0 };
  }
  return {
    hours: Math.min(23, Math.max(0, Number.parseInt(match[1], 10))),
    minutes: Math.min(59, Math.max(0, Number.parseInt(match[2], 10))),
  };
}

function applyRunAtTime(date: Date, runAtTime?: string): Date {
  const { hours, minutes } = parseRunAtTime(runAtTime);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export function computeInitialNextRunAt(plan: PatrolPlanSchedule, now = new Date()): Date {
  if (plan.nextRunAt) {
    const parsed = new Date(plan.nextRunAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const baseDate = parseDateOnly(plan.firstRunAt) ?? now;
  return applyRunAtTime(baseDate, plan.runAtTime);
}

export function computeNextRunAtAfterRun(plan: PatrolPlanSchedule, from: Date): Date {
  const base = applyRunAtTime(from, plan.runAtTime);
  const next = new Date(base);

  switch (plan.frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      next.setDate(next.getDate() + 1);
      break;
  }

  return applyRunAtTime(next, plan.runAtTime);
}

export function resolvePatrolPlanSchedule(value: unknown): PatrolPlanSchedule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const frequency = record.frequency;
  const firstRunAt = record.firstRunAt;
  const runAtTime = record.runAtTime;
  if (
    (frequency !== 'daily' && frequency !== 'weekly' && frequency !== 'monthly') ||
    typeof firstRunAt !== 'string' ||
    typeof runAtTime !== 'string'
  ) {
    return null;
  }
  return {
    frequency,
    firstRunAt,
    runAtTime,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    nextRunAt: typeof record.nextRunAt === 'string' ? record.nextRunAt : undefined,
    lastRunAt: typeof record.lastRunAt === 'string' ? record.lastRunAt : undefined,
  };
}

export function isPatrolPlanDue(plan: PatrolPlanSchedule, now: Date): boolean {
  if (plan.enabled === false) {
    return false;
  }

  if (!plan.lastRunAt) {
    const baseDate = parseDateOnly(plan.firstRunAt);
    if (baseDate) {
      const firstScheduled = applyRunAtTime(baseDate, plan.runAtTime);
      if (firstScheduled.getTime() <= now.getTime()) {
        return true;
      }
    }
  }

  const nextRunAt = plan.nextRunAt ? new Date(plan.nextRunAt) : computeInitialNextRunAt(plan, now);
  if (Number.isNaN(nextRunAt.getTime())) {
    return false;
  }
  return nextRunAt.getTime() <= now.getTime();
}

export function formatPatrolPlanNextRunAt(date: Date): string {
  return date.toISOString();
}
