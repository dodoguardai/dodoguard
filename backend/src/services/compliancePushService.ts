import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../database';
import type { ComplianceCaseExecutionResult } from './complianceReportService';

export type CompliancePushStatus = 'pending' | 'pushed';

export type ComplianceRiskCounts = {
  high: number;
  medium: number;
  low: number;
};

function tables() {
  const module =
    getDbType() === 'mysql'
      ? require('../database/tables-mysql')
      : require('../database/tables-enterprise');
  return {
    scanFindings: module.securityScanFindingsTable,
    remediationTasks: module.securityRemediationTasksTable,
  };
}

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRiskLevel(level: unknown): string {
  const value = String(level || 'medium').toLowerCase();
  if (value === 'critical') {
    return 'critical';
  }
  if (value === 'high') {
    return 'high';
  }
  if (value === 'low') {
    return 'low';
  }
  return 'medium';
}

export function buildComplianceViolationNo(taskId: string, index: number): string {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const taskSuffix = taskId.replace(/-/g, '').slice(-6).toUpperCase();
  return `RSK-CMP-${y}${m}-${taskSuffix}-${String(index).padStart(2, '0')}`;
}

export function computeViolationRiskCounts(
  items: ComplianceCaseExecutionResult[],
): ComplianceRiskCounts {
  const violations = items.filter((item) => !item.passed && item.executionStatus !== 'skipped');
  return {
    high: violations.filter(
      (item) =>
        normalizeRiskLevel(item.riskLevel) === 'high' ||
        normalizeRiskLevel(item.riskLevel) === 'critical',
    ).length,
    medium: violations.filter((item) => normalizeRiskLevel(item.riskLevel) === 'medium').length,
    low: violations.filter((item) => {
      const level = normalizeRiskLevel(item.riskLevel);
      return level === 'low' || (!item.riskLevel && !item.passed);
    }).length,
  };
}

export function assignComplianceViolationNumbers(
  taskId: string,
  items: ComplianceCaseExecutionResult[],
): ComplianceCaseExecutionResult[] {
  let violationIndex = 0;
  return items.map((item) => {
    if (item.passed) {
      return item;
    }
    violationIndex += 1;
    return {
      ...item,
      violationNo: item.violationNo || buildComplianceViolationNo(taskId, violationIndex),
      pushStatus: item.pushStatus === 'pushed' ? 'pushed' : item.pushStatus || 'pending',
    };
  });
}

export function syncCompliancePushStatusFromFindings(
  items: ComplianceCaseExecutionResult[],
  findings: Array<Record<string, unknown>>,
): ComplianceCaseExecutionResult[] {
  const findingByCaseId = new Map<string, Record<string, unknown>>();
  for (const row of findings) {
    const evidence =
      row.evidence && typeof row.evidence === 'object' && row.evidence !== null
        ? (row.evidence as Record<string, unknown>)
        : {};
    const caseId = trimText(evidence.caseId) || trimText(evidence.caseCode);
    if (caseId) {
      findingByCaseId.set(caseId, row);
    }
  }

  return items.map((item) => {
    if (item.passed) {
      return item;
    }
    if (item.pushStatus === 'pushed' && item.remediationId) {
      return item;
    }
    const caseKey = item.caseId || item.caseCode;
    const finding = caseKey ? findingByCaseId.get(caseKey) : undefined;
    if (!finding) {
      return {
        ...item,
        pushStatus: item.pushStatus || 'pending',
      };
    }
    return {
      ...item,
      pushStatus: 'pushed',
      findingId: trimText(finding.id) || item.findingId,
      remediationId: trimText(finding.remediationTaskId) || item.remediationId,
    };
  });
}

export function selectComplianceItemsToPush(
  items: ComplianceCaseExecutionResult[],
  caseIds?: string[],
): ComplianceCaseExecutionResult[] {
  const idSet =
    caseIds && caseIds.length > 0 ? new Set(caseIds.map((id) => id.trim()).filter(Boolean)) : null;
  return items.filter((item) => {
    if (item.passed || item.pushStatus === 'pushed') {
      return false;
    }
    if (!idSet) {
      return true;
    }
    return idSet.has(item.caseId) || idSet.has(item.caseCode);
  });
}

