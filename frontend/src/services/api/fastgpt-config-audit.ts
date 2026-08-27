/**
 * FastGPT Config Audit API — static FastGPT workflow JSON security review.
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';
import type { DifyConfigAuditData, DifyStructureResponseData } from './dify-config-audit';

export type FastGptConfigAuditData = DifyConfigAuditData;

export type AnalyzeFastGptConfigRequest = {
  json: string;
  fileName?: string;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

export type AnalyzeFastGptConfigResponse = FastGptConfigAuditData & { reportId?: string };

const ANALYZE_TIMEOUT_MS = 300_000;
const STRUCTURE_TIMEOUT_MS = 60_000;

export type StructureFastGptConfigRequest = {
  /** FastGPT config review uses raw workflow export JSON text. */
  json: string;
};

export const fastgptConfigAuditApi = {
  structure: async (body: StructureFastGptConfigRequest): Promise<DifyStructureResponseData> => {
    const response = await apiClient.post<ApiResponse<DifyStructureResponseData>>(
      '/fastgpt-config-audit/structure',
      body,
      { timeout: STRUCTURE_TIMEOUT_MS },
    );
    return handleApiResponse(response.data);
  },

  analyze: async (body: AnalyzeFastGptConfigRequest): Promise<AnalyzeFastGptConfigResponse> => {
    const response = await apiClient.post<ApiResponse<AnalyzeFastGptConfigResponse>>(
      '/fastgpt-config-audit/analyze',
      body,
      { timeout: ANALYZE_TIMEOUT_MS },
    );
    return handleApiResponse(response.data);
  },
};
