/**
 * API Response Types
 */

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string | { message?: string; code?: string }
  code?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface PaginationParams {
  limit?: number
  offset?: number
  page?: number
}

export interface SortParams {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface FilterParams {
  search?: string
  [key: string]: unknown
}

export interface ApiError {
  message: string
  code?: string
  status?: number
  details?: unknown
}

// Authentication Types

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: import('./entities').User
  expiresAt: string
}

export interface RefreshTokenRequest {
  refreshToken: string
}

export interface RefreshTokenResponse {
  token: string
  expiresAt: string
}

// Organization Types

export interface CreateOrganizationRequest {
  name: string
  slug: string
  planId?: string
}

export interface UpdateOrganizationRequest {
  name?: string
  slug?: string
  planId?: string
}

// User Management Types

export interface CreateUserRequest {
  email: string
  name: string
  role?: string
  teamIds?: string[]
  sendInvitation?: boolean
}

export interface UpdateUserRequest {
  name?: string
  role?: string
  teamIds?: string[]
  status?: 'active' | 'inactive' | 'suspended'
}

export interface ResetPasswordRequest {
  userId: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

// Team Management Types

export interface CreateTeamRequest {
  name: string
  description?: string
}

export interface UpdateTeamRequest {
  name?: string
  description?: string
}

export interface AddTeamMembersRequest {
  userIds: string[]
  role?: string
}

// Role Management Types

export interface CreateRoleRequest {
  name: string
  description?: string
  permissions: string[]
}

export interface UpdateRoleRequest {
  name?: string
  description?: string
  permissions?: string[]
}

// Invitation Management Types

export interface CreateInvitationRequest {
  email: string
  role?: string
  teamIds?: string[]
  expiresInDays?: number
}

export interface BatchCreateInvitationsRequest {
  invitations: Array<{
    email: string
    role?: string
    teamIds?: string[]
  }>
  expiresInDays?: number
}

// Vulnerability Management Types

export interface CreateVulnerabilityRequest {
  avdId?: string
  name: string
  type: 'agent' | 'mcp' | 'llm' | 'tool' | 'platform' | 'dify' | 'coze' | 'fastgpt' | 'n8n'
  category: string
  riskLevel: 'critical' | 'high' | 'medium' | 'low'
  status?: 'discovered' | 'confirmed' | 'patched' | 'archived'
  disclosedAt?: string
  description: string
  affectedTargets: Array<{
    type: string
    versions?: string[]
  }>
  impactScope: string
  cweId?: string
  mitreId?: string
  owaspId?: string
  owaspLlmTop10Mapping?: Record<string, unknown>
  exploitability?: Record<string, unknown>
  patchStatus?: Record<string, unknown>
  auditNotes?: string
  tags: string[]
  metadata?: Record<string, unknown>
}

export interface UpdateVulnerabilityRequest {
  name?: string
  category?: string
  riskLevel?: 'critical' | 'high' | 'medium' | 'low'
  status?: 'discovered' | 'confirmed' | 'patched' | 'archived'
  description?: string
  affectedTargets?: Array<{
    type: string
    versions?: string[]
  }>
  impactScope?: string
  tags?: string[]
}

// Attack Task Types

export interface CreateAttackTaskRequest {
  name: string
  description?: string
  teamId?: string
  targetType: 'agent' | 'mcp' | 'llm' | 'tool' | 'platform' | 'composite'
  targetConfig: Record<string, unknown>
  vulnerabilities: string[]
  attackMode: 'simple' | 'conversation' | 'composite'
  compositeAttackConfig?: Record<string, unknown>
  detectionConfig: {
    useRule: boolean
    useLLM: boolean
    useKnowledgeBase: boolean
    ruleSetId?: string
    llmConfig?: {
      model?: string
      confidenceThreshold?: number
      successDescription?: string
    }
  }
  agentConfig?: {
    enabled: boolean
    provider?: string
    model?: string
    temperature?: number
  }
  metadata?: Record<string, unknown>
  /** Same shape as metadata.configAudit; sent at top level so server always receives export text for workflow_config_assets. */
  configAudit?: {
    yaml?: string
    json?: string
    fileName?: string
  }
  /** MySQL v4 — optional product task type & execution hints */
  taskTypeId?: string
  platformFamily?: string
  scanMode?: 'static' | 'runtime' | 'hybrid'
  entrypointType?: string
  artifactRefs?: Record<string, unknown> | unknown[]
  judgeConfig?: Record<string, unknown>
  reportPreference?: Record<string, unknown>
  scheduleConfig?: Record<string, unknown>
  retestOfTaskId?: string
  baselineTaskId?: string
  /** Create workflow_config_assets from metadata.configAudit when supported (MySQL/PG). */
  saveWorkflowConfigAsset?: boolean
}

export interface RunTaskRequest {
  taskId: string
  configAudit?: {
    yaml?: string
    json?: string
    fileName?: string
  }
}

export interface CancelTaskRequest {
  taskId: string
}

export interface TaskResultsResponse {
  taskId: string
  results: import('./entities').AttackResult[]
}

// Target Agent Types

export interface CreateTargetAgentRequest {
  name: string
  description?: string
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
    | 'other'
  icon?: string
  config: Record<string, unknown>
  metadata?: Record<string, unknown>
  status?: 'active' | 'inactive' | 'testing' | 'error'
}

export interface UpdateTargetAgentRequest {
  name?: string
  description?: string
  type?:
    | 'dify'
    | 'coze'
    | 'n8n'
    | 'fastgpt'
    | 'tencent-adp'
    | 'api'
    | 'api-stream'
    | 'langchain'
    | 'custom'
    | 'other'
  icon?: string
  config?: Record<string, unknown>
  status?: 'active' | 'inactive' | 'testing' | 'error'
  metadata?: Record<string, unknown>
}

export interface TestAgentRequest {
  /** Draft config merged over saved agent config for a single connection test. */
  config?: Record<string, unknown>
}

export interface AgentStatusResponse {
  agentId: string
  status: 'active' | 'inactive' | 'testing' | 'error'
  healthStatus: {
    lastCheck: string
    status: 'healthy' | 'unhealthy' | 'unknown'
    responseTime?: number
  }
  statistics: {
    totalAttacks: number
    successfulAttacks: number
    vulnerabilitiesFound: number
  }
}

// Report Types

export interface GenerateReportRequest {
  taskId: string
  format?: 'md' | 'html' | 'pdf' | 'docx'
  includeDetails?: boolean
  includeCharts?: boolean
}

export interface ReportDownloadRequest {
  reportId: string
  format?: 'md' | 'html' | 'pdf' | 'docx'
}

// Findings API Types

export interface ListFindingsParams extends PaginationParams, FilterParams {
  riskLevel?: 'critical' | 'high' | 'medium' | 'low'
  status?: 'open' | 'under_review' | 'accepted' | 'fixed'
  from?: string
  to?: string
  agentId?: string
  taskId?: string
}

export interface UpdateFindingRequest {
  status?: 'open' | 'under_review' | 'accepted' | 'fixed'
  auditNotes?: string
}

export interface RetestFindingRequest {
  mode?: 'finding_scoped' | 'full_task'
  nameSuffix?: string
  autoStart?: boolean
  configAudit?: {
    yaml?: string
    json?: string
    fileName?: string
  }
}

export interface RetestFindingResponse {
  task: import('./entities').AttackTask
  taskId: string
  started: boolean
}

export type TimelineEventType = 'scan' | 'test' | 'finding' | 'retest' | 'conclusion'

export type TimelineEventStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'

export interface FindingTimelineEvent {
  id: string
  type: TimelineEventType
  title: string
  summary?: string
  at: string
  status: TimelineEventStatus
  refs?: { taskId?: string; findingId?: string; scanRunId?: string }
  parentEventId?: string
  retestFindingStatus?: 'old_fixed' | 'old_unfixed' | 'new' | 'unknown'
  retestFindingStatusReason?: string
}

export interface FindingTimelineData {
  events: FindingTimelineEvent[]
  agentId?: string
  agentName?: string
  baselineTaskId: string
  highlightFindingId: string
}

// Subscription Types

export interface SubscribeRequest {
  planId: string
  billingCycle: 'monthly' | 'quarterly' | 'yearly'
  paymentMethodId?: string
}

export interface ChangePlanRequest {
  newPlanId: string
  billingCycle?: 'monthly' | 'quarterly' | 'yearly'
}

// Quota Types

export interface QuotaUsageResponse {
  organizationId: string
  period: string
  quotas: Record<string, {
    used: number
    limit: number
  }>
  updatedAt: string
}

export interface CheckQuotaRequest {
  action: string
  resource?: string
}

export interface CheckQuotaResponse {
  allowed: boolean
  quota?: {
    used: number
    limit: number
  }
  resetAt?: string
}

// System Config Types

export interface UpdateSystemConfigRequest {
  value: Record<string, unknown>
  description?: string
  editable?: boolean
  requiresRestart?: boolean
}

export interface UpdateFeatureFlagRequest {
  enabled: boolean
}

export interface TestIntegrationRequest {
  integrationId: string
}

// Audit Types

export interface AuditLogsRequest extends PaginationParams, SortParams, FilterParams {
  userId?: string
  action?: string
  resourceType?: string
  dateFrom?: string
  dateTo?: string
}

// WebSocket Types

export interface WebSocketMessage {
  type: string
  data: Record<string, unknown>
  timestamp: string
}

export interface TaskUpdateMessage extends WebSocketMessage {
  type: 'task.update'
  data: {
    taskId: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled'
    progress?: number
    currentStep?: string
    message?: string
  }
}

export interface VulnerabilityFoundMessage extends WebSocketMessage {
  type: 'vulnerability.found'
  data: {
    taskId: string
    vulnerabilityId: string
    vulnerabilityName: string
    riskLevel: 'critical' | 'high' | 'medium' | 'low'
    evidence: string
  }
}

export interface AgentHealthUpdateMessage extends WebSocketMessage {
  type: 'agent.health.update'
  data: {
    agentId: string
    status: 'healthy' | 'unhealthy' | 'unknown'
    responseTime?: number
  }
}
