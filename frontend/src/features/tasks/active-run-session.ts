/**
 * Short-lived browser flag so task detail / list polling can catch a brief `running` window
 * after POST /run returns (background worker may finish very quickly).
 */
const PREFIX = 'attack-task-active-run:';

export function markAttackTaskRunJustStarted(taskId: string): void {
  try {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    sessionStorage.setItem(`${PREFIX}${taskId}`, String(Date.now()));
  } catch {
    /* private mode / quota */
  }
}

export function clearAttackTaskActiveRunMark(taskId: string): void {
  try {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    sessionStorage.removeItem(`${PREFIX}${taskId}`);
  } catch {
    /* ignore */
  }
}

/** @returns age in ms if mark exists, else null */
export function getAttackTaskActiveRunMarkAgeMs(taskId: string): number | null {
  try {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    const raw = sessionStorage.getItem(`${PREFIX}${taskId}`);
    if (!raw) {
      return null;
    }
    const t = Number(raw);
    if (!Number.isFinite(t)) {
      return null;
    }
    return Date.now() - t;
  } catch {
    return null;
  }
}

export function shouldFastPollAfterRunStart(taskId: string, maxAgeMs = 45_000): boolean {
  const age = getAttackTaskActiveRunMarkAgeMs(taskId);
  return age !== null && age >= 0 && age < maxAgeMs;
}
