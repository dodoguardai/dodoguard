/**
 * History helpers — delete single item (extends audit-factory localStorage).
 */

const STORAGE_KEY = 'audit-history';

type StoredHistory = Record<string, Array<{ id: string }>>;

function loadAll(): StoredHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredHistory) : {};
  } catch {
    return {};
  }
}

function persist(all: StoredHistory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('[capability-audit] Failed to persist history:', e);
  }
}

/** Remove one history entry by audit type and id. */
export function deleteAuditHistoryItem(auditType: string, id: string): boolean {
  const all = loadAll();
  const items = all[auditType];
  if (!Array.isArray(items)) {
    return false;
  }
  const next = items.filter((i) => i.id !== id);
  if (next.length === items.length) {
    return false;
  }
  all[auditType] = next;
  persist(all);
  return true;
}
