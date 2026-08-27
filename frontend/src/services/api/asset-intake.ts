import apiClient, { handleApiResponse } from './client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api';
import type {
  AgentAsset,
  AgentAssetComponent,
  AssetOwnership,
  PlatformConnector,
  PlatformDiscoveredAsset,
  TargetAgent,
} from '@/types/entities';

export type AssetAgentPayload = {
  teamId?: string | null;
  legacyId?: string | null;
  assetCode?: string;
  name: string;
  agentType: string;
  platformFamily: string;
  externalId?: string | null;
  sourceType?: string;
  environment: string;
  runtimeStatus?: string;
  lifecycleStatus?: string;
  admissionStatus?: string;
  businessScene?: string | null;
  businessSystem?: string | null;
  functionIntro: string;
  riskLevel?: string;
  exposureLevel: string;
  exposureSurface?: string | null;
  sensitiveData: boolean;
  version?: string;
  defaultModel?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  owners?: Array<Partial<AssetOwnership> & Pick<AssetOwnership, 'ownerType'>>;
  components?: Array<
    Partial<AgentAssetComponent> & Pick<AgentAssetComponent, 'componentType' | 'componentName'>
  >;
};

export type AssetAgentListParams = PaginationParams & {
  search?: string;
  platformFamily?: string;
  department?: string;
  environment?: string;
  runtimeStatus?: string;
  admissionStatus?: string;
  riskLevel?: string;
  exposureLevel?: string;
  sensitiveData?: boolean;
};

export type AssetGovernanceStage =
  | 'asset_intake'
  | 'component_identification'
  | 'component_detection'
  | 'agent_detection'
  | 'risk_assessment'
  | 'remediation'
  | 'retest'
  | 'report_audit'
  | 'launch_monitoring';

export type AssetRuntimeProbePayload = {
  type: TargetAgent['type'];
  name?: string;
  config: Record<string, unknown>;
};

export type AssetRuntimeProbeResult = {
  status: 'success' | 'failed';
  message?: string;
  responseTime?: number;
  httpStatus?: number;
  durationMs?: number;
  preview?: string;
  endpoint?: string;
};

export const assetIntakeApi = {
  listAgents: async (params?: AssetAgentListParams): Promise<PaginatedResponse<AgentAsset>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<AgentAsset>>>(
      '/assets/agents',
      { params },
    );
    return handleApiResponse(response.data);
  },

  createAgent: async (payload: AssetAgentPayload): Promise<AgentAsset> => {
    const response = await apiClient.post<ApiResponse<AgentAsset>>('/assets/agents', payload);
    return handleApiResponse(response.data);
  },

  getAgent: async (id: string): Promise<AgentAsset> => {
    const response = await apiClient.get<ApiResponse<AgentAsset>>(`/assets/agents/${id}`);
    return handleApiResponse(response.data);
  },

  updateAgent: async (id: string, payload: Partial<AssetAgentPayload>): Promise<AgentAsset> => {
    const response = await apiClient.patch<ApiResponse<AgentAsset>>(
      `/assets/agents/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  probeRuntime: async (payload: AssetRuntimeProbePayload): Promise<AssetRuntimeProbeResult> => {
    const response = await apiClient.post<ApiResponse<AssetRuntimeProbeResult>>(
      '/assets/agents/probe-runtime',
      payload,
      { timeout: 120_000 },
    );
    return handleApiResponse(response.data);
  },

  advanceWorkflow: async (
    id: string,
    payload: {
      stage: AssetGovernanceStage;
      status?: 'pending' | 'in_progress' | 'completed' | 'blocked';
      note?: string;
    },
  ): Promise<AgentAsset> => {
    const response = await apiClient.patch<ApiResponse<AgentAsset>>(
      `/assets/agents/${id}/workflow`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  deleteAgent: async (id: string): Promise<void> => {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/assets/agents/${id}`,
    );
    if (response.data && !response.data.success) {
      throw new Error(
        typeof response.data.error === 'string'
          ? response.data.error
          : response.data.error?.message || 'Failed to delete asset',
      );
    }
  },

  saveComponents: async (
    id: string,
    components: AssetAgentPayload['components'],
  ): Promise<AgentAsset> => {
    const response = await apiClient.put<ApiResponse<AgentAsset>>(
      `/assets/agents/${id}/components`,
      { components },
    );
    return handleApiResponse(response.data);
  },

  listDiscovered: async (
    params?: PaginationParams & { claimStatus?: string; platformFamily?: string },
  ): Promise<PaginatedResponse<PlatformDiscoveredAsset>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<PlatformDiscoveredAsset>>>(
      '/assets/discovered',
      { params },
    );
    return handleApiResponse(response.data);
  },

  claimDiscovered: async (id: string, payload: Partial<AssetAgentPayload>): Promise<AgentAsset> => {
    const response = await apiClient.post<ApiResponse<AgentAsset>>(
      `/assets/discovered/${id}/claim`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  ignoreDiscovered: async (id: string): Promise<void> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      `/assets/discovered/${id}/ignore`,
    );
    handleApiResponse(response.data);
  },

  listConnectors: async (): Promise<PlatformConnector[]> => {
    const response = await apiClient.get<ApiResponse<PlatformConnector[]>>('/assets/connectors');
    return handleApiResponse(response.data);
  },

  syncConnector: async (id: string): Promise<{ jobId: string; status: string }> => {
    const response = await apiClient.post<ApiResponse<{ jobId: string; status: string }>>(
      `/assets/connectors/${id}/sync`,
    );
    return handleApiResponse(response.data);
  },
};
