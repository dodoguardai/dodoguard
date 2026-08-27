import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

/** Aligns with DodoGuard ProviderOptions subset (label/config/apiKeyEnvVar, etc.). */
export interface ManagedModel {
  id: string;
  organizationId: string;
  name: string;
  provider: string;
  modelKey: string;
  status: 'active' | 'inactive';
  healthStatus: 'healthy' | 'degraded' | 'offline' | 'unknown';
  quotaMonthly: number;
  quotaUsed: number;
  createdAt: string;
  updatedAt: string;
  providerConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateManagedModelRequest {
  name: string;
  provider: string;
  modelKey: string;
  status?: 'active' | 'inactive';
  healthStatus?: 'healthy' | 'degraded' | 'offline' | 'unknown';
  quotaMonthly?: number;
  providerConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateManagedModelRequest {
  name?: string;
  provider?: string;
  modelKey?: string;
  status?: 'active' | 'inactive';
  quotaMonthly?: number;
  quotaUsed?: number;
  healthStatus?: 'healthy' | 'degraded' | 'offline' | 'unknown';
  providerConfig?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export const modelsApi = {
  list: async (): Promise<ManagedModel[]> => {
    const response = await apiClient.get<ApiResponse<ManagedModel[]>>('/models');
    return handleApiResponse(response.data);
  },

  create: async (payload: CreateManagedModelRequest): Promise<ManagedModel> => {
    const response = await apiClient.post<ApiResponse<ManagedModel>>('/models', payload);
    return handleApiResponse(response.data);
  },

  update: async (id: string, payload: UpdateManagedModelRequest): Promise<ManagedModel> => {
    const response = await apiClient.patch<ApiResponse<ManagedModel>>(`/models/${id}`, payload);
    return handleApiResponse(response.data);
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/models/${id}`);
  },

  runHealthCheck: async (id: string): Promise<ManagedModel> => {
    const response = await apiClient.post<ApiResponse<ManagedModel>>(`/models/${id}/health-check`);
    return handleApiResponse(response.data);
  },
};
