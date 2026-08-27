import apiClient, { handleApiResponse } from './client';
import { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api';
import { Team } from '@/types/entities';

export const teamsApi = {
  list: async (
    params?: PaginationParams & { search?: string },
  ): Promise<PaginatedResponse<Team>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Team>>>('/teams', {
      params,
    });
    return handleApiResponse(response.data);
  },
  get: async (id: string): Promise<Team> => {
    const response = await apiClient.get<ApiResponse<Team>>(`/teams/${id}`);
    return handleApiResponse(response.data);
  },
  create: async (data: {
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Team> => {
    const response = await apiClient.post<ApiResponse<Team>>('/teams', data);
    return handleApiResponse(response.data);
  },
  update: async (
    id: string,
    data: {
      name?: string;
      description?: string;
      logo?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<Team> => {
    const response = await apiClient.put<ApiResponse<Team>>(`/teams/${id}`, data);
    return handleApiResponse(response.data);
  },
  delete: async (id: string): Promise<void> => {
    const response = await apiClient.delete<ApiResponse<null>>(`/teams/${id}`);
    if (!response.data.success) {
      const err = response.data.error;
      const msg =
        typeof err === 'string'
          ? err
          : err && typeof err === 'object' && 'message' in err
            ? err.message
            : undefined;
      throw new Error(msg || 'Failed to delete team');
    }
  },
  getMembers: async (id: string): Promise<any[]> => {
    const response = await apiClient.get<ApiResponse<any[]>>(`/teams/${id}/members`);
    return handleApiResponse(response.data);
  },
  addMember: async (teamId: string, userId: string): Promise<void> => {
    const response = await apiClient.post<ApiResponse<null>>(`/teams/${teamId}/members`, {
      userId,
    });
    if (!response.data.success) {
      const err = response.data.error;
      const msg =
        typeof err === 'string'
          ? err
          : err && typeof err === 'object' && 'message' in err
            ? err.message
            : undefined;
      throw new Error(msg || 'Failed to add member');
    }
  },
  removeMember: async (teamId: string, userId: string): Promise<void> => {
    const response = await apiClient.delete<ApiResponse<null>>(
      `/teams/${teamId}/members/${userId}`,
    );
    if (!response.data.success) {
      const err = response.data.error;
      const msg =
        typeof err === 'string'
          ? err
          : err && typeof err === 'object' && 'message' in err
            ? err.message
            : undefined;
      throw new Error(msg || 'Failed to remove member');
    }
  },
};
