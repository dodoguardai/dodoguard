/**
 * Invitations API Service
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api';

export interface UserInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  teamIds?: string[];
  invitedBy: string;
  token: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  acceptedAt?: string;
  acceptedBy?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const invitationsApi = {
  /**
   * List invitations
   */
  list: async (params?: PaginationParams): Promise<PaginatedResponse<UserInvitation>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<UserInvitation>>>(
      '/invitations',
      { params },
    );
    return handleApiResponse(response.data);
  },

  /**
   * Get invitation by ID
   */
  get: async (id: string): Promise<UserInvitation> => {
    const response = await apiClient.get<ApiResponse<UserInvitation>>(`/invitations/${id}`);
    return handleApiResponse(response.data);
  },

  /**
   * Create invitation
   */
  create: async (data: {
    email: string;
    role: string;
    teamIds?: string[];
    expiresInDays?: number;
  }): Promise<UserInvitation> => {
    const response = await apiClient.post<ApiResponse<UserInvitation>>('/invitations', data);
    return handleApiResponse(response.data);
  },

  /**
   * Batch create invitations
   */
  batch: async (
    data: Array<{
      email: string;
      role: string;
      teamIds?: string[];
    }>,
  ): Promise<UserInvitation[]> => {
    const response = await apiClient.post<ApiResponse<UserInvitation[]>>('/invitations/batch', {
      invitations: data,
    });
    return handleApiResponse(response.data);
  },

  /**
   * Resend invitation
   */
  resend: async (id: string): Promise<void> => {
    await apiClient.post(`/invitations/${id}/resend`);
  },

  /**
   * Cancel invitation
   */
  cancel: async (id: string): Promise<void> => {
    await apiClient.post(`/invitations/${id}/cancel`);
  },

  /**
   * Accept invitation
   */
  accept: async (
    token: string,
    data: {
      name: string;
      password: string;
    },
  ): Promise<{ user: unknown; token: string }> => {
    const response = await apiClient.get<ApiResponse<{ user: unknown; token: string }>>(
      `/invitations/accept/${token}`,
      {
        method: 'POST',
        data,
      } as any,
    );
    return handleApiResponse(response.data);
  },
};
