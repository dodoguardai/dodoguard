/**
 * Core Entity Types
 */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  icon?: string; // Supports icon name or image URL/base64
  planId?: string;
  subscriptionId?: string;
  status: 'active' | 'inactive' | 'suspended';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  avatar?: string;
  role: string | string[];
  status: 'active' | 'inactive' | 'pending' | 'suspended';
  emailVerified: boolean;
  mfaEnabled: boolean;
  lastLoginAt?: string;
  lastActivityAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  teams?: Array<{
    id: string;
    name: string;
    logo?: string;
    role?: string;
    joinedAt?: string;
  }>;
  teamIds?: string[];
}

export interface Team {
  id: string;
  organizationId: string;
  name: string;
  logo?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  organization?: {
    id: string;
    name: string;
  };
  members?: Array<{
    userId: string;
    role: string;
    joinedAt: string;
    user: {
      id: string;
      name: string;
      email: string;
      avatar?: string;
    };
  }>;
  memberCount?: number;
}

export interface Role {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: 'system' | 'custom';
  permissions: string[];
  isDefault: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  scope: 'organization' | 'team' | 'own';
  description?: string;
  createdAt: string;
}

export interface TargetAgent {
  id: string;
  organizationId: string;
  teamId?: string;
  name: string;
  description?: string;
  type:
    | 'dify'
    | 'coze'
    | 'n8n'
    | 'fastgpt'
    | 'tencent-adp'
    | 'api'
    | 'api-stream'
    | 'langchain'
    | 'custom'
    | 'other';
  config: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  icon?: string; // Icon name from lucide-react (e.g., 'Monitor', 'Server', 'Bot')
  status: 'active' | 'inactive' | 'testing' | 'error';
  healthStatus?: {
    lastCheck: string;
    status: 'healthy' | 'unhealthy' | 'unknown';
    responseTime?: number;
  };
  statistics?: {
    totalAttacks: number;
    successfulAttacks: number;
    vulnerabilitiesFound: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type AgentAssetComponentType =
  | 'tool'
  | 'skill'
  | 'mcp'
  | 'model'
  | 'knowledge_base'
  | 'workflow'
  | 'api';

export interface AgentAssetComponent {
  id: string;
  organizationId: string;
  assetId: string;
  componentType: AgentAssetComponentType;
  componentName: string;
  componentKey?: string | null;
  version?: string | null;
  sourceType?: string | null;
  sourceRefId?: string | null;
  highRisk: boolean;
  sensitiveLevel?: string | null;
  permissionScope?: Record<string, unknown>;
  configSnapshot?: Record<string, unknown>;
  componentFingerprint?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetOwnership {
  id: string;
  organizationId: string;
  assetId: string;
  ownerType: 'business' | 'developer' | 'security' | 'ops';
  userId?: string | null;
  ownerName?: string | null;
  department?: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetLifecycleEvent {
  id: string;
  organizationId: string;
  assetId: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorId?: string | null;
  eventDetail?: Record<string, unknown>;
  createdAt: string;
}

export interface AgentAssetSnapshot {
  id: string;
  organizationId: string;
  assetId: string;
  snapshotType: string;
  version: string;
  contentHash: string;
  snapshotJson: Record<string, unknown>;
  createdAt: string;
}

/**
 * Linked library IDs stored in `metadata` for an AgentAsset.
 * Serialised as JSON inside the `metadata` jsonb column.
 */
export interface AgentAssetLinkedLibs {
  /** IDs of CapabilityRiskLibrary records (agent-level, beyond component-level refs) */
  linkedCapabilityRiskIds?: string[];
  /** governance workflow object stored by the backend */
  governanceWorkflow?: Record<string, unknown>;
  /** Runtime connection settings for calling the Agent under test. */
  runtimeConfig?: Record<string, unknown>;
  /** Uploaded config/export files attached during asset intake. */
  configFiles?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface AgentAsset {
  id: string;
  organizationId: string;
  teamId?: string | null;
  legacyId?: string | null;
  assetCode: string;
  name: string;
  agentType: string;
  platformFamily: string;
  externalId?: string | null;
  sourceType: string;
  environment: string;
  runtimeStatus: string;
  lifecycleStatus: string;
  admissionStatus: string;
  businessScene?: string | null;
  businessSystem?: string | null;
  functionIntro: string;
  riskLevel: string;
  exposureLevel: string;
  exposureSurface?: string | null;
  sensitiveData: boolean;
  version: string;
  defaultModel?: string | null;
  tags?: string[];
  metadata?: AgentAssetLinkedLibs;
  owners?: AssetOwnership[];
  components?: AgentAssetComponent[];
  snapshots?: AgentAssetSnapshot[];
  events?: AssetLifecycleEvent[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PlatformDiscoveredAsset {
  id: string;
  organizationId: string;
  connectorId?: string | null;
  platformFamily: string;
  externalId: string;
  rawName: string;
  rawStatus?: string | null;
  guessTeam?: string | null;
  claimStatus: 'pending' | 'claimed' | 'ignored';
  claimedAssetId?: string | null;
  rawPayload?: Record<string, unknown>;
  discoveredAt: string;
  updatedAt: string;
}

export interface PlatformConnector {
  id: string;
  organizationId: string;
  platformFamily: string;
  name: string;
  endpoint?: string | null;
  credentialRef?: string | null;
  syncConfig?: Record<string, unknown>;
  status: 'active' | 'disabled' | 'error';
  lastSyncAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Populated on running tasks: vulnerability groups completed vs total (see backend metadata.runProgress). */
export interface AttackTaskRunProgress {
  completed: number;
  total: number;
  updatedAt?: string;
}

export interface AttackTask {
  id: string;
  organizationId: string;
  teamId?: string;
  userId: string;
  name: string;
  description?: string;
  targetType: 'agent' | 'mcp' | 'llm' | 'tool' | 'platform' | 'composite';
  targetConfig: Record<string, unknown>;
  vulnerabilities: string[];
  attackMode: 'simple' | 'conversation' | 'composite';
  compositeAttackConfig?: Record<string, unknown>;
  detectionConfig: {
    useRule: boolean;
    useLLM: boolean;
    useKnowledgeBase: boolean;
    ruleSetId?: string;
    detectionMode?: 'rule' | 'llm';
    llmConfig?: {
      model?: string;
      prompt?: string;
      confidenceThreshold?: number;
      successDescription?: string;
    };
  };
  agentConfig?: {
    enabled: boolean;
    provider?: string;
    model?: string;
    temperature?: number;
  };
  /**
   * Status lifecycle:
   * - pending: task is configured but has not started a successful run yet (or is queued)
   * - running: a background execution is currently in progress
   * - completed: the most recent run finished successfully
   * - failed: the most recent run ended with an error
   * - canceled: execution was explicitly canceled mid-run
   */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  /** May include `runProgress` (AttackTaskRunProgress) and `runLogs` during/after runs. */
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** MySQL v4 (optional) */
  taskTypeId?: string | null;
  platformFamily?: string | null;
  scanMode?: 'static' | 'runtime' | 'hybrid' | string | null;
  entrypointType?: string | null;
  artifactRefs?: Record<string, unknown> | unknown[] | null;
  judgeConfig?: Record<string, unknown> | null;
  reportPreference?: Record<string, unknown> | null;
  scheduleConfig?: Record<string, unknown> | null;
  retestOfTaskId?: string | null;
  baselineTaskId?: string | null;
}

/** Row from GET /attack-tasks/task-types */
export interface TaskType {
  id: string;
  code: string;
  name: string;
  platformFamily?: string | null;
  defaultScanMode?: string | null;
  defaultReportType?: string | null;
  description?: string | null;
  enabled?: boolean;
}

export interface AttackResult {
  id: string;
  taskId: string;
  vulnerabilityId: string;
  commandId: string;
  attackMode: 'simple' | 'conversation' | 'composite';
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  conversationHistory?: Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;
  detectionResults?: {
    /** Persisted from rule-judge (config_static / config_audit). */
    ruleHits?: FindingDetectionRuleResult[];
    llmEvidence?: {
      evidencePaths?: string[];
      evidenceSnippets?: string[];
    };
    ruleResults?: Array<{
      ruleId: string;
      ruleName: string;
      matched: boolean;
      evidence?: string;
      severity: string;
      confidence: number;
    }>;
    llmResult?: {
      vulnerable: boolean;
      confidence: number;
      reasoning?: string;
      riskLevel: string;
    };
    knowledgeBaseResult?: {
      vulnerable: boolean;
      confidence: number;
      similarCases?: Array<{
        caseId: string;
        similarity: number;
      }>;
    };
  };
  finalVerdict: {
    vulnerable: boolean;
    confidence: number;
    reason?: string;
    riskLevel: 'critical' | 'high' | 'medium' | 'low';
  };
  agentActions?: Array<{
    action: string;
    timestamp: string;
    details: Record<string, unknown>;
  }>;
  createdAt: string;
  /** MySQL v4 raw result linkage */
  scanRunId?: string | null;
  normalizedStatus?: string | null;
  rawResultType?: string | null;
  platformFamily?: string | null;
}

export interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  runningTasks: number;
  failedTasks: number;
  totalVulnerabilities: number;
  criticalVulnerabilities: number;
  highVulnerabilities: number;
  mediumVulnerabilities: number;
  lowVulnerabilities: number;
  activeAgents: number;
  quotaUsage: {
    attackTasksPerMonth: { used: number; limit: number };
    reportsPerMonth: { used: number; limit: number };
    apiCallsPerMonth: { used: number; limit: number };
  };
  systemHealth: {
    status: 'healthy' | 'degraded' | 'down';
    database: 'online' | 'offline';
    cache: 'online' | 'offline';
    queue: 'online' | 'offline';
  };
  riskDistribution: Array<{
    level: 'critical' | 'high' | 'medium' | 'low';
    count: number;
    percentage: number;
  }>;
  recentHighRiskFindings: Array<{
    id: string;
    vulnerabilityId: string;
    vulnerabilityName: string;
    agentId: string;
    agentName: string;
    riskLevel: 'critical' | 'high' | 'medium' | 'low';
    detectedAt: string;
  }>;
  /** Last 12 months attack task count per month (for Activity Overview chart) */
  monthlyActivity?: Array<{ name: string; total: number }>;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  type: 'free' | 'starter' | 'professional' | 'enterprise' | 'custom';
  priceMonthly?: number;
  priceQuarterly?: number;
  priceYearly?: number;
  quotas: Record<string, number>;
  features: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSubscription {
  id: string;
  organizationId: string;
  planId: string;
  billingCycle: 'monthly' | 'quarterly' | 'yearly' | 'one_time';
  status: 'active' | 'canceled' | 'expired' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  price: number;
  currency: string;
  paymentMethodId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface QuotaUsage {
  organizationId: string;
  period: string;
  quotas: Record<
    string,
    {
      used: number;
      limit: number;
    }
  >;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  userId?: string;
  teamId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

// Vulnerability Management Types

export interface Vulnerability {
  id: string;
  avdId: string;
  name: string;
  type: 'agent' | 'mcp' | 'llm' | 'tool' | 'platform' | 'dify' | 'coze' | 'fastgpt' | 'n8n';
  category: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  cvssScore?: number; // CVSS score (0.0-10.0)
  status: 'discovered' | 'confirmed' | 'patched' | 'archived';
  verificationMode?: 'api_blackbox' | 'config_audit' | string;
  disclosedAt?: string;
  description: string;
  affectedTargets: Array<{
    type: string;
    versions?: string[];
  }>;
  impactScope: string;
  cweId?: string;
  mitreId?: string;
  owaspId?: string;
  owaspLlmTop10Mapping?: Record<string, unknown>;
  exploitability?: Record<string, unknown>;
  patchStatus?: Record<string, unknown>;
  auditNotes?: string;
  tags: string[];
  /** Enabled attack commands for this vulnerability (MySQL list API); drives task execution count per vuln. */
  enabledAttackCommandCount?: number;
  // 新增字段：成功/失败指标
  successIndicators?: SuccessIndicator[];
  failureIndicators?: FailureIndicator[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  createdByUser?: {
    id: string;
    name: string;
    email: string;
  };
  updatedByUser?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface AttackCommand {
  id: string;
  vulnerabilityId: string;
  name: string;
  content: string;
  attackMode: 'direct' | 'mixed' | 'conversation' | 'composite';
  expectedSuccess: string;
  nonVulnerability: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DetectionRule {
  id: string;
  vulnerabilityId: string;
  name: string;
  type: 'regex' | 'keyword' | 'json_schema' | 'llm' | 'knowledge_base';
  pattern: string;
  severity: string;
  confidence: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Solution {
  id: string;
  vulnerabilityId: string;
  title: string;
  description: string;
  steps: Array<{
    order: number;
    title: string;
    description: string;
    commands?: string[];
  }>;
  references: Array<{
    title: string;
    url: string;
  }>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** LLM review / grading instructions attached to a vulnerability (API: llm-review-instructions) */
export interface LlmReviewInstruction {
  id: string;
  vulnerabilityId: string;
  name: string;
  type: string;
  content: string;
  description?: string | null;
  model?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  enabled: boolean;
  priority: number;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuccessIndicator {
  id: string;
  vulnerabilityId: string;
  name: string;
  type: 'regex' | 'keyword' | 'json_schema' | 'llm' | 'status_code' | 'response_time';
  pattern: string;
  description: string;
  confidence: number;
  severity: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FailureIndicator {
  id: string;
  vulnerabilityId: string;
  name: string;
  type: 'regex' | 'keyword' | 'json_schema' | 'llm' | 'status_code' | 'error_message';
  pattern: string;
  description: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WafRule {
  id: string;
  vulnerabilityId: string;
  name: string;
  pattern?: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGuardStrategy {
  id: string;
  vulnerabilityId: string;
  name: string;
  config?: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SocAlertRule {
  id: string;
  vulnerabilityId: string;
  name: string;
  config?: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceStatement {
  id: string;
  vulnerabilityId: string;
  name: string;
  description?: string;
  standard?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Report Types

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  htmlTemplate: string;
  styles: string;
  sections: Array<{
    id: string;
    name: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  taskId?: string | null;
  organizationId: string;
  templateId?: string;
  reportType?:
    | 'attack_task'
    | 'dify_config_audit'
    | 'dify_config_static'
    | 'skills_md_audit'
    | 'mcp_source_audit'
    | 'coze_config_audit'
    | 'coze_config_static'
    | 'fastgpt_config_audit'
    | 'fastgpt_config_static'
    | 'n8n_config_audit'
    | 'qna_excel_manual'
    | 'compliance_assessment';
  title?: string | null;
  format: 'md' | 'html' | 'pdf' | 'docx';
  content?: string;
  filePath?: string;
  fileSize?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  /** MySQL v4 */
  reportRunId?: string | null;
  status?: string | null;
  sourceFindingIds?: string[] | null;
}

// System Configuration Types

export interface SystemConfig {
  id: string;
  category: 'global' | 'feature' | 'integration' | 'notification' | 'security';
  key: string;
  value: Record<string, unknown>;
  type: 'string' | 'number' | 'boolean' | 'json' | 'array';
  description?: string;
  editable: boolean;
  requiresRestart: boolean;
  updatedBy?: string;
  updatedAt: string;
}

export interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
  affects: string[];
  updatedBy?: string;
  updatedAt: string;
}

export interface IntegrationConfig {
  id: string;
  type: 'llm' | 'vector_db' | 'payment' | 'sso' | 'webhook' | 'email' | 'sms';
  name: string;
  provider: string;
  config: Record<string, unknown>;
  enabled: boolean;
  testStatus?: 'pending' | 'success' | 'failed';
  lastTested?: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface NotificationConfig {
  id: string;
  type: 'email' | 'sms' | 'webhook' | 'slack' | 'teams';
  enabled: boolean;
  config: Record<string, unknown>;
  templates: Record<string, unknown>;
  rules: Array<{
    event: string;
    conditions: Record<string, unknown>;
    actions: string[];
  }>;
  updatedBy?: string;
  updatedAt: string;
}

export interface SecurityPolicy {
  id: string;
  name: string;
  type: 'password' | 'api_key' | 'session' | 'ip_whitelist' | 'rate_limit' | 'audit';
  config: Record<string, unknown>;
  enabled: boolean;
  updatedBy?: string;
  updatedAt: string;
}

// Invitation Types

export interface UserInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  teamIds: string[];
  invitedBy: string;
  token: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  acceptedAt?: string;
  acceptedBy?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// Activity Types

export interface UserActivity {
  id: string;
  userId: string;
  organizationId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface UserTeam {
  userId: string;
  teamId: string;
  role: string;
  permissions: string[];
  joinedAt: string;
}

// Agent Attack History Types

export interface AgentAttackHistory {
  id: string;
  agentId: string;
  taskId: string;
  taskName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  vulnerabilitiesFound: string[];
  startTime: string;
  endTime?: string;
  duration: number;
  reportId?: string;
  createdAt: string;
}

// Detection Scanning Types

export type DetectionRiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type DetectionScanStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'canceled';
export type DetectionCaseStatus = 'draft' | 'reviewing' | 'published' | 'archived';
export type CapabilityComponentKind = 'skill' | 'mcp' | 'tool' | 'model' | 'knowledge';
export type SecurityScanFindingStatus = 'open' | 'fixed' | 'accepted' | 'false_positive';
export type SecurityRemediationStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'evidence_submitted'
  | 'retesting'
  | 'closed'
  | 'reopened'
  | 'risk_accepted';
export type SecurityRetestStatus = 'not_started' | 'pending' | 'passed' | 'failed';
export type SecurityFinalDecision = 'closed' | 'rework' | 'risk_accepted';

export interface SecurityScanTaskPlan {
  id: string;
  organizationId: string;
  taskId: string;
  probeType: string;
  strategy: string;
  enabled: boolean;
  libIds?: string[];
  caseCount: number;
  targets?: Array<Record<string, unknown>>;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityScanTask {
  id: string;
  organizationId: string;
  assetId?: string | null;
  assetCode?: string | null;
  assetName?: string | null;
  assetVersion?: string | null;
  assetSnapshotId?: string | null;
  componentVersions?: Array<Record<string, unknown>>;
  name: string;
  source: string;
  scanType: string;
  targetKind: string;
  targetSummary?: string | null;
  status: DetectionScanStatus;
  progress: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  ownerName?: string | null;
  runConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  plans?: SecurityScanTaskPlan[];
}

export interface SecurityCaseLibrary {
  id: string;
  organizationId: string;
  libraryKey: string;
  title: string;
  domain: string;
  description: string;
  caseCount: number;
  enabled: boolean;
  defaultLevel: DetectionRiskLevel;
  detectMethod: string;
  status: DetectionCaseStatus;
  standards?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityTestCase {
  id: string;
  organizationId: string;
  libraryId: string;
  caseCode: string;
  name: string;
  attackType: string;
  prompt: string;
  expectedPass?: string | null;
  expectedFail?: string | null;
  riskLevel: DetectionRiskLevel;
  status: DetectionCaseStatus;
  tags?: string[];
  sortOrder: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceRegulationMapping {
  id: string;
  organizationId: string;
  mappingKey: string;
  law: string;
  article: string;
  rule: string;
  sourceText?: string | null;
  caseIds?: string[];
  libraryId?: string | null;
  policyId?: string | null;
  riskType: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type ComplianceAssessScenario = 'launch' | 'change' | 'periodic' | 'retest';

export interface ComplianceTaskTemplateLibrarySummary {
  id: string;
  libraryKey: string;
  title: string;
  domain: string;
  caseCount: number;
}

export interface ComplianceTaskTemplate {
  id: string;
  organizationId: string;
  templateKey?: string | null;
  name: string;
  domain: string;
  scope: string;
  description?: string | null;
  libraryKeys: string[];
  sampleTypes: string[];
  assessScenario: ComplianceAssessScenario;
  creationMode: 'ai' | 'manual';
  libCount: number;
  caseCount: number;
  icon?: string | null;
  tags: string[];
  ownerName?: string | null;
  isSystem: boolean;
  usageCount: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  libraries?: ComplianceTaskTemplateLibrarySummary[];
}

export interface CapabilityRiskLibrary {
  id: string;
  organizationId: string;
  registryId?: string | null;
  componentKind: CapabilityComponentKind;
  componentName: string;
  componentKey?: string | null;
  riskTitle: string;
  riskLevel: DetectionRiskLevel;
  source?: string | null;
  affectedAssets: number;
  ruleCount: number;
  description: string;
  checks?: string[];
  enabled: boolean;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityComponentArtifact {
  id: string;
  organizationId?: string;
  registryId?: string;
  fileName: string;
  contentHash: string;
  fileSize: number;
  fileTreeJson?: Array<{
    path: string;
    name: string;
    isDir: boolean;
    size?: number;
    kind?: string;
  }> | null;
  skillMdExcerpt?: string | null;
  createdAt: string;
}

export interface CapabilityComponentRegistry {
  id: string;
  organizationId: string;
  componentKind: CapabilityComponentKind;
  name: string;
  componentKey?: string | null;
  version?: string | null;
  description?: string | null;
  source?: string | null;
  permissionScope?: Record<string, unknown> | null;
  checks?: string[];
  riskLevel: DetectionRiskLevel;
  riskTitle?: string | null;
  enabled: boolean;
  status: string;
  hasPackage: boolean;
  lastDetectedAt?: string | null;
  metadata?: Record<string, unknown>;
  affectedAssets?: number;
  ruleCount?: number;
  riskLibraryId?: string | null;
  currentArtifact?: CapabilityComponentArtifact | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityComponentDetail extends CapabilityComponentRegistry {
  riskProfile?: CapabilityRiskLibrary | null;
  rules?: CapabilityRiskRule[];
  linkedAssets?: Array<{
    id: string;
    name: string;
    assetCode?: string | null;
    platformFamily?: string | null;
    status?: string | null;
  }>;
  linkedComponents?: AgentAssetComponent[];
}

export interface CapabilityRiskRule {
  id: string;
  organizationId: string;
  riskLibraryId: string;
  ruleCode: string;
  name: string;
  checkTarget: string;
  ruleType: string;
  severity: DetectionRiskLevel;
  ruleConfig?: Record<string, unknown>;
  remediation?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityScanFinding {
  id: string;
  organizationId: string;
  taskId: string;
  assetId?: string | null;
  assetVersion?: string | null;
  assetSnapshotId?: string | null;
  componentVersions?: Array<Record<string, unknown>>;
  caseLibraryId?: string | null;
  testCaseId?: string | null;
  title: string;
  riskLevel: DetectionRiskLevel;
  category: string;
  status: SecurityScanFindingStatus;
  description: string;
  evidence?: Record<string, unknown>;
  recommendation?: string | null;
  remediationTaskId?: string | null;
  acceptedReason?: string | null;
  detectedAt: string;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityRemediationEvidence {
  id: string;
  organizationId: string;
  remediationTaskId: string;
  evidenceType: string;
  title: string;
  content: string;
  attachments?: Array<Record<string, unknown>>;
  submittedBy?: string | null;
  submittedAt: string;
}

export interface SecurityRetestRecord {
  id: string;
  organizationId: string;
  remediationTaskId: string;
  findingId: string;
  retestTaskId?: string | null;
  retestAssetVersion?: string | null;
  retestSnapshotId?: string | null;
  result: Exclude<SecurityRetestStatus, 'not_started'>;
  conclusion?: string | null;
  evidence?: Record<string, unknown>;
  createdBy?: string | null;
  createdAt: string;
}

export interface SecurityRemediationTask {
  id: string;
  organizationId: string;
  findingId: string;
  taskId: string;
  assetId?: string | null;
  sourceAssetVersion?: string | null;
  sourceSnapshotId?: string | null;
  targetAssetVersion?: string | null;
  targetSnapshotId?: string | null;
  title: string;
  riskLevel: DetectionRiskLevel;
  status: SecurityRemediationStatus;
  ownerName?: string | null;
  ownerId?: string | null;
  dueAt?: string | null;
  remediationAdvice?: string | null;
  evidenceSummary?: string | null;
  retestStatus: SecurityRetestStatus;
  finalDecision?: SecurityFinalDecision | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  finding?: SecurityScanFinding;
  evidence?: SecurityRemediationEvidence[];
  retests?: SecurityRetestRecord[];
}

// Vulnerability Finding (from attack results / findings API)

export type FindingStatus = 'open' | 'under_review' | 'accepted' | 'fixed';

export type FindingRiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface FindingFinalVerdict {
  vulnerable: boolean;
  confidence: number;
  reason?: string;
  riskLevel?: FindingRiskLevel;
}

export interface FindingDetectionRuleResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  severity?: string;
  confidence: number;
  evidence?: string;
  /** 1-based line in evaluated text (UTF-16 indices for offsets). */
  startLine?: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
  matchStart?: number;
  matchEnd?: number;
  contextSnippet?: string;
  /** JSON Pointer into parsed YAML when match used selector. */
  logicalPath?: string;
  matchScope?: string;
}

export interface FindingLlmResult {
  vulnerable: boolean;
  confidence: number;
  reasoning?: string;
  riskLevel: string;
  evidencePaths?: string[];
  evidenceSnippets?: string[];
}

export interface FindingDetectionSummary {
  ruleResults?: FindingDetectionRuleResult[];
  llmResult?: FindingLlmResult;
  finalVerdict: FindingFinalVerdict & { riskLevel?: string };
}

export interface FindingConversationMessage {
  id: string;
  role: 'attacker' | 'agent';
  content: string;
  timestamp: string;
  sessionId?: string;
}

export interface Finding {
  id: string;
  taskId: string;
  vulnerabilityId: string;
  vulnerabilityName: string;
  agentId: string;
  agentName: string;
  riskLevel: FindingRiskLevel;
  status: FindingStatus;
  detectedAt: string;
  finalVerdict: FindingFinalVerdict;
  /** Backend: normalized row vs raw attack_result */
  source?: 'finding_records' | 'attack_result' | string;
  // Detail-only (from GET /findings/:id)
  vulnerability?: Vulnerability;
  task?: AttackTask;
  detectionSummary?: FindingDetectionSummary;
  conversation?: FindingConversationMessage[];
  solutions?: Solution[];
  runId?: string;
}
