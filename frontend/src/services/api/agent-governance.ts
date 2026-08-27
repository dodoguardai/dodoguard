import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

export type GovStatus = 'active' | 'inactive';
export type OwnerType = 'business' | 'developer' | 'security' | 'ops';

export interface AgentGovDepartment {
  id: string;
  organizationId: string;
  name: string;
  deptType: string | null;
  lead: string | null;
  status: GovStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGovBusinessScene {
  id: string;
  organizationId: string;
  name: string;
  status: GovStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGovBusinessSystem {
  id: string;
  organizationId: string;
  name: string;
  departmentName: string | null;
  sceneName: string | null;
  status: GovStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGovOwner {
  id: string;
  organizationId: string;
  name: string;
  ownerType: OwnerType;
  departmentName: string | null;
  email: string | null;
  status: GovStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGovernanceMaster {
  departments: AgentGovDepartment[];
  businessScenes: AgentGovBusinessScene[];
  businessSystems: AgentGovBusinessSystem[];
  owners: AgentGovOwner[];
}

export const agentGovernanceApi = {
  async getMaster(): Promise<AgentGovernanceMaster> {
    const response = await apiClient.get<ApiResponse<AgentGovernanceMaster>>(
      '/agent-governance/master',
    );
    return handleApiResponse(response.data);
  },

  async createDepartment(payload: {
    name: string;
    deptType?: string;
    lead?: string;
    status?: GovStatus;
  }): Promise<AgentGovDepartment> {
    const response = await apiClient.post<ApiResponse<AgentGovDepartment>>(
      '/agent-governance/departments',
      payload,
    );
    return handleApiResponse(response.data);
  },

  async updateDepartment(
    id: string,
    payload: Partial<{ name: string; deptType: string; lead: string; status: GovStatus }>,
  ): Promise<AgentGovDepartment> {
    const response = await apiClient.patch<ApiResponse<AgentGovDepartment>>(
      `/agent-governance/departments/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  async deleteDepartment(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(
      `/agent-governance/departments/${id}`,
    );
    handleApiResponse(response.data);
  },

  async createBusinessScene(payload: {
    name: string;
    status?: GovStatus;
  }): Promise<AgentGovBusinessScene> {
    const response = await apiClient.post<ApiResponse<AgentGovBusinessScene>>(
      '/agent-governance/business-scenes',
      payload,
    );
    return handleApiResponse(response.data);
  },

  async updateBusinessScene(
    id: string,
    payload: Partial<{ name: string; status: GovStatus }>,
  ): Promise<AgentGovBusinessScene> {
    const response = await apiClient.patch<ApiResponse<AgentGovBusinessScene>>(
      `/agent-governance/business-scenes/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  async deleteBusinessScene(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(
      `/agent-governance/business-scenes/${id}`,
    );
    handleApiResponse(response.data);
  },

  async createBusinessSystem(payload: {
    name: string;
    departmentName?: string;
    sceneName?: string;
    status?: GovStatus;
  }): Promise<AgentGovBusinessSystem> {
    const response = await apiClient.post<ApiResponse<AgentGovBusinessSystem>>(
      '/agent-governance/business-systems',
      payload,
    );
    return handleApiResponse(response.data);
  },

  async updateBusinessSystem(
    id: string,
    payload: Partial<{
      name: string;
      departmentName: string;
      sceneName: string;
      status: GovStatus;
    }>,
  ): Promise<AgentGovBusinessSystem> {
    const response = await apiClient.patch<ApiResponse<AgentGovBusinessSystem>>(
      `/agent-governance/business-systems/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  async deleteBusinessSystem(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(
      `/agent-governance/business-systems/${id}`,
    );
    handleApiResponse(response.data);
  },

  async createOwner(payload: {
    name: string;
    ownerType: OwnerType;
    departmentName?: string;
    email?: string;
    status?: GovStatus;
  }): Promise<AgentGovOwner> {
    const response = await apiClient.post<ApiResponse<AgentGovOwner>>(
      '/agent-governance/owners',
      payload,
    );
    return handleApiResponse(response.data);
  },

  async updateOwner(
    id: string,
    payload: Partial<{
      name: string;
      ownerType: OwnerType;
      departmentName: string;
      email: string;
      status: GovStatus;
    }>,
  ): Promise<AgentGovOwner> {
    const response = await apiClient.patch<ApiResponse<AgentGovOwner>>(
      `/agent-governance/owners/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  async deleteOwner(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(
      `/agent-governance/owners/${id}`,
    );
    handleApiResponse(response.data);
  },
};
