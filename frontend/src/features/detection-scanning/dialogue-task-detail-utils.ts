import {
  ASSESS_SCENARIOS,
  SCAN_STRATEGIES,
} from '@/features/detection-scanning/dialogue-security-wizard-ui';
import {
  normalizeTurnSteps,
  renderTechnicalPayloadPreview,
  resolveTestMethodLabel,
  type TurnStep,
} from '@/features/technical-case-library/technical-case-test-methods';
import { formatDifyResponseForDisplay } from '@/lib/dify-response-preview';
import type {
  DetectionScanStatus,
  SecurityScanFinding,
  SecurityScanTask,
  SecurityTestCase,
} from '@/types/entities';

export type ExecutionDisplayStatus = 'pending' | 'running' | 'completed';

export const EXECUTION_STATUS_LABELS: Record<ExecutionDisplayStatus, string> = {
  pending: '待执行',
  running: '检测中',
  completed: '已完成',
};

export const EXECUTION_STATUS_CLASS: Record<ExecutionDisplayStatus, string> = {
  pending:
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  running:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300',
  completed:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
};

export function normalizeExecutionDisplayStatus(
  status: DetectionScanStatus,
): ExecutionDisplayStatus {
  if (status === 'running') {
    return 'running';
  }
  if (status === 'pending') {
    return 'pending';
  }
  return 'completed';
}

export function matchesExecutionStatusFilter(
  status: DetectionScanStatus,
  filter: ExecutionDisplayStatus | 'all',
): boolean {
  if (filter === 'all') {
    return true;
  }
  return normalizeExecutionDisplayStatus(status) === filter;
}

export function isExecutionFinished(status: DetectionScanStatus): boolean {
  return normalizeExecutionDisplayStatus(status) === 'completed';
}

export type DialogueDetailTab = 0 | 1 | 2 | 3 | 4;

export type DialogueDetailPanel = 'overview' | 'libraries' | 'findings' | 'cases' | 'push' | 'full';

export function panelToDialogueTab(panel: DialogueDetailPanel): DialogueDetailTab {
  if (panel === 'libraries') {
    return 1;
  }
  if (panel === 'findings') {
    return 2;
  }
  if (panel === 'cases') {
    return 3;
  }
  if (panel === 'push') {
    return 4;
  }
  return 0;
}

export type DialogueTaskDetailStats = {
  total: number;
  pass: number;
  fail: number;
  pending: number;
};

export type DialogueLibraryStatGroup = {
  libraryId: string;
  title: string;
  domain?: string;
  planned: number;
  fail: number;
  pass: number;
};

export type DialogueConclusionMeta = {
  pill: string;
  pillCls: 'red' | 'orange' | 'green' | 'blue' | 'gray';
  title: string;
  desc: string;
  actions: Array<{ tab: DialogueDetailTab; label: string }>;
};

export type FindingSourceType = 'dialogue' | 'capability' | 'unknown';

export type FindingSourceMeta = {
  type: FindingSourceType;
  label: string;
  badgeClass: string;
};

export type DialogueSampleType = 'single' | 'multi_turn' | 'file_input' | 'file_output';

export type DialogueTranscriptTurn = {
  role: string;
  content: string;
};

export type DialogueCaseRow = {
  caseId: string;
  caseCode: string;
  caseName: string;
  libraryId: string;
  libraryTitle: string;
  prompt: string;
  promptSummary: string;
  expectedPass?: string | null;
  expectedFail?: string | null;
  expectedOutput: string;
  riskBasis?: string | null;
  actualOutput: string;
  verdict: string;
  durationLabel: string;
  passed: boolean;
  pending: boolean;
  riskLevel?: string;
  responsePreview?: string;
  sampleType?: DialogueSampleType;
  turnSteps?: TurnStep[];
  transcript?: DialogueTranscriptTurn[];
  judgeVerdict?: Record<string, unknown>;
  judgeMode?: unknown;
  finding?: SecurityScanFinding;
  isDevFallback?: boolean;
};

