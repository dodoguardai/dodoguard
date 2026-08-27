/**
 * Audit module types — shared by factory, registry, and modules.
 */

export type AuditType = 'dify-config' | string;

export interface AuditHistoryItem<T = unknown> {
  id: string;
  type: AuditType;
  result: T;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditHistoryStorage<T = unknown> {
  save(item: Omit<AuditHistoryItem<T>, 'id' | 'type' | 'createdAt'>): void;
  list(): AuditHistoryItem<T>[];
  getById(id: string): AuditHistoryItem<T> | null;
  remove(id: string): boolean;
  clear(): void;
}

export interface AuditModuleConfig<TInput = unknown, TResult = unknown> {
  type: AuditType;
  label: string;
  historyLabel?: string;
  routePath: string;
  analyze: (input: TInput) => Promise<TResult>;
  storage?: { maxItems?: number; key?: string };
}

export interface AuditModule<TInput = unknown, TResult = unknown> {
  type: AuditType;
  label: string;
  historyLabel: string;
  routePath: string;
  analyze: (input: TInput) => Promise<TResult>;
  storage: AuditHistoryStorage<TResult>;
}
