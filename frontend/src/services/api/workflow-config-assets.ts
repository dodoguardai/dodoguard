/**
 * Workflow config assets API — persisted exports for reuse & visualization.
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

import type { NormalizedWorkflow } from './dify-config-audit';

export type WorkflowConfigAssetDslSummary = {
  node_count?: number;
  edge_count?: number;
  node_type_distribution?: Record<string, number>;
  branch_count?: number;
  fail_branch_count?: number;
  ref_count?: number;
  unknown_node_type_count?: number;
};

export type WorkflowConfigAssetParseSummary = {
  parserVersion?: string;
  sourceType?: string;
  dslParseSummary?: WorkflowConfigAssetDslSummary | null;
  inventoryTruncated?: boolean;
  normalizedMeta?: {
    truncated?: boolean;
    node_count_total?: number;
    edge_count_total?: number;
  };
};

export type WorkflowConfigAsset = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  /** Present when asset is scoped to a target agent (upload / task save). */
  targetAgentId?: string;
  name: string;
  sourceType: string;
  fileName?: string;
  contentHash: string;
  rawFormat: string;
  parseStatus: string;
  parseError?: string;
  parseSummary?: WorkflowConfigAssetParseSummary | Record<string, unknown> | null;
  graphSnapshot?: NormalizedWorkflow | null;
  parserVersion: string;
  createdAt: string;
  updatedAt: string;
  rawContent?: string;
  nodeCount?: number;
};

export type WorkflowConfigAssetsListResponse = {
  items: WorkflowConfigAsset[];
  total: number;
  limit: number;
  offset: number;
};

export type WorkflowConfigAssetNodeTypeDetailGroup = {
  fingerprint: string;
  label: string;
  nodes: Array<{ nodeId: string; title: string; graphType?: string }>;
  otherAgents: Array<{
    targetAgentId: string;
    agentName: string | null;
    assetId: string;
    assetName: string;
    nodeCount: number;
  }>;
};

export const workflowConfigAssetsApi = {
  list: async (params?: {
    limit?: number;
    offset?: number;
    sourceType?: string;
    q?: string;
    targetAgentId?: string;
  }): Promise<WorkflowConfigAssetsListResponse> => {
    const response = await apiClient.get<ApiResponse<WorkflowConfigAssetsListResponse>>(
      '/workflow-config-assets',
      { params },
    );
    return handleApiResponse(response.data);
  },

  get: async (
    id: string,
    opts?: { includeGraph?: boolean; includeRaw?: boolean },
  ): Promise<WorkflowConfigAsset> => {
    const params: Record<string, string> = {};
    if (opts?.includeGraph) {
      params.includeGraph = '1';
    }
    if (opts?.includeRaw) {
      params.includeRaw = '1';
    }
    const response = await apiClient.get<ApiResponse<{ asset: WorkflowConfigAsset }>>(
      `/workflow-config-assets/${id}`,
      { params },
    );
    return handleApiResponse(response.data).asset;
  },

  getNodeTypeDetail: async (
    assetId: string,
    nodeType: string,
  ): Promise<{
    assetName: string;
    nodeType: string;
    groups: WorkflowConfigAssetNodeTypeDetailGroup[];
  }> => {
    const response = await apiClient.get<
      ApiResponse<{
        assetName: string;
        nodeType: string;
        groups: WorkflowConfigAssetNodeTypeDetailGroup[];
      }>
    >(`/workflow-config-assets/${assetId}/node-type-detail`, {
      params: { nodeType },
    });
    return handleApiResponse(response.data);
  },

  create: async (body: {
    raw: string;
    name?: string;
    fileName?: string;
    sourceType?: 'dify' | 'fastgpt' | 'coze' | 'unknown' | 'auto';
    targetAgentId?: string;
  }): Promise<{ asset: WorkflowConfigAsset; deduplicated: boolean }> => {
    const response = await apiClient.post<
      ApiResponse<{ asset: WorkflowConfigAsset; deduplicated: boolean }>
    >('/workflow-config-assets', body);
    return handleApiResponse(response.data);
  },
};
