/**
 * Audit module registry — central registry for all audit types.
 */

import type { AuditModule } from './types';
import type { AuditType } from './types';

const modules = new Map<AuditType, AuditModule<unknown, unknown>>();

export function registerAuditModule<TInput, TResult>(module: AuditModule<TInput, TResult>): void {
  modules.set(module.type, module as AuditModule<unknown, unknown>);
}

export function getAuditModule(type: AuditType): AuditModule<unknown, unknown> | null {
  return modules.get(type) ?? null;
}

export function listAuditModules(): AuditModule<unknown, unknown>[] {
  return [...modules.values()];
}
