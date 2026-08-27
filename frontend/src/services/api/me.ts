/**
 * Current-user (me) API service
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';
import type { User } from '@/types/entities';

export type MeProfile = Pick<
  User,
  | 'id'
  | 'organizationId'
  | 'email'
  | 'name'
  | 'avatar'
  | 'role'
  | 'status'
  | 'emailVerified'
  | 'mfaEnabled'
  | 'createdAt'
  | 'updatedAt'
> & {
  lastLoginAt?: string;
};

export type UpdateMePayload = {
  name?: string;
  avatar?: string | null;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export const meApi = {
  getProfile: async (): Promise<MeProfile> => {
    const response = await apiClient.get<ApiResponse<MeProfile>>('/me');
    return handleApiResponse(response.data);
  },

  updateProfile: async (payload: UpdateMePayload): Promise<MeProfile> => {
    const response = await apiClient.patch<ApiResponse<MeProfile>>('/me', payload);
    return handleApiResponse(response.data);
  },

  changePassword: async (payload: ChangePasswordPayload): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>('/me/password', payload);
    return handleApiResponse(response.data);
  },
};
