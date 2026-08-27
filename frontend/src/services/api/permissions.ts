/**
 * Permissions API Service
 */

import apiClient, { handleApiResponse } from './client';
import type { Permission } from '@/types/entities';
import type { ApiResponse } from '@/types/api';

export const permissionsApi = {
  /**
   * List all permissions
   */
  list: async (): Promise<Permission[]> => {
    const response = await apiClient.get<ApiResponse<Permission[]>>('/permissions');
    return handleApiResponse(response.data);
  },

  /**
   * Get permission by ID
   */
  get: async (id: string): Promise<Permission> => {
    const response = await apiClient.get<ApiResponse<Permission>>(`/permissions/${id}`);
    return handleApiResponse(response.data);
  },

  /**
   * Get current user's permission names (from their role).
   * Used for sidebar visibility and route guards.
   */
  getMyPermissions: async (): Promise<string[]> => {
    const response = await apiClient.get<ApiResponse<{ permissions: string[] }>>('/me/permissions');
    const data = handleApiResponse(response.data);
    return data.permissions ?? [];
  },

  /**
   * Seed / refresh the permissions catalog.
   * Returns counts: inserted, updated, skipped, errors, total.
   */
  seed: async (): Promise<{
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    total: number;
  }> => {
    const response = await apiClient.post<
      ApiResponse<{
        inserted: number;
        updated: number;
        skipped: number;
        errors: number;
        total: number;
      }>
    >('/permissions/seed');
    return handleApiResponse(response.data);
  },
};
