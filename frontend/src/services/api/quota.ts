/**
 * Quota API Service
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

export interface QuotaUsageResponse {
  organizationId: string;
  period: string;
  quotas: Record<
    string,
    {
      used: number;
      limit: number;
    }
  >;
}

export interface CheckQuotaRequest {
  metric: string;
  quantity?: number;
}

export interface CheckQuotaResponse {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
}

export const quotaApi = {
  /**
   * Get quota usage for current organization
   */
  getUsage: async (_organizationId: string): Promise<QuotaUsageResponse> => {
    const response = await apiClient.get<ApiResponse<QuotaUsageResponse>>('/quota/usage');
    return handleApiResponse(response.data);
  },

  /**
   * Check if quota allows operation
   */
  check: async (
    _organizationId: string,
    metric: string,
    quantity?: number,
  ): Promise<CheckQuotaResponse> => {
    const response = await apiClient.get<ApiResponse<CheckQuotaResponse>>('/quota/check', {
      params: {
        metric,
        quantity: quantity || 1,
      },
    });
    return handleApiResponse(response.data);
  },
};
