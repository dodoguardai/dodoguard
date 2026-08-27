/**
 * System Configuration API Service
 */

import apiClient, { handleApiResponse } from './client';
import type {
  SystemConfig,
  FeatureFlag,
  IntegrationConfig,
  NotificationConfig,
  SecurityPolicy,
} from '@/types/entities';
import type {
  ApiResponse,
  UpdateSystemConfigRequest,
  UpdateFeatureFlagRequest,
  TestIntegrationRequest,
} from '@/types/api';

export const systemConfigApi = {
  /**
   * Get a single system config by key (e.g. agent_mode_config)
   */
  getByKey: async (key: string): Promise<{ key: string; value: unknown }> => {
    const response = await apiClient.get<ApiResponse<{ key: string; value: unknown }>>(
      `/system-config/${encodeURIComponent(key)}`,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Update system config by key (PUT body: { value, ... })
   */
  updateByKey: async (key: string, data: UpdateSystemConfigRequest): Promise<void> => {
    await apiClient.put(`/system-config/${encodeURIComponent(key)}`, data);
  },

  /**
   * Get all system configs
   */
  getAll: async (): Promise<SystemConfig[]> => {
    const response = await apiClient.get<ApiResponse<SystemConfig[]>>('/system-config');
    return handleApiResponse(response.data);
  },

  /**
   * Get system config by category
   */
  getByCategory: async (category: string): Promise<SystemConfig[]> => {
    const response = await apiClient.get<ApiResponse<SystemConfig[]>>(`/system-config/${category}`);
    return handleApiResponse(response.data);
  },

  /**
   * Update system config
   */
  update: async (id: string, data: UpdateSystemConfigRequest): Promise<SystemConfig> => {
    const response = await apiClient.put<ApiResponse<SystemConfig>>(`/system-config/${id}`, data);
    return handleApiResponse(response.data);
  },

  /**
   * Get all feature flags
   */
  getFeatureFlags: async (): Promise<FeatureFlag[]> => {
    const response = await apiClient.get<ApiResponse<FeatureFlag[]>>(
      '/system-config/feature-flags',
    );
    return handleApiResponse(response.data);
  },

  /**
   * Update feature flag
   */
  updateFeatureFlag: async (id: string, data: UpdateFeatureFlagRequest): Promise<FeatureFlag> => {
    const response = await apiClient.put<ApiResponse<FeatureFlag>>(
      `/system-config/feature-flags/${id}`,
      data,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Get integrations
   */
  getIntegrations: async (): Promise<IntegrationConfig[]> => {
    const response = await apiClient.get<ApiResponse<IntegrationConfig[]>>(
      '/system-config/integrations',
    );
    // response is the full axios response, response.data is the ApiResponse<T> format
    console.log('[API] getIntegrations response:', {
      hasResponse: !!response,
      hasData: !!response?.data,
      responseData: response?.data,
    });
    return handleApiResponse(response.data);
  },

  /**
   * Create integration
   */
  createIntegration: async (data: Partial<IntegrationConfig>): Promise<IntegrationConfig> => {
    const response = await apiClient.post<ApiResponse<IntegrationConfig>>(
      '/system-config/integrations',
      data,
    );
    // response is the full axios response, response.data is the ApiResponse<T> format
    console.log('[API] createIntegration response:', {
      hasResponse: !!response,
      hasData: !!response?.data,
      responseData: response?.data,
    });
    return handleApiResponse(response.data);
  },

  /**
   * Update integration
   */
  updateIntegration: async (
    id: string,
    data: Partial<IntegrationConfig>,
  ): Promise<IntegrationConfig> => {
    const response = await apiClient.put<ApiResponse<IntegrationConfig>>(
      `/system-config/integrations/${id}`,
      data,
    );
    // response is the full axios response, response.data is the ApiResponse<T> format
    return handleApiResponse(response.data);
  },

  /**
   * Test integration
   */
  testIntegration: async (
    id: string,
    data?: TestIntegrationRequest,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<ApiResponse<{ success: boolean; message: string }>>(
      `/system-config/integrations/${id}/test`,
      data,
    );
    // response is the full axios response, response.data is the ApiResponse<T> format
    return handleApiResponse(response.data);
  },

  /**
   * Test integration with custom config (before saving)
   */
  testIntegrationWithConfig: async (
    data: Partial<IntegrationConfig>,
  ): Promise<{ success: boolean; message: string; input?: string; output?: string }> => {
    const response = await apiClient.post<
      ApiResponse<{ success: boolean; message: string; input?: string; output?: string }>
    >(`/system-config/integrations/test`, data);
    // response is the full axios response, response.data is the ApiResponse<T> format
    console.log('[API] testIntegrationWithConfig response:', {
      hasResponse: !!response,
      hasData: !!response?.data,
      responseData: response?.data,
    });
    return handleApiResponse(response.data);
  },

  /**
   * Delete integration
   */
  deleteIntegration: async (id: string): Promise<void> => {
    await apiClient.delete(`/system-config/integrations/${id}`);
  },

  /**
   * Get notification configs
   */
  getNotificationConfigs: async (): Promise<NotificationConfig[]> => {
    const response = await apiClient.get<ApiResponse<NotificationConfig[]>>(
      '/system-config/notifications',
    );
    return handleApiResponse(response.data);
  },

  /**
   * Update notification config
   */
  updateNotificationConfig: async (
    id: string,
    data: Partial<NotificationConfig>,
  ): Promise<NotificationConfig> => {
    const response = await apiClient.put<ApiResponse<NotificationConfig>>(
      `/system-config/notifications/${id}`,
      data,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Get security policies
   */
  getSecurityPolicies: async (): Promise<SecurityPolicy[]> => {
    const response = await apiClient.get<ApiResponse<SecurityPolicy[]>>(
      '/system-config/security-policies',
    );
    return handleApiResponse(response.data);
  },

  /**
   * Update security policy
   */
  updateSecurityPolicy: async (
    id: string,
    data: Partial<SecurityPolicy>,
  ): Promise<SecurityPolicy> => {
    const response = await apiClient.put<ApiResponse<SecurityPolicy>>(
      `/system-config/security-policies/${id}`,
      data,
    );
    return handleApiResponse(response.data);
  },
};
