/**
 * Attack Tasks API Service
 */

import apiClient, { handleApiResponse } from './client';
import type { AttackTask, TaskType } from '@/types/entities';
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  FilterParams,
  CreateAttackTaskRequest,
  RunTaskRequest,
  CancelTaskRequest,
  TaskResultsResponse,
} from '@/types/api';

export const tasksApi = {
  /**
   * Product task types (MySQL v4) — for wizard & labels
   */
  listTaskTypes: async (): Promise<TaskType[]> => {
    const response = await apiClient.get<ApiResponse<TaskType[]>>('/attack-tasks/task-types');
    return handleApiResponse(response.data);
  },

  /**
   * List attack tasks
   */
  list: async (
    params?: PaginationParams &
      FilterParams & {
        status?: AttackTask['status'];
        targetType?: AttackTask['targetType'];
        /** MySQL v4: e.g. `dify`, `coze` — see attack_tasks.platform_family */
        platformFamily?: string;
        /** MySQL v4: omit rows where platform_family equals this value (e.g. `coze` on Dify agent list) */
        excludePlatformFamily?: string;
      },
  ): Promise<PaginatedResponse<AttackTask>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<AttackTask>>>(
      '/attack-tasks',
      { params },
    );
    // Axios wraps the ApiResponse<T> in response.data
    return handleApiResponse(response.data);
  },

  /**
   * Get task by ID
   */
  get: async (id: string): Promise<AttackTask> => {
    const response = await apiClient.get<ApiResponse<AttackTask>>(`/attack-tasks/${id}`);
    return handleApiResponse(response.data);
  },

  /**
   * Create new task
   */
  create: async (data: CreateAttackTaskRequest): Promise<AttackTask> => {
    const response = await apiClient.post<ApiResponse<AttackTask>>('/attack-tasks', data);
    return handleApiResponse(response.data);
  },

  /**
   * Update task
   */
  update: async (id: string, data: Partial<AttackTask>): Promise<AttackTask> => {
    const response = await apiClient.put<ApiResponse<AttackTask>>(`/attack-tasks/${id}`, data);
    return handleApiResponse(response.data);
  },

  /**
   * Delete task
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/attack-tasks/${id}`);
  },

  /**
   * Run/execute task
   */
  run: async (data: RunTaskRequest): Promise<{ message: string; taskId: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string; taskId: string }>>(
      `/attack-tasks/${data.taskId}/run`,
      data.configAudit ? { configAudit: data.configAudit } : undefined,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Cancel task execution
   */
  cancel: async (data: CancelTaskRequest): Promise<void> => {
    await apiClient.post(`/attack-tasks/${data.taskId}/cancel`);
  },

  /**
   * Get task results
   */
  getResults: async (taskId: string): Promise<TaskResultsResponse> => {
    const response = await apiClient.get<ApiResponse<TaskResultsResponse>>(
      `/attack-tasks/${taskId}/results`,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Get task run details
   */
  getRun: async (
    runId: string,
  ): Promise<{
    taskId: string;
    runId: string;
    status: string;
    sessions: Array<{
      id: string;
      name: string;
      status: 'running' | 'completed' | 'failed';
      startTime: string;
      endTime?: string;
    }>;
    conversation: Array<{
      id: string;
      role: 'attacker' | 'agent';
      content: string;
      timestamp: string;
      sessionId?: string;
      riskLevel?: 'critical' | 'high' | 'medium' | 'low';
    }>;
    detection: {
      ruleResults: Array<{
        ruleId: string;
        ruleName: string;
        matched: boolean;
        evidence: string;
        severity: string;
        confidence: number;
      }>;
      llmResult?: {
        vulnerable: boolean;
        confidence: number;
        reasoning: string;
        riskLevel: string;
      };
      finalVerdict: {
        vulnerable: boolean;
        confidence: number;
        reason: string;
        riskLevel: string;
      };
    } | null;
  }> => {
    const response = await apiClient.get<
      ApiResponse<{
        taskId: string;
        runId: string;
        status: string;
        sessions: Array<{
          id: string;
          name: string;
          status: 'running' | 'completed' | 'failed';
          startTime: string;
          endTime?: string;
        }>;
        conversation: Array<{
          id: string;
          role: 'attacker' | 'agent';
          content: string;
          timestamp: string;
          sessionId?: string;
          riskLevel?: 'critical' | 'high' | 'medium' | 'low';
        }>;
        detection: {
          ruleResults: Array<{
            ruleId: string;
            ruleName: string;
            matched: boolean;
            evidence: string;
            severity: string;
            confidence: number;
          }>;
          llmResult?: {
            vulnerable: boolean;
            confidence: number;
            reasoning: string;
            riskLevel: string;
          };
          finalVerdict: {
            vulnerable: boolean;
            confidence: number;
            reason: string;
            riskLevel: string;
          };
        } | null;
      }>
    >(`/attack-tasks/runs/${runId}`);
    return handleApiResponse(response.data);
  },
};
