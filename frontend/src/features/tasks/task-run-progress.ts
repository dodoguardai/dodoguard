import type { AttackTask, AttackTaskRunProgress } from '@/types/entities';

export function parseTaskRunProgress(
  meta: AttackTask['metadata'],
): AttackTaskRunProgress | undefined {
  if (!meta || typeof meta !== 'object') {
    return undefined;
  }
  const rp = (meta as Record<string, unknown>).runProgress;
  if (!rp || typeof rp !== 'object') {
    return undefined;
  }
  const o = rp as Record<string, unknown>;
  const completed = Number(o.completed);
  const total = Number(o.total);
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) {
    return undefined;
  }
  return {
    completed: Math.min(Math.max(0, completed), total),
    total,
    ...(typeof o.updatedAt === 'string' ? { updatedAt: o.updatedAt } : {}),
  };
}
