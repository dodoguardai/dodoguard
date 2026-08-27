/**
 * Production-oriented defaults and bounds for attack task execution parameters.
 * Keep in sync with frontend/src/features/tasks/execution-settings-limits.ts
 */

export const ATTACK_TASK_EXECUTION_LIMITS = {
  delayMs: { min: 0, max: 60_000, default: 200 },
  maxConcurrency: { min: 1, max: 5, default: 1 },
  timeoutMs: { min: 5_000, max: 300_000, default: 60_000 },
  maxRetries: { min: 0, max: 5, default: 2 },
  retryDelayMs: { min: 500, max: 30_000, default: 500 },
} as const;

export function clampExecutionInt(
  value: unknown,
  spec: { min: number; max: number; default: number },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return spec.default;
  }
  return Math.min(spec.max, Math.max(spec.min, Math.floor(value)));
}