export async function createScanFindingAndRemediation(params: {
  organizationId: string;
  userId: string | null;
  task: Record<string, unknown>;
  title: string;
  riskLevel: string;
  category: string;
  description: string;
  recommendation: string;
  evidence: Record<string, unknown>;
  remediationSource?: string;
}): Promise<{ findingId: string; remediationId: string }> {
  const { scanFindings, remediationTasks } = tables();
  const findingId = uuidv4();
  const remediationId = uuidv4();
  const due = new Date();
  const riskLevel = normalizeRiskLevel(params.riskLevel);
  due.setDate(due.getDate() + (riskLevel === 'critical' ? 3 : riskLevel === 'high' ? 7 : 14));

  await db.insert(scanFindings).values({
    id: findingId,
    organizationId: params.organizationId,
    taskId: params.task.id,
    assetId: params.task.assetId || null,
    assetVersion: params.task.assetVersion || null,
    assetSnapshotId: params.task.assetSnapshotId || null,
    componentVersions: params.task.componentVersions || [],
    caseLibraryId: trimText(params.evidence.libraryId) || null,
    testCaseId: trimText(params.evidence.caseId) || null,
    title: params.title,
    riskLevel,
    category: params.category,
    status: 'open',
    description: params.description,
    evidence: params.evidence,
    recommendation: params.recommendation,
    remediationTaskId: remediationId,
  });

  await db.insert(remediationTasks).values({
    id: remediationId,
    organizationId: params.organizationId,
    findingId,
    taskId: params.task.id,
    assetId: params.task.assetId || null,
    sourceAssetVersion: params.task.assetVersion || null,
    sourceSnapshotId: params.task.assetSnapshotId || null,
    title: `整改：${params.title}`,
    riskLevel,
    status: 'open',
    ownerName: params.task.ownerName || null,
    dueAt: due,
    remediationAdvice: params.recommendation,
    retestStatus: 'not_started',
    metadata: {
      source: params.remediationSource || 'scan_execution',
      category: params.category,
      violationNo: params.evidence.violationNo,
      needsConfirmation: false,
    },
    createdBy: params.userId,
    updatedBy: params.userId,
  });

  return { findingId, remediationId };
}

export async function createScanFinding(params: {
  organizationId: string;
  task: Record<string, unknown>;
  title: string;
  riskLevel: string;
  category: string;
  description: string;
  recommendation: string;
  evidence: Record<string, unknown>;
}): Promise<{ findingId: string }> {
  const { scanFindings } = tables();
  const findingId = uuidv4();
  const riskLevel = normalizeRiskLevel(params.riskLevel);

  await db.insert(scanFindings).values({
    id: findingId,
    organizationId: params.organizationId,
    taskId: params.task.id,
    assetId: params.task.assetId || null,
    assetVersion: params.task.assetVersion || null,
    assetSnapshotId: params.task.assetSnapshotId || null,
    componentVersions: params.task.componentVersions || [],
    caseLibraryId: trimText(params.evidence.libraryId) || null,
    testCaseId: trimText(params.evidence.caseId) || null,
    title: params.title,
    riskLevel,
    category: params.category,
    status: 'open',
    description: params.description,
    evidence: params.evidence,
    recommendation: params.recommendation,
  });

  return { findingId };
}