export function formatCaseDuration(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) {
    return '—';
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function trimOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveExpectedFields(
  testCase?: Pick<SecurityTestCase, 'expectedPass' | 'expectedFail'> | null,
  execution?: TechnicalCaseExecution,
  evidence?: Record<string, unknown>,
): { expectedPass: string | null; expectedFail: string | null; expectedOutput: string } {
  const expectedPass =
    trimOrNull(execution?.expectedPass) ||
    trimOrNull(testCase?.expectedPass) ||
    trimOrNull(evidence?.expectedPass);
  const expectedFail =
    trimOrNull(execution?.expectedFail) ||
    trimOrNull(testCase?.expectedFail) ||
    trimOrNull(evidence?.expectedFail);
  return {
    expectedPass,
    expectedFail,
    expectedOutput: expectedPass || expectedFail || '—',
  };
}

function resolveCaseRiskBasis(
  testCase?: Pick<SecurityTestCase, 'metadata'> | null,
  execution?: TechnicalCaseExecution,
  evidence?: Record<string, unknown>,
): string | null {
  const metadata =
    testCase?.metadata && typeof testCase.metadata === 'object' ? testCase.metadata : {};
  return (
    trimOrNull(metadata.caseBasis) ||
    trimOrNull(metadata.basis) ||
    trimOrNull(metadata.detectionBasis) ||
    trimOrNull(metadata.riskBasis) ||
    trimOrNull(metadata.mappingBasis) ||
    trimOrNull(metadata['检测依据']) ||
    trimOrNull((execution as Record<string, unknown> | undefined)?.caseBasis) ||
    trimOrNull((execution as Record<string, unknown> | undefined)?.basis) ||
    trimOrNull((execution as Record<string, unknown> | undefined)?.detectionBasis) ||
    trimOrNull((execution as Record<string, unknown> | undefined)?.riskBasis) ||
    trimOrNull(evidence?.caseBasis) ||
    trimOrNull(evidence?.basis) ||
    trimOrNull(evidence?.detectionBasis) ||
    trimOrNull(evidence?.riskBasis) ||
    trimOrNull(evidence?.['检测依据'])
  );
}

export function buildSecurityFindingRecommendationDisplay(input: {
  caseName?: string | null;
  expectedPass?: string | null;
  expectedFail?: string | null;
}): string {
  const caseName = input.caseName?.trim() || '该攻击场景';
  const expectedPass = input.expectedPass?.trim() || '';
  const expectedFail = input.expectedFail?.trim() || '';

  if (expectedPass && expectedFail) {
    return `针对「${caseName}」命中风险，建议：1) 强化系统指令与输出审查，确保 Agent ${expectedPass}；2) 增加针对「${expectedFail}」的拒答规则与敏感信息过滤；3) 将该场景纳入回归检测并定期复测。`;
  }
  if (expectedPass) {
    return `针对「${caseName}」命中风险，建议强化安全策略与输出审查，确保 Agent ${expectedPass}，并补充回归检测样本与定期复测。`;
  }
  if (expectedFail) {
    return `针对「${caseName}」命中风险，建议增加拒答规则与输出过滤，避免出现「${expectedFail}」所描述的风险行为，并纳入回归检测。`;
  }
  return '补充安全策略、拒答规则、输出审查和回归检测样本。';
}

export function resolveFindingRecommendationDisplay(
  finding?: SecurityScanFinding,
  row?: Pick<DialogueCaseRow, 'caseName' | 'expectedPass' | 'expectedFail'>,
): string | null {
  if (!finding) {
    return null;
  }

  const evidence =
    finding.evidence && typeof finding.evidence === 'object'
      ? (finding.evidence as Record<string, unknown>)
      : {};
  const judgeVerdict =
    evidence.judgeVerdict && typeof evidence.judgeVerdict === 'object'
      ? (evidence.judgeVerdict as Record<string, unknown>)
      : null;
  const judgeRecommendation =
    typeof judgeVerdict?.recommendation === 'string' ? judgeVerdict.recommendation.trim() : '';
  if (judgeRecommendation) {
    return judgeRecommendation;
  }

  const expectedPass =
    row?.expectedPass?.trim() ||
    (typeof evidence.expectedPass === 'string' ? evidence.expectedPass.trim() : '') ||
    '';
  const expectedFail =
    row?.expectedFail?.trim() ||
    (typeof evidence.expectedFail === 'string' ? evidence.expectedFail.trim() : '') ||
    '';
  const caseName =
    row?.caseName?.trim() ||
    (typeof evidence.caseCode === 'string' ? evidence.caseCode : '') ||
    finding.title;

  const raw = typeof finding.recommendation === 'string' ? finding.recommendation.trim() : '';
  if (raw && (!expectedPass || raw !== expectedPass)) {
    return raw;
  }

  if (expectedPass || expectedFail) {
    return buildSecurityFindingRecommendationDisplay({
      caseName,
      expectedPass: expectedPass || null,
      expectedFail: expectedFail || null,
    });
  }

  return raw || null;
}

function readFindingEvidence(finding: SecurityScanFinding): Record<string, unknown> {
  return finding.evidence && typeof finding.evidence === 'object'
    ? (finding.evidence as Record<string, unknown>)
    : {};
}

export function resolveFindingSourceMeta(finding: SecurityScanFinding): FindingSourceMeta {
  const evidence = readFindingEvidence(finding);
  const source = trimOrNull(evidence.source);
  const mode = trimOrNull(evidence.mode);
  const category = finding.category || '';
  if (
    source === 'capability_risk_rule' ||
    source === 'capability_llm_review' ||
    mode === 'llm_static_review' ||
    trimOrNull(evidence.riskLibraryId) ||
    trimOrNull(evidence.componentName) ||
    /mcp|skill|工具|知识库|组件|capability|plugin|rag/i.test(category)
  ) {
    return {
      type: 'capability',
      label: '能力组件',
      badgeClass: 'border-violet-200 bg-violet-50 text-violet-800',
    };
  }
  if (
    source === 'security_test_case' ||
    trimOrNull(evidence.caseId) ||
    trimOrNull(evidence.caseCode) ||
    trimOrNull(finding.testCaseId) ||
    trimOrNull(finding.caseLibraryId)
  ) {
    return {
      type: 'dialogue',
      label: 'Agent 对话',
      badgeClass: 'border-blue-200 bg-blue-50 text-blue-800',
    };
  }
  return {
    type: 'unknown',
    label: '未分类',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
  };
}

export function resolveFindingLibraryTitle(
  finding: SecurityScanFinding,
  libraryGroups?: Array<Pick<DialogueLibraryStatGroup, 'libraryId' | 'title'>>,
): string {
  const evidence = readFindingEvidence(finding);
  if (resolveFindingSourceMeta(finding).type === 'capability') {
    return (
      trimOrNull(evidence.riskTitle) ||
      trimOrNull(evidence.componentName) ||
      trimOrNull(evidence.componentKey) ||
      '能力组件风险库'
    );
  }
  const fromEvidence = trimOrNull(evidence.libraryTitle);
  if (fromEvidence) {
    return fromEvidence;
  }

  const libraryId = trimOrNull(evidence.libraryId) || trimOrNull(finding.caseLibraryId);
  if (libraryId && libraryGroups?.length) {
    const match = libraryGroups.find((group) => group.libraryId === libraryId);
    if (match?.title) {
      return match.title;
    }
  }

  const domain = trimOrNull(evidence.libraryDomain);
  if (domain) {
    return domain;
  }

  return '—';
}

export function resolveFindingAttackTypeLabel(finding: SecurityScanFinding): string {
  const evidence = readFindingEvidence(finding);
  const attackType =
    trimOrNull(evidence.attackType) ||
    (finding.category && finding.category !== 'Security Case' ? finding.category : null);
  const metadata =
    evidence.caseMetadata && typeof evidence.caseMetadata === 'object'
      ? (evidence.caseMetadata as Record<string, unknown>)
      : null;
  return resolveTestMethodLabel(attackType || undefined, metadata);
}

export function resolveFindingCaseName(finding: SecurityScanFinding): string {
  const evidence = readFindingEvidence(finding);
  const fromEvidence = trimOrNull(evidence.caseName);
  if (fromEvidence) {
    return fromEvidence;
  }
  const title = finding.title.trim();
  for (const suffix of [' 未通过', ' 执行失败', ' 未执行']) {
    if (title.endsWith(suffix)) {
      return title.slice(0, -suffix.length);
    }
  }
  return title || '—';
}

export function resolveFindingJudgeModeLabel(mode: unknown): string {
  if (mode === 'llm_judge') {
    return 'LLM 判定';
  }
  if (mode === 'rule_fallback') {
    return '规则回退';
  }
  if (mode === 'rule_engine') {
    return '规则引擎';
  }
  if (mode === 'execution_failed') {
    return '执行失败';
  }
  if (mode === 'runtime_missing') {
    return '运行时缺失';
  }
  return typeof mode === 'string' && mode.trim() ? mode : '—';
}

export function isMultiTurnFinding(finding: SecurityScanFinding): boolean {
  const evidence = readFindingEvidence(finding);
  if (evidence.sampleType === 'multi_turn') {
    return true;
  }
  if (Array.isArray(evidence.transcript) && evidence.transcript.length > 1) {
    return true;
  }
  return false;
}

export function readFindingTranscript(
  finding: SecurityScanFinding,
): DialogueTranscriptTurn[] | undefined {
  const evidence = readFindingEvidence(finding);
  const raw = evidence.transcript;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const turns = raw
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        role: typeof row.role === 'string' ? row.role : 'user',
        content: typeof row.content === 'string' ? row.content : '',
      };
    })
    .filter((entry) => entry.content.trim());
  return turns.length > 0 ? turns : undefined;
}

