/**
 * Capability scan — unified types (Word 方案 Finding Schema 对齐).
 */

export type ScanStrategy =
  | 'quick'
  | 'standard'
  | 'deep_offline'
  | 'online_enhanced'
  | 'debug'
  | 'llm_only';

export type ScanArtifactKind = 'skills' | 'mcp' | 'tool';

export type ScanSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Word 方案 §13.1 */
export type RiskType =
  | 'prompt_instruction_risk'
  | 'sensitive_data_leakage'
  | 'dangerous_code_execution'
  | 'external_network_risk'
  | 'supply_chain_risk'
  | 'permission_overreach'
  | 'filesystem_risk'
  | 'tool_poisoning_risk'
  | 'config_auth_risk'
  | 'scan_integrity_risk';

export type SuggestedAction = 'block' | 'review' | 'allow';

/** 处理状态 — 是否计入正式风险 */
export type ProcessingStatus =
  | 'confirmed'
  | 'suspected'
  | 'hint'
  | 'reference_sample'
  | 'false_positive';

export type TriagePathRole =
  | 'skill_body'
  | 'executable_code'
  | 'install_chain'
  | 'documentation'
  | 'reference_sample'
  | 'scanner_or_test'
  | 'dev_environment'
  | 'data_or_knowledge'
  | 'unknown';

export type UnifiedFinding = {
  severity: ScanSeverity;
  category: string;
  location: string;
  issue: string;
  evidence: string;
  recommendation: string;
  dimension?: string;
  sourceFile?: string;
  sourceEngines: string[];
  ruleIds?: string[];
  confidence?: 'low' | 'medium' | 'high';
  riskType?: RiskType;
  suggestedAction?: SuggestedAction;
  /** Set when LLM triage adjusted severity or merged this finding */
  llmAdjusted?: boolean;
  /** Short LLM triage rationale */
  triageNote?: string;
  /** Path role assigned by LLM triage */
  pathRole?: TriagePathRole;
  /** 确认 / 疑似 / 提示 / 参考样例 / 误报 */
  processingStatus?: ProcessingStatus;
};

export type EngineRunStatus = {
  engine: string;
  status: 'success' | 'skipped' | 'failed' | 'timeout';
  findingCount: number;
  message?: string;
  durationMs?: number;
};

export type AssetManifestItem = {
  path: string;
  kind: 'instruction' | 'script' | 'config' | 'dependency' | 'data' | 'other';
  sizeBytes?: number;
};

export type SkillPreviewFile = {
  path: string;
  kind: AssetManifestItem['kind'];
  sizeBytes?: number;
  lineCount?: number;
  content?: string;
};

export type SkillPreview = {
  files: SkillPreviewFile[];
  stats: Array<{ kind: string; count: number; lines: number }>;
  defaultExpanded?: string;
};

export type ScanTaskStatus =
  | 'completed'
  | 'partial_completed'
  | 'completed_with_high_risk'
  | 'failed';

export type CapabilityScanResult = {
  taskId: string;
  status: ScanTaskStatus;
  strategy: ScanStrategy;
  artifactKind: ScanArtifactKind;
  summary: string;
  overallRisk: ScanSeverity;
  suggestedAction?: SuggestedAction;
  riskSummary?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  findings: UnifiedFinding[];
  /** 引擎合并后、复审前的原始命中（供追溯） */
  rawFindings?: UnifiedFinding[];
  dispositionSummary?: {
    confirmed: number;
    suspected: number;
    hint: number;
    reference_sample: number;
    false_positive: number;
    formalRiskCount: number;
    summaryZh: string;
    summaryEn: string;
  };
  recommendations: string[];
  warnings: string[];
  engines: EngineRunStatus[];
  scannedFiles: { path: string }[];
  assetManifest?: AssetManifestItem[];
  skillPreview?: SkillPreview;
  truncated?: boolean;
};

export type EngineHealthStatus = {
  engine: string;
  available: boolean;
  required: boolean;
  phase: 'phase1' | 'phase2' | 'phase3' | 'online' | 'debug';
  path?: string;
  version?: string;
  message?: string;
};

export type EngineContext = {
  workDir: string;
  artifactKind: ScanArtifactKind;
  filePaths: string[];
  /** Passed to LLM engine when strategy includes llm */
  llm?: {
    zipBuffer?: Buffer;
    markdown?: string;
    fileName?: string;
    provider?: { id: string; config?: Record<string, unknown> };
  };
};

export type EngineAdapter = {
  name: string;
  run(ctx: EngineContext): Promise<{ findings: UnifiedFinding[]; status: EngineRunStatus }>;
};
