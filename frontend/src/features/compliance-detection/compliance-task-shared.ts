import type { SecurityScanTask } from '@/types/entities';

export type ComplianceScanStatus =
  | 'pending'
  | 'running'
  | 'reviewing'
  | 'completed'
  | 'blocked'
  | 'canceled';

export type ComplianceTaskRow = {
  id: string;
  name: string;
  asset: string;
  assetCode: string;
  assetVersion?: string | null;
  source: string;
  target: string;
  domain: string;
  status: ComplianceScanStatus;
  progress: number;
  high: number;
  medium: number;
  low: number;
  owner: string;
  createdAt: string;
  raw: SecurityScanTask;
};

export const complianceScanStatusText: Record<ComplianceScanStatus, string> = {
  pending: '待执行',
  running: '检测中',
  reviewing: '复核中',
  completed: '已完成',
  blocked: '已阻塞',
  canceled: '已取消',
};

export const complianceScanStatusClass: Record<ComplianceScanStatus, string> = {
  pending: 'text-muted-foreground',
  running: 'border-blue-200 text-blue-700',
  reviewing: 'border-amber-200 text-amber-700',
  completed: 'border-emerald-200 text-emerald-700',
  blocked: 'border-red-200 text-red-700',
  canceled: 'text-muted-foreground',
};

export function readComplianceTaskDomain(task: SecurityScanTask): string {
  const metadata = task.metadata;
  if (metadata && typeof metadata.domain === 'string' && metadata.domain.trim()) {
    return metadata.domain;
  }
  return '通用合规';
}

export function readComplianceScanStatus(task: SecurityScanTask): ComplianceScanStatus {
  const value = task.status as ComplianceScanStatus | string;
  if (value === 'reviewing') {
    return 'completed';
  }
  if (
    value === 'pending' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'blocked' ||
    value === 'canceled'
  ) {
    return value;
  }
  return 'pending';
}

export function mapComplianceTaskRow(task: SecurityScanTask): ComplianceTaskRow {
  return {
    id: task.id,
    name: task.name,
    asset: task.assetName || '未关联 Agent',
    assetCode: task.assetCode || '—',
    assetVersion: task.assetVersion,
    source: task.source,
    target: task.targetSummary || task.targetKind,
    domain: readComplianceTaskDomain(task),
    status: readComplianceScanStatus(task),
    progress: task.progress ?? 0,
    high: task.highCount ?? 0,
    medium: task.mediumCount ?? 0,
    low: task.lowCount ?? 0,
    owner: task.ownerName || '未指派',
    createdAt: task.createdAt,
    raw: task,
  };
}
