/**
 * Report generation DTOs — kept separate from reportService to avoid circular imports
 * with markdown renderers and reportFormatFactory.
 */
export interface ReportData {
  taskId: string;
  organizationId: string;
  organizationName?: string;
  /**
   * MySQL v4：正文数据源。`finding_records` 表示由归一化发现行生成；否则为 `attack_results`。
   * PostgreSQL / SQLite 仅使用 `attack_results`。
   */
  resultsSource?: 'finding_records' | 'attack_results';
  /** task_types.code，如 dify_api_scan、dify_config_audit */
  taskTypeCode?: string;
  taskTypeName?: string;
  /** attack_tasks.platform_family：coze / dify 等，用于 API 黑盒报告模板分流 */
  platformFamily?: string | null;
  /** attack_tasks.metadata.taskKind */
  taskKind?: 'api_test' | 'config_audit' | 'config_static' | 'single_test';
  /** 原始 metadata，配置审计可含 configAuditStaticSummary */
  taskMetadata?: Record<string, unknown>;
  taskName?: string;
  taskDescription?: string;
  /** Display name of actual tested target, e.g. agent name */
  targetName?: string;
  targetType?: string;
  targetDisplayType?: string;
  attackMode?: string;
  createdAt?: string;
  vulnerabilities: Array<{
    id: string;
    name: string;
    riskLevel: string;
    /** vulnerabilities.type (agent/mcp/llm/tool/platform/dify/...) */
    type?: string;
    /** vulnerabilities.category (e.g. dify/network/...) */
    category?: string | null;
    /** vulnerabilities.tags (parsed array) */
    tags?: string[];
    /** vulnerabilities.verificationMode (api_blackbox/config_audit/...) */
    verificationMode?: string | null;
    description: string;
    affectedTargets: any[];
    exploitability: any;
    patchStatus: any;
    /** OWASP Agent / Agentic 映射标识（漏洞库 `owasp_id`） */
    owaspId?: string;
    /**
     * 漏洞库下验证命令条数（MySQL 从 `attack_commands` 聚合）；非 MySQL 或未查询时为 undefined，报告模板回退为本次任务结果条数。
     */
    verificationDataCount?: number;
    /**
     * 漏洞库下检测/验证规则条数（MySQL 从 `detection_rules` 按 vulnerability_id 聚合）；非 MySQL 或未查询时为 undefined。
     */
    detectionRulesCount?: number;
  }>;
  results: Array<{
    vulnerabilityId: string;
    vulnerabilityName?: string;
    commandId: string;
    verificationCommand?: string;
    expectedSuccess?: string;
    nonVulnerability?: string;
    attackMode: string;
    request: any;
    response: any;
    detectionResults: any;
    finalVerdict: any;
    createdAt: string;
  }>;
  summary: {
    totalVulnerabilities: number;
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
    executionTime: number;
    completedAt: string;
    totalFindings: number;
    vulnerableFindings: number;
    testStart?: string;
    testEnd?: string;
  };
  retestComparison?: {
    baselineLabel: string;
    currentLabel: string;
    baselineAt?: string;
    currentAt?: string;
    baselineRisk: { high: number; medium: number; low: number; total: number };
    currentRisk: { high: number; medium: number; low: number; total: number };
    fixedRiskIds: string[];
    unchangedRiskIds: string[];
    newRiskIds: string[];
  };
}
