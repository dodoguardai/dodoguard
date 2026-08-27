/**
 * Coze Config Audit API — static Coze workflow YAML security review.
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';
import type { DifyConfigAuditData, DifyStructureResponseData } from './dify-config-audit';

export type CozeConfigAuditData = DifyConfigAuditData;

export type AnalyzeCozeConfigRequest = {
  yaml: string;
  fileName?: string;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

export type AnalyzeCozeConfigResponse = CozeConfigAuditData & { reportId?: string };

const ANALYZE_TIMEOUT_MS = 300_000;
const STRUCTURE_TIMEOUT_MS = 60_000;

export type StructureCozeConfigRequest = {
  yaml: string;
};

export const cozeConfigAuditApi = {
  structure: async (body: StructureCozeConfigRequest): Promise<DifyStructureResponseData> => {
    const response = await apiClient.post<ApiResponse<DifyStructureResponseData>>(
      '/coze-config-audit/structure',
      body,
      { timeout: STRUCTURE_TIMEOUT_MS },
    );
    return handleApiResponse(response.data);
  },

  analyze: async (body: AnalyzeCozeConfigRequest): Promise<AnalyzeCozeConfigResponse> => {
    const response = await apiClient.post<ApiResponse<AnalyzeCozeConfigResponse>>(
      '/coze-config-audit/analyze',
      body,
      { timeout: ANALYZE_TIMEOUT_MS },
    );
    return handleApiResponse(response.data);
  },
};
