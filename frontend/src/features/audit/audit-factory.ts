/**
 * Audit module factory — creates AuditModule with localStorage-backed history.
 */

import type {
  AuditHistoryItem,
  AuditHistoryStorage,
  AuditModule,
  AuditModuleConfig,
} from './types';

const STORAGE_KEY = 'audit-history';

function createHistoryId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
      .slice(6, 8)
      .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }

  return `history-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function loadAll(): Record<string, AuditHistoryItem<unknown>[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AuditHistoryItem<unknown>[]>) : {};
  } catch {
    return {};
  }
}

function persist(all: Record<string, AuditHistoryItem<unknown>[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('[audit-factory] Failed to persist history:', e);
  }
}

function getItemsByType(type: string): AuditHistoryItem<unknown>[] {
  const all = loadAll();
  return Array.isArray(all[type]) ? all[type] : [];
}

function setItemsByType(type: string, items: AuditHistoryItem<unknown>[]): void {
  const all = loadAll();
  all[type] = items;
  persist(all);
}

export function createAuditModule<TInput, TResult>(
  config: AuditModuleConfig<TInput, TResult>,
): AuditModule<TInput, TResult> {
  const type = config.type;
  const maxItems = config.storage?.maxItems ?? 50;

  const storage: AuditHistoryStorage<TResult> = {
    save(item) {
      const full: AuditHistoryItem<TResult> = {
        ...item,
        id: createHistoryId(),
        type,
        createdAt: new Date().toISOString(),
      };
      const items = getItemsByType(type) as AuditHistoryItem<TResult>[];
      items.unshift(full);
      setItemsByType(type, items.slice(0, maxItems) as AuditHistoryItem<unknown>[]);
    },
    list() {
      const items = getItemsByType(type);
      return [...items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ) as AuditHistoryItem<TResult>[];
    },
    getById(id) {
      const found = getItemsByType(type).find((i) => i.id === id);
      return (found as AuditHistoryItem<TResult> | undefined) ?? null;
    },
    remove(id) {
      const items = getItemsByType(type);
      const next = items.filter((i) => i.id !== id);
      if (next.length === items.length) {
        return false;
      }
      setItemsByType(type, next);
      return true;
    },
    clear() {
      setItemsByType(type, []);
    },
  };

  return {
    type,
    label: config.label,
    historyLabel: config.historyLabel ?? `${config.label} History`,
    routePath: config.routePath,
    analyze: config.analyze,
    storage,
  };
}
