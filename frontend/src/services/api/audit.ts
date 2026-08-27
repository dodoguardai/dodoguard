/**
 * Audit Logs API Service
 */

import apiClient, { handleApiResponse } from './client';
import type { AuditLog } from '@/types/entities';
import type { ApiResponse, PaginatedResponse, PaginationParams, FilterParams } from '@/types/api';

export const auditApi = {
  /**
   * List audit logs
   */
  list: async (
    params?: PaginationParams &
      FilterParams & {
        userId?: string;
        action?: string;
        resourceType?: string;
      },
  ): Promise<PaginatedResponse<AuditLog>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<AuditLog>>>('/audit-logs', {
      params,
    });
    return handleApiResponse(response.data);
  },
};
