/**
 * Organizations API Service
 */

import apiClient, { handleApiResponse } from './client';
import type { Organization } from '@/types/entities';
import type { ApiResponse } from '@/types/api';

export const organizationsApi = {
  /**
   * List all organizations
   */
  list: async (): Promise<Organization[]> => {
    const response = await apiClient.get<ApiResponse<Organization[]>>('/organizations');
    return handleApiResponse(response.data);
  },

  /**
   * Get organization by ID
   */
  get: async (id: string): Promise<Organization> => {
    const response = await apiClient.get<ApiResponse<Organization>>(`/organizations/${id}`);
    return handleApiResponse(response.data);
  },

  /**
   * Create new organization
   */
  create: async (data: Partial<Organization>): Promise<Organization> => {
    try {
      console.log(
        'Organizations API - Creating organization with data:',
        JSON.stringify(data, null, 2),
      );
      console.log('Organizations API - Request URL:', '/organizations');
      console.log('Organizations API - Request method:', 'POST');
      const response = await apiClient.post<ApiResponse<Organization>>('/organizations', data);
      console.log('Organizations API - Response received:', response);
      console.log('Organizations API - Response data:', JSON.stringify(response.data, null, 2));
      return handleApiResponse(response.data);
    } catch (error: any) {
      console.error('Organizations API - Create failed:', error);
      console.error('Organizations API - Error object:', error);
      console.error('Organizations API - Error response:', error?.response);
      console.error(
        'Organizations API - Error response data:',
        JSON.stringify(error?.response?.data, null, 2),
      );
      console.error('Organizations API - Error response status:', error?.response?.status);
      console.error('Organizations API - Error message:', error?.message);
      if (error?.response?.data?.error) {
        console.error(
          'Organizations API - Error details:',
          JSON.stringify(error.response.data.error, null, 2),
        );
        if (error?.response?.data?.error?.details) {
          console.error(
            'Organizations API - Validation errors:',
            JSON.stringify(error.response.data.error.details, null, 2),
          );
        }
      }
      throw error;
    }
  },

  /**
   * Update organization
   */
  update: async (id: string, data: Partial<Organization>): Promise<Organization> => {
    const response = await apiClient.put<ApiResponse<Organization>>(`/organizations/${id}`, data);
    return handleApiResponse(response.data);
  },

  /**
   * Delete organization
   */
  delete: async (id: string): Promise<void> => {
    const response = await apiClient.delete<ApiResponse<null>>(`/organizations/${id}`);
    if (!response.data.success) {
      const err = response.data.error;
      const msg =
        typeof err === 'string'
          ? err
          : err && typeof err === 'object' && 'message' in err
            ? err.message
            : undefined;
      throw new Error(msg || 'Failed to delete organization');
    }
  },
};
