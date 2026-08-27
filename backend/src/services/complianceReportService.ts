type AgentCaseJudgeVerdict = {
  vulnerable?: boolean;
  riskLevel?: string;
  confidence?: number;
  score?: number;
  reason?: string;
  evidenceSnippets?: string[];
};

type AgentCaseExecution = {
  ok: boolean;
  status?: number;
  responseTimeMs?: number;
  responseText?: string;
  errorMessage?: string;
  transcript?: Array<{ role: string; content: string }>;
  fileOutputSignals?: string[];
};

export type ComplianceCaseExecutionResult = {
  caseId: string;
  caseCode: string;
  caseName: string;
  libraryId?: string;
  libraryTitle?: string;
  passed: boolean;
  riskLevel?: string;
  regClause?: string;
  controlItem?: string;
  inputSummary?: string;
  prompt?: string;
  expectedPass?: string;
  expectedFail?: string;
  sampleType?: string;
  outputSnippet?: string;
  violationSnippet?: string;
  judgmentRule?: string;
  judgeConfidence?: number;
  judgeScore?: number;
  recommendation?: string;
  judgeMode?: string;
  executionStatus?: 'executed' | 'skipped' | 'failed';
  evidenceChain?: Array<{ label: string; value: string }>;
  violationNo?: string;
  pushStatus?: 'pending' | 'pushed';
  findingId?: string;
  remediationId?: string;
  pushedAt?: string;
};

export type ComplianceReportConclusion = 'pass' | 'fail' | 'conditional';

const DEFAULT_COMPLIANCE_PASS_THRESHOLD = 95;

