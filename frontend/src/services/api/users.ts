/**
 * Users API Service
 */

import apiClient, { handleApiResponse } from './client';
import type { User, AuditLog } from '@/types/entities';
import type { ApiResponse, PaginatedResponse, PaginationParams, FilterParams } from '@/types/api';

export const usersApi = {
  /**
   * List users
   */
  list: async (
    params?: PaginationParams &
      FilterParams & {
        status?: User['status'];
        role?: string;
      },
  ): Promise<PaginatedResponse<User>> => {
    console.log('[Users API] ========== Starting list request ==========');
    console.log('[Users API] Request params:', params);
    const startTime = Date.now();

    try {
      console.log('[Users API] Creating axios request...');

      // 添加超时控制
      const timeoutId = setTimeout(() => {
        console.error('[Users API] ⚠️ Request timeout - no response after 10 seconds');
      }, 10000);

      // 添加时间戳参数避免缓存（304 响应）
      const requestPromise = apiClient.get<ApiResponse<PaginatedResponse<User>>>('/users', {
        params: {
          ...params,
          _t: Date.now(), // 时间戳参数，确保每次请求 URL 都不同
        },
        timeout: 10000, // 10秒超时
      });

      console.log('[Users API] Request promise created, awaiting response...');

      const response = await requestPromise;

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      console.log(`[Users API] Request completed in ${duration}ms`);

      console.log('[Users API] Raw response:', {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
        dataType: typeof response.data,
        responseData: response.data
          ? JSON.stringify(response.data).substring(0, 500)
          : 'no response data',
      });

      // 处理 304 响应（Not Modified）
      if (response.status === 304) {
        console.warn('[Users API] Received 304 response, throwing error to force retry');
        throw new Error('Received 304 Not Modified response, please retry');
      }

      const result = handleApiResponse(response.data);
      console.log('[Users API] Processed result:', {
        hasData: !!result,
        dataType: typeof result,
        isArray: Array.isArray(result),
        keys: result ? Object.keys(result) : [],
        hasDataField: result && 'data' in result,
        dataLength:
          result && 'data' in result && Array.isArray(result.data) ? result.data.length : 0,
        fullResult: result ? JSON.stringify(result).substring(0, 500) : 'no result',
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[Users API] Request failed after ${duration}ms:`, {
        error,
        errorType: typeof error,
        errorMessage: error?.message,
        errorCode: error?.code,
        errorResponse: error?.response,
        errorStatus: error?.response?.status,
        errorData: error?.response?.data,
      });
      throw error;
    }
  },

  /**
   * Get user by ID
   */
  get: async (id: string): Promise<User> => {
    const response = await apiClient.get<ApiResponse<User>>(`/users/${id}`);
    return handleApiResponse(response.data);
  },

  /**
   * Create user
   */
  create: async (
    data: Partial<User> & {
      sendInvitation?: boolean;
      teamIds?: string[];
    },
  ): Promise<User> => {
    const response = await apiClient.post<ApiResponse<User>>('/users', data);
    return handleApiResponse(response.data);
  },

  /**
   * Update user
   */
  update: async (
    id: string,
    data: Partial<User> & {
      teamIds?: string[];
    },
  ): Promise<User> => {
    const response = await apiClient.put<ApiResponse<User>>(`/users/${id}`, data);
    return handleApiResponse(response.data);
  },

  /**
   * Delete user
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },

  /**
   * Activate user
   */
  activate: async (id: string): Promise<void> => {
    await apiClient.post(`/users/${id}/activate`);
  },

  /**
   * Suspend user
   */
  suspend: async (id: string, reason?: string): Promise<void> => {
    await apiClient.post(`/users/${id}/suspend`, { reason });
  },

  /**
   * Get user activities
   */
  getActivities: async (
    id: string,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<AuditLog>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<AuditLog>>>(
      `/users/${id}/activities`,
      { params },
    );
    return handleApiResponse(response.data);
  },

  /**
   * Reset password
   */
  resetPassword: async (id: string): Promise<{ token: string }> => {
    const response = await apiClient.post<ApiResponse<{ token: string }>>(
      `/users/${id}/reset-password`,
    );
    return handleApiResponse(response.data);
  },
};
