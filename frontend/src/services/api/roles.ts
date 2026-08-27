import apiClient, { handleApiResponse } from './client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api';
import type { Role } from '@/types/entities';

export const rolesApi = {
  /**
   * List roles
   */
  list: async (
    params?: PaginationParams & { search?: string },
  ): Promise<PaginatedResponse<Role>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Role>>>('/roles', {
      params,
    });
    return handleApiResponse(response.data);
  },

  /**
   * Get role by ID
   */
  get: async (id: string): Promise<Role> => {
    const response = await apiClient.get<ApiResponse<Role>>(`/roles/${id}`);
    return handleApiResponse(response.data);
  },

  /**
   * Create role
   */
  create: async (data: Partial<Role>): Promise<Role> => {
    const response = await apiClient.post<ApiResponse<Role>>('/roles', data);
    return handleApiResponse(response.data);
  },

  /**
   * Update role
   */
  update: async (id: string, data: Partial<Role>): Promise<Role> => {
    const response = await apiClient.put<ApiResponse<Role>>(`/roles/${id}`, data);
    return handleApiResponse(response.data);
  },

  /**
   * Delete role
   */
  delete: async (id: string): Promise<void> => {
    const response = await apiClient.delete<ApiResponse<null>>(`/roles/${id}`);
    if (!response.data.success) {
      const err = response.data.error;
      const msg =
        typeof err === 'string'
          ? err
          : err && typeof err === 'object' && 'message' in err
            ? err.message
            : undefined;
      throw new Error(msg || 'Failed to delete role');
    }
  },

  /**
   * Get role permissions
   */
  getPermissions: async (id: string): Promise<string[]> => {
    const response = await apiClient.get<ApiResponse<string[]>>(`/roles/${id}/permissions`);
    return handleApiResponse(response.data);
  },
};
