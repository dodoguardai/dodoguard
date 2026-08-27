import type { PeriodicPlanConfig } from './periodic-plan-config';

function parseRunAtTime(runAtTime?: string): { hours: number; minutes: number } {
  const value = (runAtTime || '02:00').trim();
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

export function computeInitialNextRunAtIso(config: PeriodicPlanConfig, now = new Date()): string {
  const baseDate = parseDateOnly(config.firstRunAt) ?? now;
  return applyRunAtTime(baseDate, config.runAtTime).toISOString();
}

export function computeNextRunAtAfterRunIso(config: PeriodicPlanConfig, from: Date): string {
  const base = applyRunAtTime(from, config.runAtTime);
  const next = new Date(base);
  switch (config.frequency) {
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
  return applyRunAtTime(next, config.runAtTime).toISOString();
}

export function formatPatrolNextRunLabel(value?: string): string {
  if (!value) {
    return '未设置';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
