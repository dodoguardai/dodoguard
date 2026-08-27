import { resolveTestMethodLabel } from '@/features/technical-case-library/technical-case-test-methods';
import type { SecurityRetestRun } from '@/services/api/detection-scanning';
import type {
  DetectionRiskLevel,
  SecurityRemediationTask,
  SecurityScanFinding,
  SecurityScanTask,
} from '@/types/entities';

const ATTACK_TYPE_SLUGS = new Set([
  'direct',
  'multi_turn',
  'indirect',
  'file_input',
  'file_output',
  'prompt_injection',
]);

export type RiskClosedLoopTab = 'workbench' | 'retest' | 'closed';

export type ClosedSubTab = 'closed' | 'accepted' | 'retest_reports';

export type RetestScopeId = 'dialog' | 'component' | 'compliance';

export type RetestCaseRow = {
  key: string;
  riskId: string;
  riskTitle: string;
  id: string;
  name: string;
  type: string;
};

export type RetestCapabilityTarget = Record<string, unknown> & {
  kind: string;
  name: string;
};

export type RetestReportSummary = {
  id: string;
  taskId: string;
  taskName: string;
  agentName: string;
  title: string;
  createdAt: string;
  status: 'draft' | 'archived' | 'partial';
  riskCount: number;
  passedCount: number;
  failedCount: number;
  retestPlanId?: string;
  conclusion?: string;
};

export type RetestExecutionPhase = 'running' | 'awaiting_confirm' | 'confirmed';

export type RetestRunSummary = {
  batchId: string;
  reportId: string;
  retestScanTaskId?: string;
  time: string;
  pass: number;
  fail: number;
  pending: number;
  total: number;
  summary: string;
  progress: number;
  status: 'running' | 'awaiting_confirm' | 'completed' | 'partial';
};

export type RetestHistoryEntry = {
  planId: string;
  reportId: string;
  retestScanTaskId: string;
  executedAt: string;
  result: 'passed' | 'failed' | 'pending';
  snapshot?: RetestExecutionSnapshot;
};

export function isRetestActivelyRunning(row: EnrichedRiskRow): boolean {
  const meta = readMeta(row);
  if (meta.retestExecutionPhase === 'running') {
    return true;
  }
  if (
    meta.retestExecutionPhase === 'awaiting_confirm' ||
    meta.retestExecutionPhase === 'confirmed'
  ) {
    return false;
  }
  return row.status === 'retesting' && meta.pendingRetestConfirm !== true;
}

export function isRetestAwaitingConfirm(row: EnrichedRiskRow): boolean {
  const meta = readMeta(row);
  if (meta.pendingRetestConfirm !== true) {
    return false;
  }
  if (meta.retestExecutionPhase === 'awaiting_confirm') {
    return true;
  }
  return meta.retestExecutionPhase !== 'running' && meta.retestExecutionPhase !== 'confirmed';
}

export function resolveRetestProgress(row: EnrichedRiskRow, liveProgress?: number): number {
  if (liveProgress != null && isRetestActivelyRunning(row)) {
    return liveProgress;
  }
  const meta = readMeta(row);
  if (typeof meta.retestProgress === 'number') {
    return meta.retestProgress;
  }
  return isRetestAwaitingConfirm(row) ? 100 : 0;
}

export type LiveRetestProgress = {
  planId: string;
  taskId: string;
  retestTaskId?: string;
  progress: number;
  riskIds: string[];
};

export function applyLiveRetestBatch(
  rows: EnrichedRiskRow[],
  batch: LiveRetestProgress | null,
): EnrichedRiskRow[] {
  if (!batch) {
    return rows;
  }
  const idSet = new Set(batch.riskIds);
  return rows.map((row) => {
    if (!idSet.has(row.id)) {
      return row;
    }
    const currentMeta = readMeta(row);
    return {
      ...row,
      status: 'retesting',
      retestStatus: 'pending',
      displayStatus: 'pending_retest',
      metadata: {
        ...currentMeta,
        retestBatchId: batch.planId,
        // retestTaskId is the actual scan task id created for this batch
        retestTaskId: batch.retestTaskId ?? batch.planId,
        retestExecutionPhase: 'running',
        retestProgress: batch.progress,
        pendingRetestConfirm: false,
      },
    };
  });
}

export function resolveTaskGroupRetestState(
  group: Pick<TaskRiskGroup, 'taskId' | 'rows'>,
  liveRetestProgress?: LiveRetestProgress | null,
) {
  const runningRows = group.rows.filter(isRetestActivelyRunning);
  const awaitingConfirmRows = group.rows.filter(isRetestAwaitingConfirm);
  const liveOnTask =
    liveRetestProgress != null &&
    (liveRetestProgress.taskId === group.taskId ||
      group.rows.some((row) => liveRetestProgress.riskIds.includes(row.id)));
  const isRunning = runningRows.length > 0 || liveOnTask;
  const progress = liveOnTask
    ? liveRetestProgress.progress
    : runningRows.length > 0
      ? Math.max(...runningRows.map((row) => resolveRetestProgress(row)), 0)
      : 0;

  return {
    runningRows,
    awaitingConfirmRows,
    isRunning,
    progress,
  };
}

export type RiskListMode = 'flat' | 'task' | 'agent' | 'dept' | 'owner';

export type RiskViewMode = 'list' | 'board';

export type RiskDisplayStatus =
  | 'pending_confirm'
  | 'pending_fix'
  | 'in_progress'
  | 'pending_retest'
  | 'retest_failed'
  | 'closed'
  | 'risk_accepted';

export type EnrichedRiskRow = SecurityRemediationTask & {
  finding?: SecurityScanFinding;
  scanTask?: SecurityScanTask;
  displayStatus: RiskDisplayStatus;
  riskKind: 'compliance' | 'api' | 'component';
  agentName: string;
  department: string;
  violationNo?: string;
};

export const GOVERNANCE_STEPS = [
  '资产入库',
  '检测扫描',
  '安全放行',
  '风险闭环',
  '上线观测',
  '报告审计',
] as const;

export const LIST_MODE_LABELS: Array<[RiskListMode, string]> = [
  ['flat', '全部清单'],
  ['task', '任务视角'],
  ['agent', '按 Agent'],
];

export const DISPLAY_STATUS_LABEL: Record<RiskDisplayStatus, string> = {
  pending_confirm: '待确认',
  pending_fix: '待整改',
  in_progress: '整改中',
  pending_retest: '待复测',
  retest_failed: '复测失败',
  closed: '已关闭',
  risk_accepted: '风险接受',
};

export const DISPLAY_STATUS_CLASS: Record<RiskDisplayStatus, string> = {
  pending_confirm: 'border-amber-200 bg-amber-50 text-amber-800',
  pending_fix: 'border-orange-200 bg-orange-50 text-orange-800',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-800',
  pending_retest: 'border-violet-200 bg-violet-50 text-violet-800',
  retest_failed: 'border-red-200 bg-red-50 text-red-800',
  closed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  risk_accepted: 'border-slate-200 bg-slate-50 text-slate-700',
};

const CLOSED_STATUSES: RiskDisplayStatus[] = ['closed', 'risk_accepted'];