export async function createRemediationForScanFinding(params: {
  organizationId: string;
  userId: string | null;
  task: Record<string, unknown>;
  finding: Record<string, unknown>;
  remediationSource: string;
  violationNo?: string | null;
}): Promise<{ remediationId: string }> {
  const { scanFindings, remediationTasks } = tables();
  const existingRemediationId = trimText(params.finding.remediationTaskId);
  if (existingRemediationId) {
    return { remediationId: existingRemediationId };
  }

  const remediationId = uuidv4();
  const riskLevel = normalizeRiskLevel(params.finding.riskLevel);
  const due = new Date();
  due.setDate(due.getDate() + (riskLevel === 'critical' ? 3 : riskLevel === 'high' ? 7 : 14));
  const category = trimText(params.finding.category) || '技术安全检测';
  const recommendation =
    trimText(params.finding.recommendation) || '请根据发现项证据完成修复，并在整改后发起复测。';

  await db.insert(remediationTasks).values({
    id: remediationId,
    organizationId: params.organizationId,
    findingId: params.finding.id,
    taskId: params.task.id,
    assetId: params.task.assetId || params.finding.assetId || null,
    sourceAssetVersion: params.task.assetVersion || params.finding.assetVersion || null,
    sourceSnapshotId: params.task.assetSnapshotId || params.finding.assetSnapshotId || null,
    title: `整改：${trimText(params.finding.title) || '技术安全风险'}`,
    riskLevel,
    status: 'open',
    ownerName: params.task.ownerName || null,
    dueAt: due,
    remediationAdvice: recommendation,
    retestStatus: 'not_started',
    metadata: {
      source: params.remediationSource,
      category,
      violationNo: params.violationNo || null,
      needsConfirmation: false,
    },
    createdBy: params.userId,
    updatedBy: params.userId,
  });

  await db
    .update(scanFindings)
    .set({ remediationTaskId: remediationId, updatedAt: new Date() })
    .where(
      and(
        eq(scanFindings.organizationId, params.organizationId),
        eq(scanFindings.id, params.finding.id),
      ),
    );

  return { remediationId };
}

export function buildCompliancePushFindingPayload(
  _task: Record<string, unknown>,
  item: ComplianceCaseExecutionResult,
): {
  title: string;
  riskLevel: string;
  category: string;
  description: string;
  recommendation: string;
  evidence: Record<string, unknown>;
} {
  const title = `${item.caseName} 合规违规`;
  const description =
    item.judgmentRule ||
    item.violationSnippet ||
    `合规控制项 ${item.caseCode || item.caseId} 判定为违规。`;
  return {
    title,
    riskLevel: item.riskLevel || 'high',
    category: item.controlItem || item.libraryTitle || '合规检测',
    description,
    recommendation: item.recommendation || '请依据法规条款整改并安排复测。',
    evidence: {
      mode: 'compliance_push',
      source: 'compliance_execution_result',
      violationNo: item.violationNo,
      caseId: item.caseId,
      caseCode: item.caseCode,
      libraryId: item.libraryId,
      regClause: item.regClause,
      passed: false,
      input: item.inputSummary,
      prompt: item.inputSummary,
      expectedPass: undefined,
      expectedFail: item.violationSnippet,
      responsePreview: item.outputSnippet,
      violationSnippet: item.violationSnippet,
      judgeMode: item.judgeMode,
      pushedAt: new Date().toISOString(),
    },
  };
}

export async function pushComplianceViolations(params: {
  organizationId: string;
  userId: string | null;
  task: Record<string, unknown>;
  items: ComplianceCaseExecutionResult[];
  caseIds?: string[];
}): Promise<{ pushed: number; items: ComplianceCaseExecutionResult[] }> {
  const taskId = String(params.task.id || '');
  let items = assignComplianceViolationNumbers(taskId, params.items);
  const targets = selectComplianceItemsToPush(items, params.caseIds);
  if (targets.length === 0) {
    return { pushed: 0, items };
  }

  const pushedAt = new Date().toISOString();

  for (const target of targets) {
    const payload = buildCompliancePushFindingPayload(params.task, target);
    const { findingId, remediationId } = await createScanFindingAndRemediation({
      organizationId: params.organizationId,
      userId: params.userId,
      task: params.task,
      remediationSource: 'compliance_push',
      ...payload,
    });
    const targetKey = target.caseId || target.caseCode;
    items = items.map((item) => {
      const key = item.caseId || item.caseCode;
      if (!targetKey || key !== targetKey || item.passed || item.pushStatus === 'pushed') {
        return item;
      }
      return {
        ...item,
        pushStatus: 'pushed' as CompliancePushStatus,
        findingId,
        remediationId,
        pushedAt,
      };
    });
  }

  return { pushed: targets.length, items };
}

export async function loadComplianceFindingRows(
  organizationId: string,
  taskId: string,
): Promise<Array<Record<string, unknown>>> {
  const { scanFindings } = tables();
  return db
    .select()
    .from(scanFindings)
    .where(and(eq(scanFindings.organizationId, organizationId), eq(scanFindings.taskId, taskId)));
}