function readCaseVerdict(passed: boolean, pending: boolean): string {
  if (pending) {
    return '待执行';
  }
  return passed ? '通过' : '失败';
}

function readResponseTimeMs(evidence?: Record<string, unknown>): number | undefined {
  const raw = evidence?.responseTimeMs;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

type TechnicalCaseExecution = {
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
  sampleType?: DialogueSampleType;
  transcript?: DialogueTranscriptTurn[];
  turnCount?: number;
};

function readTranscriptFromSources(
  execution?: TechnicalCaseExecution,
  evidence?: Record<string, unknown>,
): DialogueTranscriptTurn[] | undefined {
  const raw = execution?.transcript ?? evidence?.transcript;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const turns = raw
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        role: typeof row.role === 'string' ? row.role : 'user',
        content: typeof row.content === 'string' ? row.content : '',
      };
    })
    .filter((entry) => entry.content.trim());
  return turns.length > 0 ? turns : undefined;
}

function resolveCaseSampleType(
  testCase: SecurityTestCase | undefined,
  execution?: TechnicalCaseExecution,
  evidence?: Record<string, unknown>,
  turnSteps?: TurnStep[],
): DialogueSampleType {
  const fromExecution = execution?.sampleType;
  if (
    fromExecution === 'multi_turn' ||
    fromExecution === 'file_input' ||
    fromExecution === 'file_output'
  ) {
    return fromExecution;
  }
  const fromEvidence = evidence?.sampleType;
  if (
    fromEvidence === 'multi_turn' ||
    fromEvidence === 'file_input' ||
    fromEvidence === 'file_output'
  ) {
    return fromEvidence;
  }
  if (testCase?.attackType === 'multi_turn') {
    return 'multi_turn';
  }
  if ((turnSteps?.length ?? 0) > 1) {
    return 'multi_turn';
  }
  if (testCase?.attackType === 'file_input') {
    return 'file_input';
  }
  if (testCase?.attackType === 'file_output') {
    return 'file_output';
  }
  return 'single';
}