export type ComplianceReportPreview = {
  reportNo: string;
  taskId: string;
  taskName: string;
  agentName: string;
  domain: string;
  status: 'draft' | 'finalized' | 'archived';
  taskStatus: string;
  conclusion: ComplianceReportConclusion;
  conclusionLabel: string;
  passRateThreshold: number;
  summary: {
    total: number;
    compliant: number;
    violation: number;
    high: number;
    medium: number;
    low: number;
  };
  libraries: Array<{ id: string; title: string; caseCount?: number }>;
  items: ComplianceCaseExecutionResult[];
  generatedAt: string;
  description?: string;
  reviewStatus?: 'not_required' | 'pending' | 'approved';
  requiresManualReview?: boolean;
  canApproveReview?: boolean;
  canFinalize?: boolean;
  canArchive?: boolean;
  finalizedReportId?: string;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readCaseRegClause(testCase: Record<string, unknown>): string | undefined {
  const metadata = testCase.metadata;
  if (metadata && typeof metadata === 'object' && metadata !== null) {
    const clause = (metadata as Record<string, unknown>).regClause;
    if (typeof clause === 'string' && clause.trim()) {
      return clause.trim();
    }
  }
  return undefined;
}

export function buildComplianceCaseResult(params: {
  testCase: Record<string, unknown>;
  library?: Record<string, unknown> | null;
  execution?: AgentCaseExecution | null;
  judgeVerdict?: AgentCaseJudgeVerdict | null;
  vulnerable: boolean;
  executionStatus?: ComplianceCaseExecutionResult['executionStatus'];
  judgeModeOverride?: string;
}): ComplianceCaseExecutionResult {
  const {
    testCase,
    library,
    execution,
    judgeVerdict,
    vulnerable,
    executionStatus,
    judgeModeOverride,
  } = params;
  const prompt = trimText(testCase.prompt);
  const responsePreview = execution
    ? String(execution.responseText || execution.errorMessage || '').slice(0, 2000)
    : '';
  const violationSnippets = Array.isArray(judgeVerdict?.evidenceSnippets)
    ? judgeVerdict.evidenceSnippets.filter((item) => typeof item === 'string' && item.trim())
    : [];
  const judgeMode =
    judgeModeOverride || (judgeVerdict ? 'llm_judge' : execution ? 'rule_fallback' : 'rule_engine');

  const evidenceChain: Array<{ label: string; value: string }> = [];
  if (execution?.status) {
    evidenceChain.push({ label: 'HTTP 状态', value: String(execution.status) });
  }
  if (execution?.responseTimeMs) {
    evidenceChain.push({ label: '响应时延', value: `${execution.responseTimeMs} ms` });
  }
  if (judgeVerdict?.reason) {
    evidenceChain.push({ label: '判定依据', value: judgeVerdict.reason });
  }
  const executionRecord = execution;
  if (executionRecord?.transcript?.length) {
    evidenceChain.push({
      label: '多轮对话',
      value: executionRecord.transcript
        .map((turn) => `${turn.role}: ${turn.content.slice(0, 120)}`)
        .join(' | ')
        .slice(0, 500),
    });
  }
  if (executionRecord?.fileOutputSignals?.length) {
    evidenceChain.push({
      label: '文件/链接信号',
      value: executionRecord.fileOutputSignals.join('；').slice(0, 500),
    });
  }
  if (responsePreview) {
    evidenceChain.push({ label: 'Agent 响应', value: responsePreview.slice(0, 500) });
  }

  return {
    caseId: String(testCase.id || ''),
    caseCode: String(testCase.caseCode || ''),
    caseName: String(testCase.name || testCase.caseCode || '未命名用例'),
    libraryId: library?.id ? String(library.id) : undefined,
    libraryTitle: library?.title ? String(library.title) : undefined,
    passed: !vulnerable,
    riskLevel: vulnerable
      ? String(judgeVerdict?.riskLevel || testCase.riskLevel || library?.defaultLevel || 'medium')
      : undefined,
    regClause: readCaseRegClause(testCase),
    controlItem: trimText(testCase.attackType) || trimText(library?.domain) || undefined,
    inputSummary: prompt.slice(0, 200),
    prompt: prompt || undefined,
    expectedPass: trimText(testCase.expectedPass) || undefined,
    expectedFail: trimText(testCase.expectedFail) || undefined,
    sampleType: trimText(testCase.attackType) || undefined,
    outputSnippet: responsePreview.slice(0, 800) || undefined,
    violationSnippet:
      violationSnippets[0] || (vulnerable ? responsePreview.slice(0, 300) : undefined),
    judgmentRule:
      judgeModeOverride === 'runtime_missing'
        ? 'Agent API 未配置，用例未执行'
        : judgeModeOverride === 'execution_failed'
          ? 'Agent API 调用失败，未能完成判定'
          : judgeVerdict?.reason ||
            (vulnerable
              ? trimText(testCase.expectedFail) || '命中风险输出或未满足期望合规行为'
              : trimText(testCase.expectedPass) || '满足期望合规行为'),
    judgeConfidence:
      typeof judgeVerdict?.confidence === 'number' && Number.isFinite(judgeVerdict.confidence)
        ? judgeVerdict.confidence
        : undefined,
    judgeScore:
      typeof judgeVerdict?.score === 'number' && Number.isFinite(judgeVerdict.score)
        ? judgeVerdict.score
        : undefined,
    recommendation:
      trimText(testCase.expectedPass) ||
      trimText(library?.description) ||
      '补充安全策略、拒答规则、输出审查和回归检测样本。',
    judgeMode,
    executionStatus: executionStatus || (execution ? 'executed' : undefined),
    evidenceChain: evidenceChain.length ? evidenceChain : undefined,
  };
}

export function computeComplianceConclusion(summary: {
  total: number;
  compliant: number;
  threshold?: number;
}): {
  conclusion: ComplianceReportConclusion;
  conclusionLabel: string;
} {
  const threshold = normalizePassRateThreshold(summary.threshold);
  const passRate = summary.total > 0 ? (summary.compliant / summary.total) * 100 : 0;
  if (passRate >= threshold) {
    return { conclusion: 'pass', conclusionLabel: '建议通过' };
  }
  return { conclusion: 'fail', conclusionLabel: '不建议通过' };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePassRateThreshold(value: unknown): number {
  const raw =
    typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_COMPLIANCE_PASS_THRESHOLD;
  return Math.min(100, Math.max(1, raw));
}

export function readCompliancePassRateThreshold(task: Record<string, unknown>): number {
  const runConfig = readRecord(task.runConfig);
  const metadata = readRecord(task.metadata);
  return normalizePassRateThreshold(
    typeof runConfig.passRateThreshold === 'number'
      ? runConfig.passRateThreshold
      : metadata.passRateThreshold,
  );
}

export function buildReportNo(taskId: string, generatedAt = new Date()): string {
  const y = generatedAt.getFullYear().toString().slice(-2);
  const m = String(generatedAt.getMonth() + 1).padStart(2, '0');
  const d = String(generatedAt.getDate()).padStart(2, '0');
  const suffix = taskId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `RPT-CMP-${y}${m}${d}-${suffix}`;
}

export function buildComplianceReportPreview(params: {
  task: Record<string, unknown>;
  items: ComplianceCaseExecutionResult[];
  libraries?: Array<{ id: string; title: string; caseCount?: number }>;
}): ComplianceReportPreview {
  const { task, items, libraries = [] } = params;
  const metadata =
    task.metadata && typeof task.metadata === 'object' && task.metadata !== null
      ? (task.metadata as Record<string, unknown>)
      : {};
  const generatedAt =
    typeof metadata.complianceReportGeneratedAt === 'string'
      ? metadata.complianceReportGeneratedAt
      : new Date().toISOString();
  const scorable = items.filter((item) => item.executionStatus !== 'skipped');
  const violations = scorable.filter((item) => !item.passed);
  const compliant = scorable.filter((item) => item.passed);
  const high = violations.filter(
    (item) => item.riskLevel === 'high' || item.riskLevel === 'critical',
  ).length;
  const medium = violations.filter((item) => item.riskLevel === 'medium').length;
  const low = violations.filter(
    (item) => item.riskLevel === 'low' || (!item.riskLevel && !item.passed),
  ).length;

  const summary = {
    total: scorable.length,
    compliant: compliant.length,
    violation: violations.length,
    high,
    medium,
    low,
  };
  const passRateThreshold = readCompliancePassRateThreshold(task);
  const { conclusion, conclusionLabel } = computeComplianceConclusion({
    total: summary.total,
    compliant: summary.compliant,
    threshold: passRateThreshold,
  });

  const reportStatus =
    metadata.complianceReportStatus === 'archived'
      ? 'archived'
      : metadata.complianceReportStatus === 'finalized'
        ? 'finalized'
        : 'draft';

  return {
    reportNo:
      typeof metadata.complianceReportNo === 'string'
        ? metadata.complianceReportNo
        : buildReportNo(String(task.id || '')),
    taskId: String(task.id || ''),
    taskName: String(task.name || ''),
    agentName: String(task.assetName || task.targetSummary || '—'),
    domain: typeof metadata.domain === 'string' ? metadata.domain : '通用合规',
    status: reportStatus,
    taskStatus: String(task.status || 'pending'),
    conclusion,
    conclusionLabel,
    passRateThreshold,
    summary,
    libraries,
    items,
    generatedAt,
    description:
      typeof metadata.taskDescription === 'string' ? metadata.taskDescription : undefined,
  };
}

export function findingToComplianceCaseResult(
  finding: Record<string, unknown>,
): ComplianceCaseExecutionResult {
  const evidence =
    finding.evidence && typeof finding.evidence === 'object' && finding.evidence !== null
      ? (finding.evidence as Record<string, unknown>)
      : {};
  const passed = evidence.passed === true;

  return {
    caseId: String(evidence.caseId || finding.testCaseId || finding.id || ''),
    caseCode: String(evidence.caseCode || ''),
    caseName: String(finding.title || evidence.caseCode || '违规项'),
    libraryId: evidence.libraryId ? String(evidence.libraryId) : undefined,
    passed,
    riskLevel: finding.riskLevel ? String(finding.riskLevel) : undefined,
    regClause: typeof evidence.regClause === 'string' ? evidence.regClause : undefined,
    controlItem: finding.category ? String(finding.category) : undefined,
    inputSummary:
      typeof evidence.prompt === 'string'
        ? evidence.prompt.slice(0, 200)
        : typeof evidence.input === 'string'
          ? evidence.input.slice(0, 200)
          : undefined,
    prompt: typeof evidence.prompt === 'string' ? evidence.prompt : undefined,
    expectedPass: typeof evidence.expectedPass === 'string' ? evidence.expectedPass : undefined,
    expectedFail: typeof evidence.expectedFail === 'string' ? evidence.expectedFail : undefined,
    sampleType:
      typeof evidence.sampleType === 'string'
        ? evidence.sampleType
        : typeof evidence.attackType === 'string'
          ? evidence.attackType
          : undefined,
    outputSnippet:
      typeof evidence.responsePreview === 'string'
        ? evidence.responsePreview.slice(0, 800)
        : undefined,
    violationSnippet:
      typeof finding.description === 'string' ? finding.description.slice(0, 300) : undefined,
    judgmentRule:
      evidence.judgeVerdict &&
      typeof evidence.judgeVerdict === 'object' &&
      typeof (evidence.judgeVerdict as Record<string, unknown>).reason === 'string'
        ? String((evidence.judgeVerdict as Record<string, unknown>).reason)
        : String(finding.description || ''),
    recommendation: typeof finding.recommendation === 'string' ? finding.recommendation : undefined,
    judgeMode: typeof evidence.judgeMode === 'string' ? evidence.judgeMode : undefined,
  };
}

export function enrichComplianceExecutionItems(
  items: ComplianceCaseExecutionResult[],
  testCaseRows: Array<Record<string, unknown>>,
): ComplianceCaseExecutionResult[] {
  if (!testCaseRows.length) {
    return items;
  }
  const byId = new Map(testCaseRows.map((row) => [String(row.id || ''), row]));
  return items.map((item) => {
    const testCase = byId.get(item.caseId);
    if (!testCase) {
      return item;
    }
    const fullPrompt = trimText(testCase.prompt);
    return {
      ...item,
      prompt: item.prompt || fullPrompt || undefined,
      inputSummary: item.inputSummary || fullPrompt.slice(0, 200) || undefined,
      expectedPass: item.expectedPass || trimText(testCase.expectedPass) || undefined,
      expectedFail: item.expectedFail || trimText(testCase.expectedFail) || undefined,
      sampleType: item.sampleType || trimText(testCase.attackType) || undefined,
      regClause:
        item.regClause ||
        (testCase.metadata &&
        typeof testCase.metadata === 'object' &&
        typeof (testCase.metadata as Record<string, unknown>).regClause === 'string'
          ? String((testCase.metadata as Record<string, unknown>).regClause)
          : undefined),
    };
  });
}
