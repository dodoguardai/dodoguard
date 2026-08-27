/**
 * Vulnerabilities API Service
 */

import apiClient, { handleApiResponse } from './client';
import type {
  Vulnerability,
  AttackCommand,
  DetectionRule,
  Solution,
  LlmReviewInstruction,
  SuccessIndicator,
  FailureIndicator,
  WafRule,
  AgentGuardStrategy,
  SocAlertRule,
  ComplianceStatement,
} from '@/types/entities';
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  FilterParams,
  CreateVulnerabilityRequest,
  UpdateVulnerabilityRequest,
} from '@/types/api';

export const vulnerabilitiesApi = {
  /**
   * List vulnerabilities
   */
  list: async (
    params?: PaginationParams &
      FilterParams & {
        type?: Vulnerability['type'];
        riskLevel?: Vulnerability['riskLevel'];
        category?: string;
        status?: Vulnerability['status'];
        verificationMode?: Vulnerability['verificationMode'];
        /** When true, `verificationMode=api_blackbox` matches only exact `api_blackbox` (no runtime/hybrid aliases). */
        verificationModeStrict?: boolean;
        /** ISO datetime; rows with `created_at` strictly before this value. */
        createdBefore?: string;
        /** SQL `id LIKE %fragment%` (server-side filter). */
        idContains?: string;
      },
  ): Promise<PaginatedResponse<Vulnerability>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Vulnerability>>>(
      '/vulnerabilities',
      { params },
    );
    return handleApiResponse(response.data);
  },

  /**
   * Get vulnerability by ID
   */
  get: async (id: string): Promise<Vulnerability> => {
    const response = await apiClient.get<ApiResponse<Vulnerability>>(
      `/vulnerabilities/${encodeURIComponent(id)}`,
    );
    return handleApiResponse(response.data);
  },

  /** List vulnerabilities whose primary key id contains the given fragment. */
  listByIdContains: async (fragment: string, limit = 200): Promise<Vulnerability[]> => {
    const trimmed = fragment.trim();
    if (!trimmed) {
      return [];
    }
    const page = await vulnerabilitiesApi.list({ idContains: trimmed, limit });
    return page.data.filter((v) => v.id.includes(trimmed));
  },

  /** Fetch multiple vulnerabilities by id (parallel GET; skips missing ids). */
  getByIds: async (ids: string[]): Promise<Vulnerability[]> => {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const rows = await Promise.all(
      unique.map(async (id) => {
        try {
          return await vulnerabilitiesApi.get(id);
        } catch {
          return null;
        }
      }),
    );
    const byId = new Map(rows.filter((v): v is Vulnerability => v != null).map((v) => [v.id, v]));
    return unique.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  },

  /**
   * Create new vulnerability
   */
  create: async (data: CreateVulnerabilityRequest): Promise<Vulnerability> => {
    const response = await apiClient.post<ApiResponse<Vulnerability>>('/vulnerabilities', data);
    return handleApiResponse(response.data);
  },

  /**
   * Update vulnerability
   */
  update: async (id: string, data: UpdateVulnerabilityRequest): Promise<Vulnerability> => {
    const response = await apiClient.put<ApiResponse<Vulnerability>>(
      `/vulnerabilities/${id}`,
      data,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Delete vulnerability
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/vulnerabilities/${id}`);
  },

  /**
   * Get attack commands for vulnerability
   */
  getAttackCommands: async (vulnerabilityId: string): Promise<AttackCommand[]> => {
    const response = await apiClient.get<ApiResponse<AttackCommand[]>>(
      `/vulnerabilities/${vulnerabilityId}/attack-commands`,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Create attack command
   */
  createAttackCommand: async (
    vulnerabilityId: string,
    data: Partial<AttackCommand>,
  ): Promise<AttackCommand> => {
    const response = await apiClient.post<ApiResponse<AttackCommand>>(
      `/vulnerabilities/${vulnerabilityId}/attack-commands`,
      data,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Update attack command
   */
  updateAttackCommand: async (
    vulnerabilityId: string,
    commandId: string,
    data: Partial<AttackCommand>,
  ): Promise<AttackCommand> => {
    const response = await apiClient.put<ApiResponse<AttackCommand>>(
      `/vulnerabilities/${vulnerabilityId}/attack-commands/${commandId}`,
      data,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Delete attack command
   */
  deleteAttackCommand: async (vulnerabilityId: string, commandId: string): Promise<void> => {
    await apiClient.delete(`/vulnerabilities/${vulnerabilityId}/attack-commands/${commandId}`);
  },

  /**
   * Get detection rules for vulnerability
   */
  getDetectionRules: async (vulnerabilityId: string): Promise<DetectionRule[]> => {
    const response = await apiClient.get<ApiResponse<DetectionRule[]>>(
      `/vulnerabilities/${vulnerabilityId}/detection-rules`,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Create detection rule
   */
  createDetectionRule: async (
    vulnerabilityId: string,
    data: Partial<DetectionRule>,
  ): Promise<DetectionRule> => {
    const response = await apiClient.post<ApiResponse<DetectionRule>>(
      `/vulnerabilities/${vulnerabilityId}/detection-rules`,
      data,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Delete detection rule
   */
  deleteDetectionRule: async (vulnerabilityId: string, ruleId: string): Promise<void> => {
    await apiClient.delete(`/vulnerabilities/${vulnerabilityId}/detection-rules/${ruleId}`);
  },

  /**
   * Get solutions for vulnerability
   */
  getSolutions: async (vulnerabilityId: string): Promise<Solution[]> => {
    const response = await apiClient.get<ApiResponse<Solution[]>>(
      `/vulnerabilities/${vulnerabilityId}/solutions`,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Create solution
   */
  createSolution: async (vulnerabilityId: string, data: Partial<Solution>): Promise<Solution> => {
    const response = await apiClient.post<ApiResponse<Solution>>(
      `/vulnerabilities/${vulnerabilityId}/solutions`,
      data,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Delete solution
   */
  deleteSolution: async (vulnerabilityId: string, solutionId: string): Promise<void> => {
    await apiClient.delete(`/vulnerabilities/${vulnerabilityId}/solutions/${solutionId}`);
  },

  /**
   * LLM review instructions for vulnerability
   */
  getLlmReviewInstructions: async (
    vulnerabilityId: string,
  ): Promise<LlmReviewInstruction[]> => {
    const response = await apiClient.get<ApiResponse<LlmReviewInstruction[]>>(
      `/vulnerabilities/${vulnerabilityId}/llm-review-instructions`,
    );
    return handleApiResponse(response.data);
  },

  createLlmReviewInstruction: async (
    vulnerabilityId: string,
    data: {
      name: string
      type: string
      content: string
      description?: string
      model?: string
      temperature?: number
      maxTokens?: number
      enabled?: boolean
      priority?: number
      metadata?: Record<string, unknown>
    },
  ): Promise<LlmReviewInstruction> => {
    const response = await apiClient.post<ApiResponse<LlmReviewInstruction>>(
      `/vulnerabilities/${vulnerabilityId}/llm-review-instructions`,
      data,
    );
    return handleApiResponse(response.data);
  },

  updateLlmReviewInstruction: async (
    vulnerabilityId: string,
    instructionId: string,
    data: Partial<{
      name: string
      type: string
      content: string
      description: string
      model: string
      temperature: number
      maxTokens: number
      enabled: boolean
      priority: number
      metadata: Record<string, unknown>
    }>,
  ): Promise<LlmReviewInstruction> => {
    const response = await apiClient.put<ApiResponse<LlmReviewInstruction>>(
      `/vulnerabilities/${vulnerabilityId}/llm-review-instructions/${instructionId}`,
      data,
    );
    return handleApiResponse(response.data);
  },

  deleteLlmReviewInstruction: async (
    vulnerabilityId: string,
    instructionId: string,
  ): Promise<void> => {
    await apiClient.delete(
      `/vulnerabilities/${vulnerabilityId}/llm-review-instructions/${instructionId}`,
    );
  },

  /**
   * Get success indicators for vulnerability
   */
  getSuccessIndicators: async (vulnerabilityId: string): Promise<SuccessIndicator[]> => {
    const response = await apiClient.get<ApiResponse<SuccessIndicator[]>>(
      `/vulnerabilities/${vulnerabilityId}/success-indicators`,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Get failure indicators for vulnerability
   */
  getFailureIndicators: async (vulnerabilityId: string): Promise<FailureIndicator[]> => {
    const response = await apiClient.get<ApiResponse<FailureIndicator[]>>(
      `/vulnerabilities/${vulnerabilityId}/failure-indicators`,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Get WAF rules for vulnerability
   */
  getWafRules: async (vulnerabilityId: string): Promise<WafRule[]> => {
    const response = await apiClient.get<ApiResponse<WafRule[]>>(
      `/vulnerabilities/${vulnerabilityId}/waf-rules`,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Get agent guard strategies for vulnerability
   */
  getAgentGuardStrategies: async (vulnerabilityId: string): Promise<AgentGuardStrategy[]> => {
    const response = await apiClient.get<ApiResponse<AgentGuardStrategy[]>>(
      `/vulnerabilities/${vulnerabilityId}/agent-guard-strategies`,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Get SOC alert rules for vulnerability
   */
  getSocAlertRules: async (vulnerabilityId: string): Promise<SocAlertRule[]> => {
    const response = await apiClient.get<ApiResponse<SocAlertRule[]>>(
      `/vulnerabilities/${vulnerabilityId}/soc-alert-rules`,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Get compliance statements for vulnerability
   */
  getComplianceStatements: async (vulnerabilityId: string): Promise<ComplianceStatement[]> => {
    const response = await apiClient.get<ApiResponse<ComplianceStatement[]>>(
      `/vulnerabilities/${vulnerabilityId}/compliance-statements`,
    );
    return handleApiResponse(response.data);
  },
};
