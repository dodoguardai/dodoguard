/**
 * In-memory scan task store (MVP).
 * Replace with DB/Redis queue when merging with main platform.
 */

import type { CapabilityScanResult } from './types';

export type ScanTaskSyncMeta = {
  reportId?: string;
  scanTaskId?: string;
  remediationIds?: string[];
  registryId?: string;
  syncedFindings?: number;
};

export type ScanTaskRecord = {
  id: string;
  status:
    | 'queued'
    | 'running'
    | 'completed'
    | 'partial_completed'
    | 'completed_with_high_risk'
    | 'failed'
    | 'canceled';
  createdAt: string;
  updatedAt: string;
  fileName?: string;
  callbackUrl?: string;
  error?: string;
  result?: CapabilityScanResult;
  syncMeta?: ScanTaskSyncMeta;
};

const tasks = new Map<string, ScanTaskRecord>();
const MAX_TASKS = 200;

function prune(): void {
  if (tasks.size <= MAX_TASKS) {
    return;
  }
  const sorted = [...tasks.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const remove = sorted.slice(0, tasks.size - MAX_TASKS);
  for (const t of remove) {
    tasks.delete(t.id);
  }
}

export function createScanTask(
  id: string,
  fileName?: string,
  options: { callbackUrl?: string } = {},
): ScanTaskRecord {
  const now = new Date().toISOString();
  const record: ScanTaskRecord = {
    id,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    fileName,
    callbackUrl: options.callbackUrl,
  };
  tasks.set(id, record);
  prune();
  return record;
}

export function updateScanTask(
  id: string,
  patch: Partial<Pick<ScanTaskRecord, 'status' | 'error' | 'result' | 'syncMeta'>>,
): ScanTaskRecord | null {
  const prev = tasks.get(id);
  if (!prev) {
    return null;
  }
  const next: ScanTaskRecord = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  tasks.set(id, next);
  return next;
}

export function cancelScanTask(id: string): ScanTaskRecord | null {
  const prev = tasks.get(id);
  if (!prev) {
    return null;
  }
  if (!['queued', 'running'].includes(prev.status)) {
    return prev;
  }
  return updateScanTask(id, { status: 'canceled', error: 'Canceled by user' });
}

export function getScanTask(id: string): ScanTaskRecord | null {
  return tasks.get(id) ?? null;
}

export function listScanTasks(limit = 20): ScanTaskRecord[] {
  return [...tasks.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
