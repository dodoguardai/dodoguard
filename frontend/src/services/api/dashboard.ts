/**
 * Dashboard API Service
 */

import apiClient, { handleApiResponse } from './client';
import type { DashboardStats, AuditLog } from '@/types/entities';
import type { ApiResponse, PaginationParams } from '@/types/api';

export const dashboardApi = {
  /**
   * Get dashboard statistics
   */
  getStats: async (organizationId: string): Promise<DashboardStats> => {
    const response = await apiClient.get<ApiResponse<DashboardStats>>('/dashboard/stats', {
      params: { organizationId },
    });
    return handleApiResponse(response.data);
  },

  /**
   * Get recent activities
   */
  getRecentActivities: async (
    organizationId: string,
    params?: PaginationParams,
  ): Promise<AuditLog[]> => {
    const response = await apiClient.get<ApiResponse<AuditLog[]>>('/dashboard/activity', {
      params: {
        organizationId,
        ...params,
      },
    });
    return handleApiResponse(response.data);
  },

  /**
   * Get system health status
   */
  getHealth: async (): Promise<{
    status: 'healthy' | 'degraded' | 'down';
    database: 'online' | 'offline';
    cache: 'online' | 'offline';
    queue: 'online' | 'offline';
  }> => {
    const response =
      await apiClient.get<
        ApiResponse<{
          status: 'healthy' | 'degraded' | 'down';
          database: 'online' | 'offline';
          cache: 'online' | 'offline';
          queue: 'online' | 'offline';
        }>
      >('/dashboard/health');
    return handleApiResponse(response.data);
  },
};
