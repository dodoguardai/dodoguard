/**
 * Target Agents API Service
 */

import apiClient, { handleApiResponse } from './client'
import type { TargetAgent, AgentAttackHistory } from '@/types/entities'
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  FilterParams,
  CreateTargetAgentRequest,
  UpdateTargetAgentRequest,
  AgentStatusResponse,
  TestAgentRequest
} from '@/types/api'

export const agentsApi = {
  /**
   * List target agents
   */
  list: async (
    params?: PaginationParams & FilterParams & {
      type?: TargetAgent['type']
      status?: TargetAgent['status']
    }
  ): Promise<PaginatedResponse<TargetAgent>> => {
    const response = await apiClient.get<
      ApiResponse<PaginatedResponse<TargetAgent>>
    >('/target-agents', { params })
    return handleApiResponse(response.data)
  },

  /**
   * Get agent by ID
   */
  get: async (id: string): Promise<TargetAgent> => {
    const response = await apiClient.get<ApiResponse<TargetAgent>>(
      `/target-agents/${id}`
    )
    return handleApiResponse(response.data)
  },

  /**
   * Create new agent
   */
  create: async (data: CreateTargetAgentRequest): Promise<TargetAgent> => {
    const response = await apiClient.post<ApiResponse<TargetAgent>>(
      '/target-agents',
      data
    )
    // response is AxiosResponse, response.data is ApiResponse<T>
    return handleApiResponse(response.data)
  },

  /**
   * Update agent
   */
  update: async (
    id: string,
    data: UpdateTargetAgentRequest
  ): Promise<TargetAgent> => {
    const response = await apiClient.put<ApiResponse<TargetAgent>>(
      `/target-agents/${id}`,
      data
    )
    return handleApiResponse(response.data)
  },

  /**
   * Delete agent
   */
  delete: async (id: string): Promise<void> => {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/target-agents/${id}`
    )
    // For DELETE requests, we just need to check if it was successful
    // The response should be ApiResponse format
    if (response.data && !response.data.success) {
      const err = response.data.error
      const msg = typeof err === 'string' ? err : (err && typeof err === 'object' && 'message' in err ? err.message : undefined)
      throw new Error(msg || 'Failed to delete agent')
    }
  },

  /**
   * Get agent attack history
   */
  getAttackHistory: async (
    id: string,
    params?: PaginationParams
  ): Promise<PaginatedResponse<AgentAttackHistory>> => {
    const response = await apiClient.get<
      ApiResponse<PaginatedResponse<AgentAttackHistory>>
    >(`/target-agents/${id}/attacks`, { params })
    return handleApiResponse(response.data)
  },

  /**
   * Test agent connection
   */
  testConnection: async (id: string, data?: TestAgentRequest): Promise<{
    status: 'success' | 'failed'
    message?: string
    autoCorrectedResponseMode?: 'streaming'
  }> => {
    const response = await apiClient.post<
      ApiResponse<{
        status: 'success' | 'failed'
        message?: string
        autoCorrectedResponseMode?: 'streaming'
      }>
    >(`/target-agents/${id}/test`, data, {
      // Dify streaming probes may wait for the first model token.
      timeout: 120_000,
    })
    return handleApiResponse(response.data)
  },

  probeCommercialApi: async (payload: {
    type: 'api' | 'api-stream'
    config: Record<string, unknown>
  }): Promise<{
    status: 'success' | 'failed'
    message: string
    httpStatus?: number
    durationMs?: number
    preview?: string
    endpoint?: string
  }> => {
    const response = await apiClient.post<
      ApiResponse<{
        status: 'success' | 'failed'
        message: string
        httpStatus?: number
        durationMs?: number
        preview?: string
        endpoint?: string
      }>
    >('/target-agents/probe-commercial-api', payload)
    return handleApiResponse(response.data)
  },

  /**
   * Get agent status
   */
  getStatus: async (id: string): Promise<AgentStatusResponse> => {
    const response = await apiClient.get<ApiResponse<AgentStatusResponse>>(
      `/target-agents/${id}/status`
    )
    return handleApiResponse(response.data)
  },
}