export function isClosedDisplayStatus(status: RiskDisplayStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

function readMeta(task: SecurityRemediationTask): Record<string, unknown> {
  return task.metadata && typeof task.metadata === 'object'
    ? (task.metadata as Record<string, unknown>)
    : {};
}

export function needsRiskConfirmation(_task: SecurityRemediationTask): boolean {
  return false;
}

export function resolveRiskKind(
  task: SecurityRemediationTask,
  finding?: SecurityScanFinding,
): EnrichedRiskRow['riskKind'] {
  const meta = readMeta(task);
  const evidence =
    finding?.evidence && typeof finding.evidence === 'object'
      ? (finding.evidence as Record<string, unknown>)
      : {};
  if (
    meta.source === 'compliance_push' ||
    evidence.mode === 'compliance_push' ||
    String(meta.violationNo || evidence.violationNo || '').startsWith('RSK-CMP')
  ) {
    return 'compliance';
  }
  if (
    meta.source === 'capability_audit_push' ||
    evidence.source === 'capability_risk_rule' ||
    evidence.source === 'capability_llm_review' ||
    evidence.mode === 'capability_audit' ||
    evidence.mode === 'llm_static_review' ||
    String(meta.violationNo || evidence.violationNo || '').startsWith('RSK-CAP')
  ) {
    return 'component';
  }
  const category = String(finding?.category || meta.category || '').toLowerCase();
  if (/mcp|skill|工具|知识库|组件|plugin|rag/.test(category)) {
    return 'component';
  }
  return 'api';
}

export function resolveDisplayStatus(task: SecurityRemediationTask): RiskDisplayStatus {
  if (task.status === 'closed') {
    return 'closed';
  }
  if (task.status === 'risk_accepted') {
    return 'risk_accepted';
  }
  if (needsRiskConfirmation(task)) {
    return 'pending_confirm';
  }
  if (task.status === 'reopened' || task.retestStatus === 'failed') {
    return 'retest_failed';
  }
  if (
    task.status === 'evidence_submitted' ||
    task.status === 'retesting' ||
    task.retestStatus === 'pending'
  ) {
    return 'pending_retest';
  }
  if (task.status === 'in_progress' || task.status === 'assigned') {
    return 'in_progress';
  }
  return 'pending_fix';
}

export function enrichRemediationRows(
  remediations: SecurityRemediationTask[],
  findings: SecurityScanFinding[],
  scanTasks: SecurityScanTask[],
): EnrichedRiskRow[] {
  const findingById = new Map(findings.map((f) => [f.id, f]));
  const taskById = new Map(scanTasks.map((t) => [t.id, t]));

  return remediations.map((row) => {
    const finding = findingById.get(row.findingId);
    const scanTask = taskById.get(row.taskId);
    const meta = readMeta(row);
    const evidence =
      finding?.evidence && typeof finding.evidence === 'object'
        ? (finding.evidence as Record<string, unknown>)
        : {};
    return {
      ...row,
      finding,
      scanTask,
      displayStatus: resolveDisplayStatus(row),
      riskKind: resolveRiskKind(row, finding),
      agentName:
        scanTask?.assetName ||
        (scanTask?.name && !/^[0-9a-f-]{36}$/i.test(scanTask.name) ? scanTask.name : null) ||
        '未关联 Agent',
      department:
        (typeof scanTask?.ownerName === 'string' && scanTask.ownerName) ||
        (typeof meta.department === 'string' && meta.department) ||
        '—',
      violationNo:
        (typeof meta.violationNo === 'string' && meta.violationNo) ||
        (typeof evidence.violationNo === 'string' && evidence.violationNo) ||
        undefined,
    };
  });
}

/** 风险闭环仅展示评估任务确认推送的真实整改项，排除技术扫描执行阶段自动生成的模拟数据。 */
export function isClosedLoopProductionRow(row: EnrichedRiskRow): boolean {
  const meta = readMeta(row);
  const evidence =
    row.finding?.evidence && typeof row.finding.evidence === 'object'
      ? (row.finding.evidence as Record<string, unknown>)
      : {};

  if (meta.source === 'scan_execution') {
    return false;
  }
  if (meta.seeded === true || evidence.seeded === true) {
    return false;
  }
  if (
    evidence.executionMode != null &&
    meta.source !== 'compliance_push' &&
    meta.source !== 'technical_push' &&
    meta.source !== 'capability_audit_push'
  ) {
    return false;
  }

  const taskMeta =
    row.scanTask?.metadata && typeof row.scanTask.metadata === 'object'
      ? (row.scanTask.metadata as Record<string, unknown>)
      : null;
  if (taskMeta?.seeded === true) {
    return false;
  }
  const runConfig =
    row.scanTask?.runConfig && typeof row.scanTask.runConfig === 'object'
      ? (row.scanTask.runConfig as Record<string, unknown>)
      : null;
  if (runConfig?.seeded === true) {
    return false;
  }

  if (
    meta.source === 'compliance_push' ||
    meta.source === 'technical_push' ||
    meta.source === 'capability_audit_push' ||
    evidence.mode === 'compliance_push' ||
    evidence.mode === 'capability_audit'
  ) {
    return true;
  }

  const violationNo =
    (typeof meta.violationNo === 'string' && meta.violationNo) ||
    (typeof evidence.violationNo === 'string' && evidence.violationNo) ||
    '';
  if (violationNo.startsWith('RSK-CMP') || violationNo.startsWith('RSK-CAP')) {
    return true;
  }

  if (meta.needsConfirmation === true || typeof meta.confirmedAt === 'string') {
    return true;
  }

  if (typeof evidence.pushedAt === 'string') {
    return true;
  }

  return false;
}

export function filterClosedLoopProductionRows(rows: EnrichedRiskRow[]): EnrichedRiskRow[] {
  return rows.filter(isClosedLoopProductionRow);
}

export function filterRiskRows(
  rows: EnrichedRiskRow[],
  options: {
    search?: string;
    includeClosed?: boolean;
    displayStatus?: RiskDisplayStatus | 'all';
    boardColumn?: 'pending_retest' | 'retest_failed' | 'closed';
  },
): EnrichedRiskRow[] {
  const q = (options.search || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (options.boardColumn) {
      if (options.boardColumn === 'closed') {
        return isClosedDisplayStatus(row.displayStatus);
      }
      return row.displayStatus === options.boardColumn;
    }
    if (!options.includeClosed && isClosedDisplayStatus(row.displayStatus)) {
      return false;
    }
    if (options.displayStatus && options.displayStatus !== 'all') {
      if (row.displayStatus !== options.displayStatus) {
        return false;
      }
    }
    if (!q) {
      return true;
    }
    const haystack = [
      row.id,
      row.title,
      row.findingId,
      row.taskId,
      row.agentName,
      row.department,
      row.ownerName,
      row.violationNo,
      row.finding?.title,
      row.finding?.category,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export type TaskRiskGroup = {
  taskId: string;
  taskName: string;
  scanType: string;
  scopeLabel: string;
  agentName: string;
  rows: EnrichedRiskRow[];
  openCount: number;
};

export function resolveGroupScopeLabel(group: Pick<TaskRiskGroup, 'scanType' | 'rows'>): string {
  const libraryLabels = [
    ...new Set(
      group.rows
        .map((row) => resolveRiskRowLibraryLabel(row))
        .filter((value) => value && value !== '—'),
    ),
  ];
  if (libraryLabels.length > 0) {
    return libraryLabels.length <= 3
      ? libraryLabels.join('、')
      : `${libraryLabels.slice(0, 2).join('、')} 等`;
  }

  const dimensions = new Set<string>();
  for (const row of group.rows) {
    if (row.riskKind === 'component') {
      dimensions.add('组件');
    } else if (row.riskKind === 'compliance') {
      dimensions.add('合规');
    } else {
      dimensions.add('对话/API');
    }
  }
  const dimensionText = [...dimensions].join('、');
  const scanTypeLabel = formatScanTypeLabel(group.scanType);
  if (scanTypeLabel && dimensionText) {
    return dimensionText;
  }
  return scanTypeLabel || dimensionText || '—';
}

function formatScanTypeLabel(scanType: string): string {
  if (!scanType || scanType === '—') {
    return '';
  }
  if (scanType === 'agent_api') {
    return '对话/API';
  }
  if (scanType.includes('合规')) {
    return '合规检测';
  }
  return scanType;
}

export function groupByTask(rows: EnrichedRiskRow[]): TaskRiskGroup[] {
  const map = new Map<string, TaskRiskGroup>();
  for (const row of rows) {
    const key = row.taskId || 'unlinked';
    const entry =
      map.get(key) ??
      ({
        taskId: key,
        taskName: formatTaskDisplayLabel(key, row.scanTask?.name || row.taskId || '未关联任务'),
        scanType: row.scanTask?.scanType || '—',
        scopeLabel: '—',
        agentName: row.agentName,
        rows: [],
        openCount: 0,
      } satisfies TaskRiskGroup);
    entry.rows.push(row);
    if (!isClosedDisplayStatus(row.displayStatus)) {
      entry.openCount += 1;
    }
    map.set(key, entry);
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      scopeLabel: resolveGroupScopeLabel(group),
    }))
    .sort((a, b) => b.openCount - a.openCount || a.taskName.localeCompare(b.taskName));
}

export type SimpleGroup = {
  key: string;
  label: string;
  sublabel?: string;
  rows: EnrichedRiskRow[];
  openCount: number;
};

export function groupByAgent(rows: EnrichedRiskRow[]): SimpleGroup[] {
  const map = new Map<string, SimpleGroup>();
  for (const row of rows) {
    const key = row.agentName;
    const entry =
      map.get(key) ??
      ({
        key,
        label: key,
        sublabel: row.department,
        rows: [],
        openCount: 0,
      } satisfies SimpleGroup);
    entry.rows.push(row);
    if (!isClosedDisplayStatus(row.displayStatus)) {
      entry.openCount += 1;
    }
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.openCount - a.openCount);
}

export function groupByDepartment(rows: EnrichedRiskRow[]): SimpleGroup[] {
  const map = new Map<string, SimpleGroup>();
  for (const row of rows) {
    const key = row.department || '—';
    const entry =
      map.get(key) ??
      ({
        key,
        label: key,
        rows: [],
        openCount: 0,
      } satisfies SimpleGroup);
    entry.rows.push(row);
    if (!isClosedDisplayStatus(row.displayStatus)) {
      entry.openCount += 1;
    }
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.openCount - a.openCount);
}

export function groupByOwner(rows: EnrichedRiskRow[]): SimpleGroup[] {
  const map = new Map<string, SimpleGroup>();
  for (const row of rows) {
    const key = row.ownerName?.trim() || '未指派';
    const entry =
      map.get(key) ??
      ({
        key,
        label: key,
        rows: [],
        openCount: 0,
      } satisfies SimpleGroup);
    entry.rows.push(row);
    if (!isClosedDisplayStatus(row.displayStatus)) {
      entry.openCount += 1;
    }
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.openCount - a.openCount);
}

export function computeRiskKpis(rows: EnrichedRiskRow[]) {
  const open = rows.filter((r) => !isClosedDisplayStatus(r.displayStatus));
  return {
    total: rows.length,
    open: open.length,
    pendingConfirm: open.filter((r) => r.displayStatus === 'pending_confirm').length,
    pendingRetest: open.filter((r) => r.displayStatus === 'pending_retest').length,
    closed: rows.filter((r) => r.displayStatus === 'closed').length,
    accepted: rows.filter((r) => r.displayStatus === 'risk_accepted').length,
    evidenceSubmitted: rows.filter((r) => r.status === 'evidence_submitted').length,
    retestReports: collectRetestReports(rows).length,
    retesting: rows.filter((r) => isRetestActivelyRunning(r)).length,
  };
}

const HIGH_LEVELS = new Set(['critical', 'high']);

export function countHighRisk(rows: EnrichedRiskRow[]): number {
  return rows.filter((r) => HIGH_LEVELS.has(r.riskLevel)).length;
}

export function countRetestActivityForTask(rows: EnrichedRiskRow[], taskId: string): number {
  return rows.filter(
    (r) =>
      r.taskId === taskId &&
      (r.retestStatus !== 'not_started' ||
        r.status === 'retesting' ||
        readMeta(r).retestBatchId != null),
  ).length;
}

function extractCaseNameFromFindingTitle(title?: string | null): string | null {
  if (!title) {
    return null;
  }
  const complianceMatch = title.match(/^(.+?)\s+合规违规$/);
  if (complianceMatch?.[1]) {
    return complianceMatch[1].trim();
  }
  return null;
}

function stripRemediationTitlePrefix(title: string): string {
  return title.replace(/^整改[：:]\s*/, '').trim();
}

export function buildRetestCaseRows(riskRows: EnrichedRiskRow[]): RetestCaseRow[] {
  const cases: RetestCaseRow[] = [];
  for (const row of riskRows) {
    const finding = row.finding;
    const evidence =
      finding?.evidence && typeof finding.evidence === 'object'
        ? (finding.evidence as Record<string, unknown>)
        : {};
    const caseName =
      (typeof evidence.caseName === 'string' && evidence.caseName.trim()) ||
      (typeof evidence.testCaseName === 'string' && evidence.testCaseName.trim()) ||
      extractCaseNameFromFindingTitle(finding?.title) ||
      stripRemediationTitlePrefix(row.title) ||
      finding?.title ||
      row.title;
    const caseId =
      (typeof evidence.caseCode === 'string' && evidence.caseCode) ||
      (typeof evidence.caseId === 'string' && evidence.caseId) ||
      finding?.testCaseId ||
      row.findingId ||
      row.id;
    let caseType = '对话 / API';
    if (row.riskKind === 'component') {
      caseType = '组件规则扫描';
    } else if (row.riskKind === 'compliance') {
      caseType = '合规控制项';
    } else {
      caseType = resolveRiskRowAttackTypeLabel(row);
    }
    cases.push({
      key: `${row.id}:${caseId}`,
      riskId: row.id,
      riskTitle: row.title,
      id: String(caseId),
      name: String(caseName),
      type: caseType,
    });
    if (row.riskKind === 'component' && typeof evidence.componentName === 'string') {
      cases.push({
        key: `${row.id}:comp:${evidence.componentName}`,
        riskId: row.id,
        riskTitle: row.title,
        id: String(evidence.componentName),
        name: `${evidence.componentName} 扫描项`,
        type: '组件规则扫描',
      });
    }
  }
  return cases;
}

export function filterCaseRowsByScope(
  caseRows: RetestCaseRow[],
  scopes: Set<RetestScopeId>,
): RetestCaseRow[] {
  if (scopes.size === 0) {
    return caseRows;
  }
  return caseRows.filter((c) => {
    if (scopes.has('dialog') && !/组件|合规/.test(c.type)) {
      return true;
    }
    if (scopes.has('component') && /组件|扫描/.test(c.type)) {
      return true;
    }
    if (scopes.has('compliance') && /合规/.test(c.type)) {
      return true;
    }
    return false;
  });
}

export function resolveAvailableRetestScopes(caseRows: RetestCaseRow[]): RetestScopeId[] {
  const scopes: RetestScopeId[] = [];
  if (filterCaseRowsByScope(caseRows, new Set(['dialog'])).length > 0) {
    scopes.push('dialog');
  }
  if (filterCaseRowsByScope(caseRows, new Set(['component'])).length > 0) {
    scopes.push('component');
  }
  if (filterCaseRowsByScope(caseRows, new Set(['compliance'])).length > 0) {
    scopes.push('compliance');
  }
  return scopes;
}

export function readRiskRowCaseKeys(row: EnrichedRiskRow): string[] {
  const evidence =
    row.finding?.evidence && typeof row.finding.evidence === 'object'
      ? (row.finding.evidence as Record<string, unknown>)
      : {};
  const keys = [evidence.caseCode, evidence.caseId, row.finding?.testCaseId].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  return [...new Set(keys.map((value) => value.trim()))];
}

export function resolveRetestSelectedCaseIds(
  riskRows: EnrichedRiskRow[],
  caseKeys: string[],
): string[] {
  const caseKeySet = new Set(caseKeys);
  const ids = new Set<string>();

  for (const row of riskRows) {
    const rowCases = buildRetestCaseRows([row]);
    for (const caseRow of rowCases) {
      if (caseKeys.length > 0 && !caseKeySet.has(caseRow.key)) {
        continue;
      }
      const testCaseId = row.finding?.testCaseId;
      if (typeof testCaseId === 'string' && testCaseId.trim()) {
        ids.add(testCaseId.trim());
        continue;
      }
      if (/^[0-9a-f-]{36}$/i.test(caseRow.id)) {
        ids.add(caseRow.id);
      }
    }
  }

  return [...ids];
}

export function resolveRetestCapabilityTargets(
  riskRows: EnrichedRiskRow[],
): RetestCapabilityTarget[] {
  const targets = new Map<string, RetestCapabilityTarget>();

  for (const row of riskRows) {
    if (row.riskKind !== 'component') {
      continue;
    }
    const evidence =
      row.finding?.evidence && typeof row.finding.evidence === 'object'
        ? (row.finding.evidence as Record<string, unknown>)
        : {};
    const riskLibraryId =
      typeof evidence.riskLibraryId === 'string' && evidence.riskLibraryId.trim()
        ? evidence.riskLibraryId.trim()
        : undefined;
    const componentKey =
      typeof evidence.componentKey === 'string' && evidence.componentKey.trim()
        ? evidence.componentKey.trim()
        : undefined;
    const componentKind =
      typeof evidence.componentKind === 'string' && evidence.componentKind.trim()
        ? evidence.componentKind.trim()
        : 'component';
    const componentName =
      typeof evidence.componentName === 'string' && evidence.componentName.trim()
        ? evidence.componentName.trim()
        : stripRemediationTitlePrefix(row.title) || row.finding?.title || row.title;
    const ruleId =
      typeof evidence.ruleId === 'string' && evidence.ruleId.trim()
        ? evidence.ruleId.trim()
        : undefined;
    const targetKey = [riskLibraryId, componentKind, componentKey, componentName, ruleId]
      .filter(Boolean)
      .join(':');

    targets.set(targetKey || row.id, {
      kind: componentKind,
      name: componentName,
      ...(componentKey ? { key: componentKey, componentKey } : {}),
      ...(riskLibraryId
        ? {
            riskId: riskLibraryId,
            riskLibraryId,
            capabilityRiskId: riskLibraryId,
            sourceType: 'risk_library',
            sourceRefId: riskLibraryId,
          }
        : {}),
      ...(ruleId ? { ruleId } : {}),
      remediationId: row.id,
      findingId: row.findingId,
      evidenceSource: evidence.source,
    });
  }

  return [...targets.values()];
}

export function buildRetestTaskRunConfig(
  sourceTask: SecurityScanTask,
  selectedCaseIds: string[],
  capabilityTargets: RetestCapabilityTarget[] = [],
): Record<string, unknown> {
  const base =
    sourceTask.runConfig && typeof sourceTask.runConfig === 'object'
      ? { ...(sourceTask.runConfig as Record<string, unknown>) }
      : {};
  const capabilityRiskIds = capabilityTargets
    .map((target) => target.riskLibraryId || target.riskId || target.capabilityRiskId)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return {
    ...base,
    selectedCaseIds,
    ...(capabilityTargets.length ? { retestCapabilityTargets: capabilityTargets } : {}),
    ...(capabilityRiskIds.length ? { retestCapabilityRiskIds: [...new Set(capabilityRiskIds)] } : {}),
    retestMode: true,
  };
}

export function collectFailedCaseKeysFromTask(task: SecurityScanTask): Set<string> {
  const failed = new Set<string>();
  const meta =
    task.metadata && typeof task.metadata === 'object'
      ? (task.metadata as Record<string, unknown>)
      : {};
  for (const listKey of ['technicalExecutionResults', 'complianceExecutionResults'] as const) {
    const list = meta[listKey];
    if (!Array.isArray(list)) {
      continue;
    }
    for (const item of list) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const record = item as Record<string, unknown>;
      if (record.passed !== false) {
        continue;
      }
      for (const key of [record.caseCode, record.caseId]) {
        if (typeof key === 'string' && key.trim()) {
          failed.add(key.trim());
        }
      }
    }
  }
  return failed;
}

export function isRiskStillFailingAfterRetest(
  row: EnrichedRiskRow,
  failedCaseKeys: Set<string>,
): boolean {
  const keys = readRiskRowCaseKeys(row);
  if (keys.length === 0) {
    return true;
  }
  return keys.some((key) => failedCaseKeys.has(key));
}

export type RetestExecutionSnapshot = {
  caseId?: string;
  caseCode?: string;
  caseName?: string;
  libraryId?: string;
  libraryTitle?: string;
  prompt?: string;
  expectedPass?: string;
  expectedFail?: string;
  responsePreview?: string;
  responseTimeMs?: number;
  passed?: boolean;
  judgeVerdict?: Record<string, unknown>;
  riskLevel?: string;
  sampleType?: string;
  transcript?: Array<{ role?: string; content?: string }>;
};

export type RetestResultDisplayModel = {
  riskId: string;
  title: string;
  agentName: string;
  riskLevel: DetectionRiskLevel;
  suggestedResult: 'passed' | 'failed';
  libraryTitle: string;
  attackTypeLabel: string;
  caseCode: string;
  expectedPass: string | null;
  expectedFail: string | null;
  prompt: string;
  responsePreview: string;
  judgeReason: string | null;
  responseTimeMs?: number;
  automatedPassed: boolean | null;
  isMultiTurn: boolean;
  transcriptText: string | null;
};

function readRetestExecutionSnapshotFromMeta(
  row: EnrichedRiskRow,
): RetestExecutionSnapshot | undefined {
  const meta = readMeta(row);
  const raw = meta.retestExecutionSnapshot;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  return raw as RetestExecutionSnapshot;
}

export function readTechnicalExecutionsFromTask(
  task?: SecurityScanTask | null,
): RetestExecutionSnapshot[] {
  if (!task?.metadata || typeof task.metadata !== 'object') {
    return [];
  }
  const list = (task.metadata as Record<string, unknown>).technicalExecutionResults;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((item) => item && typeof item === 'object') as RetestExecutionSnapshot[];
}

export function indexRetestExecutions(
  executions: RetestExecutionSnapshot[],
): Map<string, RetestExecutionSnapshot> {
  const map = new Map<string, RetestExecutionSnapshot>();
  for (const execution of executions) {
    for (const key of [execution.caseId, execution.caseCode]) {
      if (typeof key === 'string' && key.trim()) {
        map.set(key.trim(), execution);
      }
    }
  }
  return map;
}

export function resolveRetestExecutionForRow(
  row: EnrichedRiskRow,
  executionIndex: Map<string, RetestExecutionSnapshot>,
): RetestExecutionSnapshot | undefined {
  for (const key of readRiskRowCaseKeys(row)) {
    const hit = executionIndex.get(key);
    if (hit) {
      return hit;
    }
  }
  return readRetestExecutionSnapshotFromMeta(row);
}

export function suggestRetestResultForRow(
  row: EnrichedRiskRow,
  execution?: RetestExecutionSnapshot,
): 'passed' | 'failed' {
  if (execution && typeof execution.passed === 'boolean') {
    return execution.passed ? 'passed' : 'failed';
  }
  const meta = readMeta(row);
  if (meta.retestStillFailed === true) {
    return 'failed';
  }
  if (meta.retestStillFailed === false) {
    return 'passed';
  }
  return 'failed';
}

function readJudgeReason(source?: Record<string, unknown> | null): string | null {
  const verdict = source?.judgeVerdict;
  if (!verdict || typeof verdict !== 'object') {
    return null;
  }
  const reason = (verdict as Record<string, unknown>).reason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

export function buildRetestResultDisplayModel(
  row: EnrichedRiskRow,
  retestTask?: SecurityScanTask | null,
): RetestResultDisplayModel {
  const executionIndex = indexRetestExecutions(readTechnicalExecutionsFromTask(retestTask));
  const execution = resolveRetestExecutionForRow(row, executionIndex);
  const evidence =
    row.finding?.evidence && typeof row.finding.evidence === 'object'
      ? (row.finding.evidence as Record<string, unknown>)
      : {};
  const finding = row.finding;
  const libraryTitle =
    (typeof execution?.libraryTitle === 'string' && execution.libraryTitle.trim()) ||
    (typeof evidence.libraryTitle === 'string' && evidence.libraryTitle.trim()) ||
    (typeof evidence.libraryDomain === 'string' && evidence.libraryDomain.trim()) ||
    '—';
  const attackTypeLabel = finding
    ? resolveFindingAttackTypeLabelFromEvidence(finding, evidence)
    : typeof evidence.attackType === 'string'
      ? evidence.attackType
      : '—';
  const caseCode =
    (typeof execution?.caseCode === 'string' && execution.caseCode.trim()) ||
    (typeof evidence.caseCode === 'string' && evidence.caseCode.trim()) ||
    '—';
  const expectedPass =
    (typeof execution?.expectedPass === 'string' && execution.expectedPass.trim()) ||
    (typeof evidence.expectedPass === 'string' && evidence.expectedPass.trim()) ||
    null;
  const expectedFail =
    (typeof execution?.expectedFail === 'string' && execution.expectedFail.trim()) ||
    (typeof evidence.expectedFail === 'string' && evidence.expectedFail.trim()) ||
    null;
  const prompt =
    (typeof execution?.prompt === 'string' && execution.prompt.trim()) ||
    (typeof evidence.prompt === 'string' && evidence.prompt.trim()) ||
    '—';
  const responsePreview =
    (typeof execution?.responsePreview === 'string' && execution.responsePreview) ||
    (typeof evidence.responsePreview === 'string' && evidence.responsePreview) ||
    '';
  const responseTimeMs =
    typeof execution?.responseTimeMs === 'number'
      ? execution.responseTimeMs
      : typeof evidence.responseTimeMs === 'number'
        ? evidence.responseTimeMs
        : undefined;
  const transcript = execution?.transcript ?? evidence.transcript;
  const isMultiTurn =
    execution?.sampleType === 'multi_turn' ||
    evidence.sampleType === 'multi_turn' ||
    (Array.isArray(transcript) && transcript.length > 1);
  const transcriptText =
    Array.isArray(transcript) && transcript.length > 0
      ? transcript
          .filter((turn) => turn && typeof turn === 'object')
          .map((turn) => {
            const entry = turn as { role?: string; content?: string };
            const role = entry.role === 'assistant' ? 'Agent' : 'User';
            const content = typeof entry.content === 'string' ? entry.content : '';
            return `${role}: ${content}`;
          })
          .join('\n\n')
      : null;
  const judgeReason =
    readJudgeReason(execution) ||
    readJudgeReason(evidence) ||
    (finding ? readJudgeReason(readFindingEvidenceForRetest(finding)) : null);

  return {
    riskId: row.id,
    title: row.title,
    agentName: row.agentName,
    riskLevel: row.riskLevel,
    suggestedResult: suggestRetestResultForRow(row, execution),
    libraryTitle,
    attackTypeLabel,
    caseCode,
    expectedPass,
    expectedFail,
    prompt,
    responsePreview,
    judgeReason,
    responseTimeMs,
    automatedPassed: typeof execution?.passed === 'boolean' ? execution.passed : null,
    isMultiTurn,
    transcriptText,
  };
}

function readFindingEvidenceForRetest(finding: SecurityScanFinding): Record<string, unknown> {
  return finding.evidence && typeof finding.evidence === 'object'
    ? (finding.evidence as Record<string, unknown>)
    : {};
}

function resolveFindingAttackTypeLabelFromEvidence(
  finding: SecurityScanFinding,
  evidence: Record<string, unknown>,
): string {
  const attackType =
    (typeof evidence.attackType === 'string' && evidence.attackType.trim()) ||
    (finding.category && finding.category !== 'Security Case' ? finding.category : '');
  if (!attackType) {
    return '—';
  }
  return resolveTestMethodLabel(attackType) || attackType;
}

export function serializeRetestExecutionSnapshot(
  execution?: RetestExecutionSnapshot,
): RetestExecutionSnapshot | null {
  if (!execution) {
    return null;
  }
  return {
    caseId: execution.caseId,
    caseCode: execution.caseCode,
    caseName: execution.caseName,
    libraryId: execution.libraryId,
    libraryTitle: execution.libraryTitle,
    prompt: execution.prompt,
    expectedPass: execution.expectedPass,
    expectedFail: execution.expectedFail,
    responsePreview: execution.responsePreview,
    responseTimeMs: execution.responseTimeMs,
    passed: execution.passed,
    judgeVerdict: execution.judgeVerdict,
    riskLevel: execution.riskLevel,
    sampleType: execution.sampleType,
    transcript: execution.transcript,
  };
}

export function scanTaskToRetestRun(task: SecurityScanTask): SecurityRetestRun | null {
  if (task.source !== 'risk_retest') {
    return null;
  }
  const metadata =
    task.metadata && typeof task.metadata === 'object'
      ? (task.metadata as Record<string, unknown>)
      : {};
  const retestOfTaskId =
    typeof metadata.retestOfTaskId === 'string' ? metadata.retestOfTaskId : null;
  if (!retestOfTaskId) {
    return null;
  }
  const planId = typeof metadata.retestPlanId === 'string' ? metadata.retestPlanId : null;
  const remediationIds = Array.isArray(metadata.retestRemediationIds)
    ? metadata.retestRemediationIds.filter((id): id is string => typeof id === 'string')
    : [];
  return {
    retestScanTaskId: task.id,
    planId,
    reportId: planId ? toRetestReportId(planId) : null,
    remediationIds,
    status: task.status,
    progress: task.progress,
    name: task.name,
    metadata,
    createdAt: task.createdAt,
    completedAt: task.completedAt ?? null,
    updatedAt: task.updatedAt,
  };
}

export function buildRetestRunsFromScanTasks(tasks: SecurityScanTask[]): SecurityRetestRun[] {
  return tasks
    .map((task) => scanTaskToRetestRun(task))
    .filter((run): run is SecurityRetestRun => run != null);
}

export function collectRetestReports(
  rows: EnrichedRiskRow[],
  retestRuns?: SecurityRetestRun[],
): RetestReportSummary[] {
  if (retestRuns && retestRuns.length > 0) {
    const rowsByTask = new Map<string, EnrichedRiskRow[]>();
    for (const row of rows) {
      const list = rowsByTask.get(row.taskId) ?? [];
      list.push(row);
      rowsByTask.set(row.taskId, list);
    }
    const reports: RetestReportSummary[] = [];
    for (const run of retestRuns) {
      const originalTaskId =
        typeof run.metadata.retestOfTaskId === 'string' ? run.metadata.retestOfTaskId : '';
      if (!originalTaskId) {
        continue;
      }
      const taskRows =
        rowsByTask.get(originalTaskId) ?? rows.filter((r) => r.taskId === originalTaskId);
      const sample = taskRows[0];
      const summary = buildRetestRunSummaryFromRetestTask(run, taskRows);
      const reportId = summary.reportId;
      reports.push({
        id: reportId,
        taskId: originalTaskId,
        taskName: sample?.scanTask?.name || originalTaskId,
        agentName: sample?.agentName || '—',
        title: `${sample?.scanTask?.name || originalTaskId} · 风险整改复测报告`,
        createdAt: summary.time,
        status:
          summary.status === 'partial'
            ? 'partial'
            : summary.fail > 0
              ? 'draft'
              : summary.pass > 0
                ? 'archived'
                : 'draft',
        riskCount: summary.total,
        passedCount: summary.pass,
        failedCount: summary.fail,
        retestPlanId: summary.batchId,
        conclusion:
          typeof run.metadata.retestConclusion === 'string'
            ? run.metadata.retestConclusion
            : undefined,
      });
    }
    return reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return collectRetestReportsFromMetadata(rows);
}

function collectRetestReportsFromMetadata(rows: EnrichedRiskRow[]): RetestReportSummary[] {
  const byBatch = new Map<string, RetestReportSummary>();
  for (const row of rows) {
    const meta = readMeta(row);
    const batchId =
      (typeof meta.retestReportId === 'string' && meta.retestReportId) ||
      (typeof meta.retestBatchId === 'string' && meta.retestBatchId) ||
      null;
    if (!batchId && row.retestStatus === 'not_started') {
      continue;
    }
    if (
      row.displayStatus !== 'closed' &&
      row.retestStatus !== 'passed' &&
      row.retestStatus !== 'failed' &&
      row.status !== 'retesting'
    ) {
      if (!batchId) {
        continue;
      }
    }
    const id = batchId || `RPT-RT-${row.taskId}-${row.id.slice(0, 8)}`;
    const retestPlanId =
      (typeof meta.retestTaskId === 'string' && meta.retestTaskId) || batchId || undefined;
    const existing =
      byBatch.get(id) ??
      ({
        id,
        taskId: row.taskId,
        taskName: row.scanTask?.name || row.taskId,
        agentName: row.agentName,
        title: `${row.scanTask?.name || row.taskId} · 风险整改复测报告`,
        createdAt: row.updatedAt,
        status: 'draft',
        riskCount: 0,
        passedCount: 0,
        failedCount: 0,
        retestPlanId,
        conclusion:
          (typeof meta.retestConclusion === 'string' && meta.retestConclusion) || undefined,
      } satisfies RetestReportSummary);
    existing.riskCount += 1;
    if (row.retestStatus === 'passed' || row.displayStatus === 'closed') {
      existing.passedCount += 1;
    } else if (row.retestStatus === 'failed' || row.displayStatus === 'retest_failed') {
      existing.failedCount += 1;
    }
    if (row.status === 'retesting' || isRetestAwaitingConfirm(row)) {
      existing.status = 'partial';
    } else if (existing.failedCount === 0 && existing.passedCount > 0 && existing.riskCount > 0) {
      existing.status = 'archived';
    } else if (existing.failedCount > 0 && existing.passedCount > 0) {
      existing.status = 'partial';
    }
    if (row.updatedAt > existing.createdAt) {
      existing.createdAt = row.updatedAt;
    }
    byBatch.set(id, existing);
  }
  return [...byBatch.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function retestRunToScanTask(run: SecurityRetestRun): SecurityScanTask {
  return {
    id: run.retestScanTaskId,
    organizationId: '',
    name: run.name,
    source: 'retest',
    scanType: 'security_baseline',
    targetKind: 'agent',
    status: run.status as SecurityScanTask['status'],
    progress: run.progress,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    metadata: run.metadata,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt ?? undefined,
  };
}

export function resolveRetestScanTaskForReport(
  reportId: string,
  retestRuns: SecurityRetestRun[],
): SecurityRetestRun | null {
  const normalized = reportId.trim();
  if (!normalized) {
    return null;
  }
  const planFromReport = normalized.startsWith('RPT-RETEST-')
    ? `RT-${normalized.replace(/^RPT-RETEST-/, '')}`
    : normalized.startsWith('RT-')
      ? normalized
      : null;

  return (
    retestRuns.find(
      (run) =>
        run.retestScanTaskId === normalized ||
        run.reportId === normalized ||
        run.planId === normalized ||
        (planFromReport != null && run.planId === planFromReport),
    ) ?? null
  );
}

export function readRetestHistory(row: EnrichedRiskRow): RetestHistoryEntry[] {
  const meta = readMeta(row);
  if (!Array.isArray(meta.retestHistory)) {
    return [];
  }
  return meta.retestHistory.filter(
    (entry): entry is RetestHistoryEntry =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as RetestHistoryEntry).planId === 'string',
  );
}

export function appendRetestHistoryEntry(
  currentMeta: Record<string, unknown>,
  entry: RetestHistoryEntry,
): Record<string, unknown> {
  const existing = readRetestHistory({ metadata: currentMeta } as EnrichedRiskRow);
  const withoutDup = existing.filter((item) => item.planId !== entry.planId);
  return {
    ...currentMeta,
    retestHistory: [...withoutDup, entry],
  };
}

function summarizeRetestRunStats(
  run: SecurityRetestRun,
  remediationRows: EnrichedRiskRow[],
): Pick<RetestRunSummary, 'pass' | 'fail' | 'pending' | 'total' | 'status' | 'progress'> {
  const remediationIds = new Set(run.remediationIds);
  const scopedRows = remediationRows.filter((row) => remediationIds.has(row.id));
  const total = scopedRows.length || run.remediationIds.length;
  const scanTask = retestRunToScanTask(run);
  const executionIndex = indexRetestExecutions(readTechnicalExecutionsFromTask(scanTask));
  const planId = run.planId;

  if (run.status === 'running' || run.status === 'pending') {
    return {
      pass: 0,
      fail: 0,
      pending: total,
      total,
      status: 'running',
      progress: run.progress,
    };
  }

  let pass = 0;
  let fail = 0;
  let pending = 0;

  for (const row of scopedRows) {
    const meta = readMeta(row);
    const matchesBatch =
      planId != null &&
      (meta.retestBatchId === planId ||
        meta.retestReportId === run.reportId ||
        meta.retestScanTaskId === run.retestScanTaskId ||
        meta.retestTaskId === run.retestScanTaskId);

    if (matchesBatch && isRetestAwaitingConfirm(row)) {
      pending += 1;
      continue;
    }

    const historyHit = readRetestHistory(row).find((entry) => entry.planId === planId);
    if (historyHit) {
      if (historyHit.result === 'passed') {
        pass += 1;
      } else if (historyHit.result === 'failed') {
        fail += 1;
      } else {
        pending += 1;
      }
      continue;
    }

    const execution = resolveRetestExecutionForRow(row, executionIndex);
    if (execution && typeof execution.passed === 'boolean') {
      if (execution.passed) {
        pass += 1;
      } else {
        fail += 1;
      }
      continue;
    }

    if (suggestRetestResultForRow(row, execution) === 'passed') {
      pass += 1;
    } else {
      fail += 1;
    }
  }

  if (pending > 0 && pass === 0 && fail === 0) {
    return {
      pass,
      fail,
      pending,
      total,
      status: 'awaiting_confirm',
      progress: 100,
    };
  }

  if (pass > 0 && fail > 0) {
    return { pass, fail, pending, total, status: 'partial', progress: 100 };
  }

  if (pending > 0) {
    return { pass, fail, pending, total, status: 'awaiting_confirm', progress: 100 };
  }

  return { pass, fail, pending, total, status: 'completed', progress: 100 };
}

function finalizeRetestRunSummary(base: RetestRunSummary): RetestRunSummary {
  const run = { ...base };
  if (run.status === 'running') {
    run.summary = `执行中 · ${run.pending} 项排队检测`;
  } else if (run.status === 'awaiting_confirm') {
    run.summary = `${run.pass} 项通过 · ${run.fail} 项失败 · ${run.pending} 项待确认`;
  } else if (run.fail > 0 && run.pass > 0) {
    run.status = 'partial';
    run.summary = `${run.pass} 项通过 · ${run.fail} 项仍失败 · 请确认关闭已通过项`;
  } else if (run.fail > 0) {
    run.summary = `${run.fail} 项未通过 · 需重新整改`;
  } else if (run.pass > 0) {
    run.summary = `${run.pass} 项全部通过 · 建议关闭风险`;
  } else {
    run.summary = '复测执行记录';
  }
  return run;
}

export function buildRetestRunSummaryFromRetestTask(
  run: SecurityRetestRun,
  remediationRows: EnrichedRiskRow[],
): RetestRunSummary {
  const batchId = run.planId || run.retestScanTaskId;
  const reportId =
    run.reportId ||
    (run.planId ? toRetestReportId(run.planId) : `RPT-RETEST-${run.retestScanTaskId.slice(0, 8)}`);
  const stats = summarizeRetestRunStats(run, remediationRows);
  const time = (run.completedAt && String(run.completedAt)) || run.updatedAt || run.createdAt;

  return finalizeRetestRunSummary({
    batchId,
    reportId,
    retestScanTaskId: run.retestScanTaskId,
    time,
    ...stats,
    summary: '',
  });
}

function buildRetestRunsFromRetestTasks(
  retestRuns: SecurityRetestRun[],
  remediationRows: EnrichedRiskRow[],
): RetestRunSummary[] {
  return retestRuns
    .map((run) => buildRetestRunSummaryFromRetestTask(run, remediationRows))
    .sort((a, b) => b.time.localeCompare(a.time));
}

function buildRetestRunsFromMetadataLegacy(
  rows: EnrichedRiskRow[],
  taskId: string,
): RetestRunSummary[] {
  const taskRows = rows.filter((r) => r.taskId === taskId);
  const byBatch = new Map<string, RetestRunSummary>();

  for (const row of taskRows) {
    const meta = readMeta(row);
    const batchId =
      (typeof meta.retestBatchId === 'string' && meta.retestBatchId) ||
      (typeof meta.retestReportId === 'string' && meta.retestReportId) ||
      (typeof meta.retestTaskId === 'string' && meta.retestTaskId) ||
      null;
    if (!batchId && row.retestStatus === 'not_started' && row.status !== 'retesting') {
      continue;
    }
    const key = batchId || `legacy-${row.id.slice(0, 8)}`;
    const reportId =
      (typeof meta.retestReportId === 'string' && meta.retestReportId) ||
      (batchId?.startsWith('RT-')
        ? batchId.replace(/^RT-/, 'RPT-RETEST-')
        : `RPT-RETEST-${key.slice(0, 8)}`);
    const entry =
      byBatch.get(key) ??
      ({
        batchId: key,
        reportId,
        time: row.updatedAt,
        pass: 0,
        fail: 0,
        pending: 0,
        total: 0,
        summary: '',
        progress: 0,
        status: 'completed',
      } satisfies RetestRunSummary);

    entry.total += 1;
    if (isRetestActivelyRunning(row)) {
      entry.pending += 1;
      entry.status = 'running';
      entry.progress = Math.max(
        entry.progress,
        typeof meta.retestProgress === 'number' ? meta.retestProgress : 0,
      );
    } else if (isRetestAwaitingConfirm(row)) {
      entry.pending += 1;
      if (entry.status !== 'running') {
        entry.status = 'awaiting_confirm';
      }
      entry.progress = Math.max(entry.progress, 100);
    } else if (row.retestStatus === 'passed' || row.displayStatus === 'closed') {
      entry.pass += 1;
    } else if (row.retestStatus === 'failed' || row.displayStatus === 'retest_failed') {
      entry.fail += 1;
    } else if (row.retestStatus === 'pending') {
      entry.pending += 1;
      if (entry.status !== 'running') {
        entry.status = 'awaiting_confirm';
      }
    }

    if (row.updatedAt > entry.time) {
      entry.time = row.updatedAt;
    }
    byBatch.set(key, entry);
  }

  return [...byBatch.values()]
    .map((run) => {
      if (run.status === 'running') {
        run.summary = `执行中 · ${run.pending} 项排队检测`;
      } else if (run.status === 'awaiting_confirm') {
        run.summary = `${run.pass} 项通过 · ${run.fail} 项失败 · ${run.pending} 项待确认`;
      } else if (run.fail > 0 && run.pass > 0) {
        run.status = 'partial';
        run.summary = `${run.pass} 项通过 · ${run.fail} 项仍失败 · 请确认关闭已通过项`;
      } else if (run.fail > 0) {
        run.summary = `${run.fail} 项未通过 · 需重新整改`;
      } else if (run.pass > 0) {
        run.summary = `${run.pass} 项全部通过 · 建议关闭风险`;
      } else {
        run.summary = '复测执行记录';
      }
      return run;
    })
    .sort((a, b) => b.time.localeCompare(a.time));
}

export function buildRetestRunsForTask(
  rows: EnrichedRiskRow[],
  taskId: string,
  retestRuns?: SecurityRetestRun[],
): RetestRunSummary[] {
  const scopedRuns = (retestRuns ?? []).filter((run) => {
    const originalTaskId =
      typeof run.metadata.retestOfTaskId === 'string' ? run.metadata.retestOfTaskId : '';
    return originalTaskId === taskId;
  });
  if (scopedRuns.length > 0) {
    return buildRetestRunsFromRetestTasks(scopedRuns, rows);
  }
  return buildRetestRunsFromMetadataLegacy(rows, taskId);
}

export function resolveRetestOutcomeForBatch(
  row: EnrichedRiskRow,
  run: SecurityRetestRun | null,
): 'passed' | 'failed' | 'pending' {
  if (!run) {
    if (row.retestStatus === 'passed' || row.displayStatus === 'closed') {
      return 'passed';
    }
    if (row.retestStatus === 'failed' || row.displayStatus === 'retest_failed') {
      return 'failed';
    }
    return 'pending';
  }

  const planId = run.planId;
  const historyHit = readRetestHistory(row).find((entry) => entry.planId === planId);
  if (historyHit) {
    return historyHit.result;
  }

  const meta = readMeta(row);
  const matchesBatch =
    planId != null &&
    (meta.retestBatchId === planId ||
      meta.retestReportId === run.reportId ||
      meta.retestScanTaskId === run.retestScanTaskId ||
      meta.retestTaskId === run.retestScanTaskId);

  if (run.status === 'running' || run.status === 'pending') {
    return 'pending';
  }

  if (matchesBatch && isRetestAwaitingConfirm(row)) {
    return 'pending';
  }

  const scanTask = retestRunToScanTask(run);
  const executionIndex = indexRetestExecutions(readTechnicalExecutionsFromTask(scanTask));
  const execution = resolveRetestExecutionForRow(row, executionIndex);
  return suggestRetestResultForRow(row, execution) === 'passed' ? 'passed' : 'failed';
}

export function relatedRiskRowsForRetestRun(
  run: SecurityRetestRun | null,
  rows: EnrichedRiskRow[],
  taskId: string,
  report?: Pick<RetestReportSummary, 'id' | 'retestPlanId'>,
): EnrichedRiskRow[] {
  if (run) {
    const remediationIds = new Set(run.remediationIds);
    return rows.filter((row) => row.taskId === taskId && remediationIds.has(row.id));
  }

  if (!report) {
    return [];
  }

  const planId = report.retestPlanId;
  const reportId = report.id;
  return rows.filter((row) => {
    if (row.taskId !== taskId) {
      return false;
    }
    const meta = readMeta(row);
    const batchId =
      (typeof meta.retestBatchId === 'string' && meta.retestBatchId) ||
      (typeof meta.retestReportId === 'string' && meta.retestReportId) ||
      null;
    if (batchId === reportId || batchId === planId) {
      return true;
    }
    return readRetestHistory(row).some(
      (entry) => entry.reportId === reportId || entry.planId === planId,
    );
  });
}

export function countRetestRunsForTask(
  rows: EnrichedRiskRow[],
  taskId: string,
  retestRuns?: SecurityRetestRun[],
): number {
  return buildRetestRunsForTask(rows, taskId, retestRuns).length;
}

export function generateRetestPlanId(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RT-${stamp}-${suffix}`;
}

export function toRetestReportId(planId: string): string {
  if (planId.startsWith('RPT-')) {
    return planId;
  }
  return `RPT-RETEST-${planId.replace(/^RT-/, '')}`;
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatRemediationListTitle(title: string): string {
  let text = title.replace(/^整改[：:]\s*/, '').trim();
  for (const suffix of [' 未通过', ' 执行失败', ' 未执行', ' 合规违规']) {
    if (text.endsWith(suffix)) {
      text = text.slice(0, -suffix.length).trim();
    }
  }
  return text || title;
}

export function resolveRiskRowLibraryLabel(row: EnrichedRiskRow): string {
  const finding = row.finding;
  const evidence =
    finding?.evidence && typeof finding.evidence === 'object'
      ? (finding.evidence as Record<string, unknown>)
      : {};
  const libraryTitle =
    typeof evidence.libraryTitle === 'string' ? evidence.libraryTitle.trim() : '';
  if (libraryTitle) {
    return libraryTitle;
  }

  const libraryDomain =
    typeof evidence.libraryDomain === 'string' ? evidence.libraryDomain.trim() : '';
  if (libraryDomain) {
    return libraryDomain;
  }

  const meta = readMeta(row);
  const metaCategory = typeof meta.category === 'string' ? meta.category.trim() : '';
  if (metaCategory && !ATTACK_TYPE_SLUGS.has(metaCategory.toLowerCase())) {
    return metaCategory;
  }

  const findingCategory = finding?.category?.trim() || '';
  if (findingCategory && !ATTACK_TYPE_SLUGS.has(findingCategory.toLowerCase())) {
    return findingCategory;
  }

  return '—';
}

export function resolveRiskRowAttackTypeLabel(row: EnrichedRiskRow): string {
  const finding = row.finding;
  const evidence =
    finding?.evidence && typeof finding.evidence === 'object'
      ? (finding.evidence as Record<string, unknown>)
      : {};
  const attackType =
    (typeof evidence.attackType === 'string' ? evidence.attackType.trim() : '') ||
    (finding?.category && ATTACK_TYPE_SLUGS.has(finding.category.toLowerCase())
      ? finding.category
      : '');
  if (!attackType) {
    return '—';
  }
  const metadata =
    evidence.caseMetadata && typeof evidence.caseMetadata === 'object'
      ? (evidence.caseMetadata as Record<string, unknown>)
      : null;
  return resolveTestMethodLabel(attackType, metadata);
}

export function resolveRiskRowScopeLabel(row: EnrichedRiskRow): string {
  return resolveRiskRowLibraryLabel(row);
}

export function formatTaskDisplayLabel(taskId: string, taskName: string): string {
  if (taskName && taskName !== taskId && !UUID_LIKE.test(taskName)) {
    return taskName;
  }
  if (UUID_LIKE.test(taskId)) {
    return `评估任务 ${taskId.slice(0, 8)}…`;
  }
  return taskName || taskId || '未关联任务';
}
