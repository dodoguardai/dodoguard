import { getAuditModule } from '@/features/audit/audit-registry';
import type { AuditHistoryItem } from '@/features/audit/types';
import {
  CAPABILITY_SCAN_META_KEY,
  parseCapabilityScanSnapshot,
  type CapabilityScanSnapshot,
} from 'capability-audit/shared/history-snapshot';
import type { SkillsMdAuditData } from '@/services/api/skills-md-audit';

export type CapabilityHistoryRecord = {
  id: string;
  auditType: string;
  result: SkillsMdAuditData & { reportId?: string };
  metadata: Record<string, unknown>;
  createdAt: string;
  scanSnapshot: CapabilityScanSnapshot | null;
};

export function loadCapabilityHistoryRecord(
  auditType: string,
  id: string,
): CapabilityHistoryRecord | null {
  const mod = getAuditModule(auditType);
  if (!mod?.storage) {
    return null;
  }
  const item = mod.storage.getById(id) as AuditHistoryItem<
    SkillsMdAuditData & { reportId?: string }
  > | null;
  if (!item) {
    return null;
  }
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  return {
    id: item.id,
    auditType,
    result: item.result,
    metadata,
    createdAt: item.createdAt,
    scanSnapshot: parseCapabilityScanSnapshot(metadata),
  };
}

export function capabilityHistoryMetadata(scanSnapshot: CapabilityScanSnapshot | null) {
  if (!scanSnapshot) {
    return {};
  }
  return { [CAPABILITY_SCAN_META_KEY]: scanSnapshot };
}
