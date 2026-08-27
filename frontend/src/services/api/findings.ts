/**
 * Vulnerability Findings API Service
 */

import apiClient, { handleApiResponse } from './client';
import type { Finding } from '@/types/entities';
import type {
  ApiResponse,
  PaginatedResponse,
  ListFindingsParams,
  UpdateFindingRequest,
  RetestFindingRequest,
  RetestFindingResponse,
  FindingTimelineData,
} from '@/types/api';

export const findingsApi = {
  /**
   * List findings with optional filters and pagination
   */
  list: async (params?: ListFindingsParams): Promise<PaginatedResponse<Finding>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Finding>>>('/findings', {
      params,
    });
    return handleApiResponse(response.data);
  },

  /**
   * Get a single finding by ID (includes detail fields: vulnerability, task, detectionSummary, conversation, solutions)
   */
  get: async (id: string): Promise<Finding> => {
    const response = await apiClient.get<ApiResponse<Finding>>(`/findings/${id}`);
    return handleApiResponse(response.data);
  },

  /**
   * Update finding status or audit notes
   */
  update: async (id: string, data: UpdateFindingRequest): Promise<Finding> => {
    const response = await apiClient.patch<ApiResponse<Finding>>(`/findings/${id}`, data);
    return handleApiResponse(response.data);
  },

  /**
   * Delete a finding by ID
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/findings/${id}`);
  },

  /**
   * Create a retest attack task from this finding (clone baseline task).
   */
  retest: async (id: string, body?: RetestFindingRequest): Promise<RetestFindingResponse> => {
    const response = await apiClient.post<ApiResponse<RetestFindingResponse>>(
      `/findings/${id}/retest`,
      body ?? {},
    );
    return handleApiResponse(response.data);
  },

  /**
   * Security timeline for this finding (task, scans, retests, status).
   */
  getTimeline: async (id: string): Promise<FindingTimelineData> => {
    const response = await apiClient.get<ApiResponse<FindingTimelineData>>(
      `/findings/${id}/timeline`,
    );
    return handleApiResponse(response.data);
  },
};