export function formatTurnStepsForDisplay(turnSteps: TurnStep[]): string {
  return turnSteps
    .map((step, index) => {
      const lines = [`[轮次 ${index + 1}]`, step.userInput.trim() || '—'];
      if (step.expectedSafe.trim()) {
        lines.push(`期望安全行为：${step.expectedSafe.trim()}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

export function formatTranscriptForDisplay(transcript: DialogueTranscriptTurn[]): string {
  return transcript
    .map((turn, index) => {
      const label = turn.role === 'assistant' ? 'Agent' : '用户';
      const content =
        turn.role === 'assistant' ? formatDifyResponseForDisplay(turn.content) : turn.content;
      return `[轮次 ${index + 1}] ${label}\n${content}`;
    })
    .join('\n\n');
}

export function isMultiTurnCaseRow(
  row: Pick<DialogueCaseRow, 'sampleType' | 'turnSteps'>,
): boolean {
  return row.sampleType === 'multi_turn' || (row.turnSteps?.length ?? 0) > 1;
}

export function resolveCasePromptDisplay(row: DialogueCaseRow): string {
  if (isMultiTurnCaseRow(row) && row.turnSteps?.length) {
    return formatTurnStepsForDisplay(row.turnSteps);
  }
  return row.prompt?.trim() || '—';
}

export function resolveCaseActualOutputDisplay(row: DialogueCaseRow): string {
  if (row.transcript?.length) {
    return formatTranscriptForDisplay(row.transcript);
  }
  if (row.actualOutput && row.actualOutput !== '—') {
    return row.actualOutput;
  }
  if (row.responsePreview?.trim()) {
    return formatDifyResponseForDisplay(row.responsePreview);
  }
  return '—';
}

function buildCaseRowMeta(
  testCase: SecurityTestCase | undefined,
  execution?: TechnicalCaseExecution,
  evidence?: Record<string, unknown>,
): Pick<DialogueCaseRow, 'sampleType' | 'turnSteps' | 'transcript' | 'promptSummary'> {
  const turnSteps = testCase ? normalizeTurnSteps(testCase.metadata, testCase.prompt) : [];
  const transcript = readTranscriptFromSources(execution, evidence);
  const sampleType = resolveCaseSampleType(testCase, execution, evidence, turnSteps);
  const promptSummary = testCase
    ? renderTechnicalPayloadPreview(testCase, 120)
    : typeof evidence?.prompt === 'string'
      ? evidence.prompt.slice(0, 120)
      : '—';
  return {
    sampleType,
    turnSteps: turnSteps.length > 0 ? turnSteps : undefined,
    transcript,
    promptSummary,
  };
}

function readTechnicalExecutionMap(
  task: SecurityScanTask | undefined,
): Map<string, TechnicalCaseExecution> {
  const rows = Array.isArray(task?.metadata?.technicalExecutionResults)
    ? (task.metadata.technicalExecutionResults as TechnicalCaseExecution[])
    : [];
  const map = new Map<string, TechnicalCaseExecution>();
  for (const row of rows) {
    if (typeof row.caseId === 'string' && row.caseId) {
      map.set(row.caseId, row);
    }
  }
  return map;
}

function formatResponsePreview(raw?: string): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    return '—';
  }
  return formatDifyResponseForDisplay(raw);
}

function readActualOutput(
  execution?: TechnicalCaseExecution,
  evidence?: Record<string, unknown>,
): string {
  const transcript = readTranscriptFromSources(execution, evidence);
  if (transcript?.length) {
    const lastAssistant = [...transcript].reverse().find((turn) => turn.role === 'assistant');
    if (lastAssistant?.content.trim()) {
      return formatDifyResponseForDisplay(lastAssistant.content);
    }
  }
  if (typeof execution?.responsePreview === 'string' && execution.responsePreview.trim()) {
    return formatResponsePreview(execution.responsePreview);
  }
  if (typeof evidence?.responsePreview === 'string' && evidence.responsePreview.trim()) {
    return formatResponsePreview(evidence.responsePreview);
  }
  return '—';
}

export function readCreationModeLabel(task: SecurityScanTask | undefined): string {
  const raw =
    (typeof task?.metadata?.creationMode === 'string' && task.metadata.creationMode) ||
    (typeof task?.runConfig?.creationMode === 'string' && task.runConfig.creationMode) ||
    '';
  if (raw === 'ai') {
    return 'AI 模式';
  }
  if (raw === 'manual') {
    return '手动模式';
  }
  return raw || '—';
}

export function readAssessScenarioLabel(task: SecurityScanTask | undefined): string {
  const raw =
    (typeof task?.metadata?.assessScenario === 'string' && task.metadata.assessScenario) ||
    (typeof task?.runConfig?.assessScenario === 'string' && task.runConfig.assessScenario) ||
    '';
  if (!raw) {
    return '—';
  }
  return ASSESS_SCENARIOS.find((item) => item.value === raw)?.label || raw;
}

export function readScanStrategyLabel(task: SecurityScanTask | undefined): string {
  const raw =
    (typeof task?.metadata?.scanStrategy === 'string' && task.metadata.scanStrategy) ||
    (typeof task?.runConfig?.scanStrategy === 'string' && task.runConfig.scanStrategy) ||
    '';
  if (!raw) {
    return '—';
  }
  return SCAN_STRATEGIES.find((item) => item.value === raw)?.label || raw;
}

export function collectTaskLibraryIds(task: SecurityScanTask | undefined): string[] {
  if (!task) {
    return [];
  }
  const ids = new Set<string>();
  for (const plan of task.plans || []) {
    for (const libId of plan.libIds || []) {
      if (libId) {
        ids.add(libId);
      }
    }
  }
  const selectedLibraries = Array.isArray(task.metadata?.selectedLibraries)
    ? (task.metadata.selectedLibraries as Array<{ id?: string }>)
    : [];
  for (const lib of selectedLibraries) {
    if (lib.id) {
      ids.add(lib.id);
    }
  }
  return [...ids];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function collectPlannedCaseIds(task: SecurityScanTask | undefined): Set<string> {
  const ids = new Set<string>();
  if (!task) {
    return ids;
  }
  const runConfig = task.runConfig && typeof task.runConfig === 'object' ? task.runConfig : {};
  const metadata = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  for (const caseId of readStringArray(runConfig.selectedCaseIds)) {
    ids.add(caseId);
  }
  for (const caseId of readStringArray(metadata.selectedCaseIds)) {
    ids.add(caseId);
  }
  for (const plan of task.plans || []) {
    const planMetadata =
      plan.metadata && typeof plan.metadata === 'object'
        ? (plan.metadata as Record<string, unknown>)
        : {};
    for (const caseId of readStringArray(planMetadata.caseIds)) {
      ids.add(caseId);
    }
  }
  return ids;
}

function countPlannedTestCasesByLibrary(
  task: SecurityScanTask | undefined,
  testCases: SecurityTestCase[],
): Map<string, number> {
  const counts = new Map<string, number>();
  if (!task || testCases.length === 0) {
    return counts;
  }
  const plannedCaseIds = collectPlannedCaseIds(task);
  const scopedTestCases =
    plannedCaseIds.size > 0
      ? testCases.filter((testCase) => plannedCaseIds.has(testCase.id))
      : testCases;

  for (const testCase of scopedTestCases) {
    if (!testCase.libraryId) {
      continue;
    }
    counts.set(testCase.libraryId, (counts.get(testCase.libraryId) || 0) + 1);
  }
  return counts;
}

export function buildDialogueCaseRows(
  task: SecurityScanTask | undefined,
  testCases: SecurityTestCase[],
  findings: SecurityScanFinding[],
  taskStatus: DetectionScanStatus,
): DialogueCaseRow[] {
  const libraryTitleById = new Map<string, string>();
  const executionByCaseId = readTechnicalExecutionMap(task);
  const selectedLibraries = Array.isArray(task?.metadata?.selectedLibraries)
    ? (task.metadata.selectedLibraries as Array<{ id?: string; title?: string }>)
    : [];
  for (const lib of selectedLibraries) {
    if (lib.id) {
      libraryTitleById.set(lib.id, lib.title || lib.id);
    }
  }

  const findingByCaseId = new Map<string, SecurityScanFinding>();
  for (const finding of findings) {
    const caseId =
      finding.testCaseId ||
      (typeof finding.evidence?.caseId === 'string' ? finding.evidence.caseId : undefined);
    if (caseId) {
      findingByCaseId.set(caseId, finding);
    }
  }

  const plannedCaseIds = collectPlannedCaseIds(task);
  const executedCaseIds = new Set([...executionByCaseId.keys(), ...findingByCaseId.keys()]);
  const scopedCaseIds = plannedCaseIds.size > 0 ? plannedCaseIds : executedCaseIds;
  const scopedTestCases =
    scopedCaseIds.size > 0
      ? testCases.filter((testCase) => scopedCaseIds.has(testCase.id))
      : testCases;

  const rows: DialogueCaseRow[] = scopedTestCases.map((testCase) => {
    const finding = findingByCaseId.get(testCase.id);
    const execution = executionByCaseId.get(testCase.id);
    const evidence = finding?.evidence;
    const libraryTitle =
      execution?.libraryTitle || libraryTitleById.get(testCase.libraryId) || testCase.libraryId;
    const pending =
      taskStatus === 'pending' || (taskStatus === 'running' && !execution && !finding);
    const passed = pending ? false : execution?.passed === true || !finding;
    const actualOutput = pending ? '—' : readActualOutput(execution, evidence);
    const durationMs =
      execution?.responseTimeMs ??
      readResponseTimeMs(evidence as Record<string, unknown> | undefined);
    const caseMeta = buildCaseRowMeta(testCase, execution, evidence);
    const expectedFields = resolveExpectedFields(testCase, execution, evidence);
    const riskBasis = resolveCaseRiskBasis(testCase, execution, evidence);
    return {
      caseId: testCase.id,
      caseCode: testCase.caseCode,
      caseName: testCase.name,
      libraryId: testCase.libraryId,
      libraryTitle,
      prompt: testCase.prompt,
      promptSummary: caseMeta.promptSummary,
      expectedPass: expectedFields.expectedPass,
      expectedFail: expectedFields.expectedFail,
      expectedOutput: expectedFields.expectedOutput,
      riskBasis,
      actualOutput,
      verdict: readCaseVerdict(passed, pending),
      durationLabel: formatCaseDuration(durationMs),
      passed,
      pending,
      riskLevel: finding?.riskLevel || execution?.riskLevel || testCase.riskLevel,
      responsePreview: actualOutput !== '—' ? actualOutput : undefined,
      sampleType: caseMeta.sampleType,
      turnSteps: caseMeta.turnSteps,
      transcript: caseMeta.transcript,
      judgeVerdict:
        execution?.judgeVerdict ||
        (evidence?.judgeVerdict && typeof evidence.judgeVerdict === 'object'
          ? (evidence.judgeVerdict as Record<string, unknown>)
          : undefined),
      judgeMode: evidence?.judgeMode,
      finding,
      isDevFallback: finding ? isDevFallbackFinding(finding) : false,
    };
  });

  for (const [caseId, execution] of executionByCaseId.entries()) {
    if (rows.some((row) => row.caseId === caseId)) {
      continue;
    }
    const finding = findingByCaseId.get(caseId);
    const evidence = finding?.evidence;
    const pending =
      taskStatus === 'pending' || (taskStatus === 'running' && !execution && !finding);
    const passed = pending ? false : execution.passed === true;
    const caseMeta = buildCaseRowMeta(undefined, execution, evidence);
    const expectedFields = resolveExpectedFields(null, execution, evidence);
    const riskBasis = resolveCaseRiskBasis(null, execution, evidence);
    rows.push({
      caseId,
      caseCode: execution.caseCode || caseId.slice(0, 8),
      caseName: execution.caseName || '—',
      libraryId: execution.libraryId || 'unknown',
      libraryTitle: execution.libraryTitle || '—',
      prompt: typeof execution.prompt === 'string' ? execution.prompt : '—',
      promptSummary: caseMeta.promptSummary,
      expectedPass: expectedFields.expectedPass,
      expectedFail: expectedFields.expectedFail,
      expectedOutput: expectedFields.expectedOutput,
      riskBasis,
      actualOutput: pending ? '—' : readActualOutput(execution, evidence),
      verdict: readCaseVerdict(passed, pending),
      durationLabel: formatCaseDuration(execution.responseTimeMs),
      passed,
      pending,
      riskLevel: finding?.riskLevel || execution.riskLevel,
      responsePreview:
        typeof execution.responsePreview === 'string' ? execution.responsePreview : undefined,
      sampleType: caseMeta.sampleType,
      turnSteps: caseMeta.turnSteps,
      transcript: caseMeta.transcript,
      judgeVerdict:
        execution.judgeVerdict ||
        (evidence?.judgeVerdict && typeof evidence.judgeVerdict === 'object'
          ? (evidence.judgeVerdict as Record<string, unknown>)
          : undefined),
      judgeMode: evidence?.judgeMode,
      finding,
      isDevFallback: finding ? isDevFallbackFinding(finding) : false,
    });
  }

  for (const finding of findings) {
    const caseId =
      finding.testCaseId ||
      (typeof finding.evidence?.caseId === 'string' ? finding.evidence.caseId : undefined);
    if (caseId && rows.some((row) => row.caseId === caseId)) {
      continue;
    }
    const evidence = finding.evidence || {};
    const actualOutput =
      typeof evidence.responsePreview === 'string' ? evidence.responsePreview : '—';
    const caseMeta = buildCaseRowMeta(undefined, undefined, evidence);
    const expectedFields = resolveExpectedFields(null, undefined, evidence);
    const riskBasis = resolveCaseRiskBasis(null, undefined, evidence);
    rows.push({
      caseId: caseId || finding.id,
      caseCode: typeof evidence.caseCode === 'string' ? evidence.caseCode : finding.id.slice(0, 8),
      caseName: finding.title,
      libraryId:
        (typeof evidence.libraryId === 'string' && evidence.libraryId) ||
        finding.caseLibraryId ||
        'unknown',
      libraryTitle:
        (typeof evidence.libraryTitle === 'string' && evidence.libraryTitle) ||
        finding.category ||
        '—',
      prompt: typeof evidence.prompt === 'string' ? evidence.prompt : finding.description,
      promptSummary: caseMeta.promptSummary,
      expectedPass: expectedFields.expectedPass,
      expectedFail: expectedFields.expectedFail,
      expectedOutput: expectedFields.expectedOutput,
      riskBasis,
      actualOutput,
      verdict: '失败',
      durationLabel: formatCaseDuration(readResponseTimeMs(evidence)),
      passed: false,
      pending: false,
      riskLevel: finding.riskLevel,
      responsePreview:
        typeof evidence.responsePreview === 'string' ? evidence.responsePreview : undefined,
      sampleType: caseMeta.sampleType,
      turnSteps: caseMeta.turnSteps,
      transcript: caseMeta.transcript,
      judgeVerdict:
        evidence.judgeVerdict && typeof evidence.judgeVerdict === 'object'
          ? (evidence.judgeVerdict as Record<string, unknown>)
          : undefined,
      judgeMode: evidence.judgeMode,
      finding,
      isDevFallback: isDevFallbackFinding(finding),
    });
  }

  return rows.sort((a, b) => a.caseCode.localeCompare(b.caseCode));
}

export function paginateDialogueCases<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  return {
    slice: items.slice(start, start + pageSize),
    page: safePage,
    pages,
    total,
  };
}

export function filterDialogueCases(
  items: DialogueCaseRow[],
  search: string,
  statusFilter: '' | 'pass' | 'fail',
): DialogueCaseRow[] {
  const kw = search.trim().toLowerCase();
  return items.filter((item) => {
    if (statusFilter === 'pass' && (item.pending || !item.passed)) {
      return false;
    }
    if (statusFilter === 'fail' && (item.pending || item.passed)) {
      return false;
    }
    if (!kw) {
      return true;
    }
    return [
      item.caseCode,
      item.caseName,
      item.prompt,
      item.promptSummary,
      item.expectedOutput,
      item.actualOutput,
      item.libraryTitle,
      item.verdict,
    ]
      .join(' ')
      .toLowerCase()
      .includes(kw);
  });
}

export type DialogueScoreMeta = {
  score: number | string;
  ringPct: number;
  ringColor: string;
  sub: string;
};

export function isDevFallbackFinding(finding: SecurityScanFinding): boolean {
  return finding.evidence?.mode === 'dev_fallback';
}

export function filterRealFindings(findings: SecurityScanFinding[]): SecurityScanFinding[] {
  return findings.filter((finding) => !isDevFallbackFinding(finding));
}

export type DialogueAssessmentConclusion = 'pass' | 'conditional' | 'fail';

export type BinaryDialogueConclusion = 'pass' | 'fail';

export function normalizeBinaryDialogueConclusion(
  conclusion?: DialogueAssessmentConclusion | null,
): BinaryDialogueConclusion | undefined {
  if (!conclusion) {
    return undefined;
  }
  if (conclusion === 'fail') {
    return 'fail';
  }
  return 'pass';
}

export function getBinaryDialogueConclusionLabel(
  conclusion?: DialogueAssessmentConclusion | null,
): string | null {
  const binary = normalizeBinaryDialogueConclusion(conclusion);
  if (!binary) {
    return null;
  }
  return binary === 'pass' ? '通过' : '不建议通过';
}

export type DialogueAssessmentSummary = {
  conclusion: DialogueAssessmentConclusion;
  passRate: number;
  threshold: number;
  label: string;
  recommended: boolean;
};

const DIALOGUE_ASSESSMENT_LABELS: Record<DialogueAssessmentConclusion, string> = {
  pass: '建议通过',
  conditional: '有条件通过',
  fail: '不建议通过',
};

export function readDialogueAssessmentFromTask(
  task: SecurityScanTask | undefined,
): DialogueAssessmentSummary | null {
  const raw = task?.metadata?.dialogueAssessmentConclusion;
  if (raw !== 'pass' && raw !== 'conditional' && raw !== 'fail') {
    return null;
  }
  const passRate =
    typeof task?.metadata?.dialoguePassRate === 'number'
      ? task.metadata.dialoguePassRate
      : undefined;
  const threshold = readPassRateThreshold(task);
  const label =
    (typeof task?.metadata?.dialogueAssessmentLabel === 'string' &&
      task.metadata.dialogueAssessmentLabel) ||
    DIALOGUE_ASSESSMENT_LABELS[raw];
  return {
    conclusion: raw,
    passRate: passRate ?? 0,
    threshold,
    label,
    recommended: raw !== 'fail',
  };
}

export function evaluateDialogueAssessment(
  task: SecurityScanTask | undefined,
  stats: DialogueTaskDetailStats,
  _riskCounts?: { high?: number; medium?: number },
): DialogueAssessmentSummary {
  const threshold = readPassRateThreshold(task);
  const passRate = computePassRate(stats);

  if (passRate >= threshold) {
    return {
      conclusion: 'pass',
      passRate,
      threshold,
      label: DIALOGUE_ASSESSMENT_LABELS.pass,
      recommended: true,
    };
  }
  return {
    conclusion: 'fail',
    passRate,
    threshold,
    label: DIALOGUE_ASSESSMENT_LABELS.fail,
    recommended: false,
  };
}

export function resolveDialogueAssessmentSummary(
  task: SecurityScanTask | undefined,
  stats: DialogueTaskDetailStats,
  taskStatus: DetectionScanStatus,
): DialogueAssessmentSummary | null {
  if (taskStatus !== 'completed' && taskStatus !== 'blocked') {
    return null;
  }
  const stored = readDialogueAssessmentFromTask(task);
  if (stored) {
    return stored;
  }
  if (stats.total <= 0) {
    return null;
  }
  return evaluateDialogueAssessment(task, stats);
}

export function resolveBinaryDialogueConclusionLabel(
  task: SecurityScanTask | undefined,
  stats: DialogueTaskDetailStats,
  taskStatus: DetectionScanStatus,
): '建议通过' | '不建议通过' {
  const assessment = resolveDialogueAssessmentSummary(task, stats, taskStatus);
  if (assessment) {
    return assessment.conclusion === 'pass' ? '建议通过' : '不建议通过';
  }
  if ((taskStatus === 'completed' || taskStatus === 'blocked') && stats.total > 0) {
    return evaluateDialogueAssessment(task, stats).label as '建议通过' | '不建议通过';
  }
  return '不建议通过';
}

export function readPassRateThreshold(task: SecurityScanTask | undefined): number {
  const fromRunConfig = task?.runConfig?.passRateThreshold;
  const fromMetadata = task?.metadata?.passRateThreshold;
  const raw =
    typeof fromRunConfig === 'number'
      ? fromRunConfig
      : typeof fromMetadata === 'number'
        ? fromMetadata
        : 90;
  return Math.min(100, Math.max(1, raw));
}

export function computePlannedCaseTotal(task: SecurityScanTask | undefined): number {
  if (!task) {
    return 0;
  }
  return (task.plans || []).reduce((sum, plan) => sum + (plan.caseCount || 0), 0);
}

function readStatsFromTechnicalExecution(
  task: SecurityScanTask | undefined,
): DialogueTaskDetailStats | null {
  const rows = Array.isArray(task?.metadata?.technicalExecutionResults)
    ? (task.metadata.technicalExecutionResults as Array<{ passed?: boolean }>)
    : [];
  if (rows.length === 0) {
    return null;
  }
  let pass = 0;
  let fail = 0;
  for (const row of rows) {
    if (row.passed === true) {
      pass += 1;
    } else if (row.passed === false) {
      fail += 1;
    }
  }
  const counted = pass + fail;
  const total = counted > 0 ? counted : rows.length;
  return { total, pass, fail, pending: 0 };
}

export function computeDialogueTaskStats(
  task: SecurityScanTask | undefined,
  findings: SecurityScanFinding[],
  taskStatus: DetectionScanStatus,
): DialogueTaskDetailStats {
  const plannedTotal = computePlannedCaseTotal(task);
  const total = plannedTotal || findings.length;
  const fromExecution =
    taskStatus === 'completed' || taskStatus === 'blocked'
      ? readStatsFromTechnicalExecution(task)
      : null;

  if (taskStatus === 'pending') {
    return { total, pass: 0, fail: 0, pending: total };
  }
  if (taskStatus === 'running') {
    const executionDone = fromExecution ? fromExecution.pass + fromExecution.fail : 0;
    const fail = fromExecution ? fromExecution.fail : Math.min(findings.length, total);
    const done = fromExecution ? executionDone : fail;
    return {
      total,
      pass: fromExecution ? fromExecution.pass : 0,
      fail,
      pending: Math.max(0, total - done),
    };
  }
  if (fromExecution) {
    return fromExecution;
  }
  const fail = findings.length;
  return {
    total,
    pass: Math.max(0, total - fail),
    fail,
    pending: 0,
  };
}

export function computePassRate(stats: DialogueTaskDetailStats): number {
  if (stats.total <= 0) {
    return 0;
  }
  return Math.round((stats.pass / stats.total) * 100);
}

const LIBRARY_ID_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeLibraryUuid(value: string): boolean {
  return LIBRARY_ID_UUID_RE.test(value);
}

function humanizeLibraryKey(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readTechnicalExecutionRows(
  task: SecurityScanTask | undefined,
): Array<Record<string, unknown>> {
  return Array.isArray(task?.metadata?.technicalExecutionResults)
    ? (task.metadata.technicalExecutionResults as Array<Record<string, unknown>>)
    : [];
}

export function resolveLibraryTitleFromTask(
  libraryId: string,
  task: SecurityScanTask | undefined,
  findings: SecurityScanFinding[] = [],
): string {
  const selectedLibraries = Array.isArray(task?.metadata?.selectedLibraries)
    ? (task.metadata.selectedLibraries as Array<{ id?: string; title?: string }>)
    : [];
  const fromSelected = selectedLibraries.find((lib) => lib.id === libraryId);
  if (fromSelected?.title?.trim()) {
    return fromSelected.title.trim();
  }

  for (const row of readTechnicalExecutionRows(task)) {
    if (row.libraryId !== libraryId) {
      continue;
    }
    const title = typeof row.libraryTitle === 'string' ? row.libraryTitle.trim() : '';
    if (title && !looksLikeLibraryUuid(title)) {
      return title;
    }
  }

  for (const finding of findings) {
    const evidence = finding.evidence || {};
    const evidenceLibraryId =
      (typeof evidence.libraryId === 'string' && evidence.libraryId) || finding.caseLibraryId || '';
    if (evidenceLibraryId !== libraryId) {
      continue;
    }
    const title = typeof evidence.libraryTitle === 'string' ? evidence.libraryTitle.trim() : '';
    if (title) {
      return title;
    }
  }

  if (!looksLikeLibraryUuid(libraryId)) {
    return humanizeLibraryKey(libraryId);
  }
  return '未命名场景库';
}

export function resolveTaskAttackLibraryLabel(
  task: SecurityScanTask | undefined,
  findings: SecurityScanFinding[] = [],
): string {
  const groups = groupDialogueLibraryStats(task, findings);
  const titles = groups
    .map((group) => group.title)
    .filter((title) => title && title !== '未命名场景库' && !looksLikeLibraryUuid(title));
  if (titles.length) {
    return [...new Set(titles)].join('、');
  }
  return '—';
}

export function groupDialogueLibraryStats(
  task: SecurityScanTask | undefined,
  findings: SecurityScanFinding[],
  testCases: SecurityTestCase[] = [],
): DialogueLibraryStatGroup[] {
  const selectedLibraries = Array.isArray(task?.metadata?.selectedLibraries)
    ? (task.metadata.selectedLibraries as Array<{
        id?: string;
        title?: string;
        domain?: string;
        caseCount?: number;
      }>)
    : [];

  const map = new Map<string, DialogueLibraryStatGroup>();
  const plannedCasesByLibrary = countPlannedTestCasesByLibrary(task, testCases);

  for (const lib of selectedLibraries) {
    if (!lib.id) {
      continue;
    }
    map.set(lib.id, {
      libraryId: lib.id,
      title: lib.title || '未命名场景库',
      domain: lib.domain,
      planned:
        plannedCasesByLibrary.get(lib.id) ??
        (typeof lib.caseCount === 'number' ? lib.caseCount : 0),
      fail: 0,
      pass: 0,
    });
  }

  for (const plan of task?.plans || []) {
    const planLibIds = (plan.libIds || []).filter(Boolean);
    for (const libId of plan.libIds || []) {
      const title = resolveLibraryTitleFromTask(libId, task, findings);
      if (map.has(libId)) {
        const group = map.get(libId)!;
        if (looksLikeLibraryUuid(group.title) || group.title === libId) {
          group.title = title;
        }
        if (!group.planned) {
          group.planned =
            plannedCasesByLibrary.get(libId) ?? (planLibIds.length === 1 ? plan.caseCount || 0 : 0);
        }
      } else {
        map.set(libId, {
          libraryId: libId,
          title,
          planned:
            plannedCasesByLibrary.get(libId) ?? (planLibIds.length === 1 ? plan.caseCount || 0 : 0),
          fail: 0,
          pass: 0,
        });
      }
    }
  }

  const technicalResults = readTechnicalExecutionRows(task);
  if (technicalResults.length > 0) {
    for (const group of map.values()) {
      group.pass = 0;
      group.fail = 0;
      group.planned = 0;
    }
    for (const row of technicalResults) {
      const libraryId = typeof row.libraryId === 'string' ? row.libraryId : 'unknown';
      const title = resolveLibraryTitleFromTask(libraryId, task, findings);
      const group =
        map.get(libraryId) ||
        (() => {
          const created = {
            libraryId,
            title,
            planned: 0,
            fail: 0,
            pass: 0,
          };
          map.set(libraryId, created);
          return created;
        })();
      group.title = title;
      group.planned += 1;
      if (row.passed === true) {
        group.pass += 1;
      } else {
        group.fail += 1;
      }
    }
  }

  for (const finding of findings) {
    const libraryId =
      (typeof finding.evidence?.libraryId === 'string' && finding.evidence.libraryId) ||
      finding.caseLibraryId ||
      'unknown';
    const libraryTitle = resolveLibraryTitleFromTask(libraryId, task, findings);
    if (map.has(libraryId)) {
      const group = map.get(libraryId)!;
      if (looksLikeLibraryUuid(group.title) || group.title === libraryId) {
        group.title = libraryTitle;
      }
    } else {
      map.set(libraryId, {
        libraryId,
        title: libraryTitle,
        planned: 0,
        fail: 0,
        pass: 0,
      });
    }
    if (technicalResults.length === 0) {
      map.get(libraryId)!.fail += 1;
    }
  }

  if (technicalResults.length === 0) {
    for (const group of map.values()) {
      if (group.planned > 0) {
        group.pass = Math.max(0, group.planned - group.fail);
      }
    }
  }

  return [...map.values()]
    .filter((group) => group.planned > 0 || group.pass > 0 || group.fail > 0)
    .sort((a, b) => {
      const bActive = b.pass + b.fail;
      const aActive = a.pass + a.fail;
      if (bActive !== aActive) {
        return bActive - aActive;
      }
      if (b.planned !== a.planned) {
        return b.planned - a.planned;
      }
      return a.title.localeCompare(b.title, 'zh-Hans-CN');
    });
}

export function computeDialogueConclusionMeta(
  task: SecurityScanTask | undefined,
  stats: DialogueTaskDetailStats,
  taskStatus: DetectionScanStatus,
  progress = 0,
): DialogueConclusionMeta {
  const threshold = readPassRateThreshold(task);
  const passRate = computePassRate(stats);
  const highCount = task?.highCount ?? 0;

  if (taskStatus === 'pending') {
    return {
      pill: '待执行',
      pillCls: 'gray',
      title: '任务已创建 · 等待执行',
      desc: `共计划 ${stats.total || '—'} 条对话安全用例，执行前可从攻击场景库确认范围与样本类型。`,
      actions: [
        { tab: 1, label: '查看场景库统计' },
        { tab: 0, label: '查看任务总览' },
      ],
    };
  }

  if (taskStatus === 'running') {
    const pct =
      progress ||
      Math.min(100, Math.round(((stats.pass + stats.fail) / Math.max(1, stats.total)) * 100));
    return {
      pill: `检测中 · ${pct}%`,
      pillCls: 'blue',
      title: '对话安全检测执行中',
      desc: `已完成 ${stats.pass + stats.fail} / ${stats.total} 条用例（通过 ${stats.pass} · 失败 ${stats.fail} · 待执行 ${stats.pending}）。`,
      actions: [
        { tab: 2, label: '查看风险发现' },
        { tab: 3, label: '查看检测用例明细' },
      ],
    };
  }

  if (taskStatus === 'canceled') {
    return {
      pill: '已取消',
      pillCls: 'red',
      title: '对话安全检测未能正常完成',
      desc: '请检查 Agent API 联通性与任务配置后重新运行。',
      actions: [{ tab: 2, label: '查看风险发现' }],
    };
  }

  const assessment = resolveDialogueAssessmentSummary(
    task,
    stats,
    taskStatus === 'blocked' ? 'completed' : taskStatus,
  );
  if (assessment) {
    if (assessment.conclusion === 'fail') {
      return {
        pill: `综合结论：${assessment.label}`,
        pillCls: 'red',
        title: '对话安全检测存在关键风险',
        desc: `本次共执行 ${stats.total} 条用例，高危命中 ${highCount} 条。通过率 ${assessment.passRate}%（阈值 ${assessment.threshold}%）。建议整改后复测。`,
        actions: [
          { tab: 2, label: '查看风险明细' },
          { tab: 3, label: '查看检测用例明细' },
        ],
      };
    }
    return {
      pill: `综合结论：${assessment.label}`,
      pillCls: 'green',
      title: '对话安全检测达标',
      desc: `共执行 ${stats.total} 条用例，通过率 ${assessment.passRate}%（阈值 ${assessment.threshold}%）。通过率达到本轮准入标准。`,
      actions: [
        { tab: 0, label: '查看任务总览' },
        { tab: 1, label: '查看场景库统计' },
      ],
    };
  }

  const recommended = passRate >= threshold;

  if (!recommended) {
    return {
      pill: '综合结论：不建议通过',
      pillCls: 'red',
      title: '对话安全检测存在关键风险',
      desc: `本次共执行 ${stats.total} 条用例，高危命中 ${highCount} 条。通过率 ${passRate}%（阈值 ${threshold}%）。建议整改后复测。`,
      actions: [
        { tab: 2, label: '查看风险明细' },
        { tab: 3, label: '查看检测用例明细' },
      ],
    };
  }

  return {
    pill: '综合结论：建议通过',
    pillCls: 'green',
    title: '对话安全检测达标',
    desc: `共执行 ${stats.total} 条用例，通过率 ${passRate}%（阈值 ${threshold}%）。通过率达到本轮准入标准。`,
    actions: [
      { tab: 0, label: '查看任务总览' },
      { tab: 1, label: '查看场景库统计' },
    ],
  };
}

export function computeDialogueScoreMeta(
  task: SecurityScanTask | undefined,
  stats: DialogueTaskDetailStats,
  taskStatus: DetectionScanStatus,
  progress = 0,
): DialogueScoreMeta {
  const threshold = readPassRateThreshold(task);
  const passRate = computePassRate(stats);

  if (taskStatus === 'pending') {
    return { score: '—', ringPct: 0, ringColor: '#e5e7eb', sub: '任务尚未执行' };
  }
  if (taskStatus === 'running') {
    const ringPct =
      progress ||
      Math.min(100, Math.round(((stats.pass + stats.fail) / Math.max(1, stats.total)) * 100));
    return {
      score: Math.max(1, Math.round(ringPct * 0.6)),
      ringPct,
      ringColor: '#2563eb',
      sub: `检测进度 ${ringPct}% · 结论待生成`,
    };
  }
  const ringColor =
    passRate >= threshold ? '#16a34a' : passRate >= threshold - 10 ? '#2563eb' : '#f97316';
  return {
    score: passRate,
    ringPct: passRate,
    ringColor,
    sub:
      passRate >= threshold ? `达到设定阈值 ${threshold}%` : `低于设定阈值 ${threshold}% · 需整改`,
  };
}

export function formatTaskDuration(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) {
    return '—';
  }
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return '—';
  }
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

export const DIALOGUE_DETAIL_TABS: Array<{
  label: string;
  countKey?: 'libraries' | 'findings' | 'total';
}> = [
  { label: '任务总览' },
  { label: '场景库统计', countKey: 'libraries' },
  { label: '风险发现', countKey: 'findings' },
  { label: '检测用例明细', countKey: 'total' },
  { label: '推送闭环' },
];

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const content = rows.map((row) => row.map(escape).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
