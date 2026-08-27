/**
 * n8n Config Audit API — static n8n workflow JSON security review via LLM.
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

import type { DifyConfigAuditData } from './dify-config-audit';

export type N8nConfigAuditData = DifyConfigAuditData;

export type AnalyzeN8nConfigRequest = {
  json: string;
  fileName?: string;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

export type AnalyzeN8nConfigResponse = N8nConfigAuditData & { reportId?: string };

const ANALYZE_TIMEOUT_MS = 300_000;

export const n8nConfigAuditApi = {
  analyze: async (body: AnalyzeN8nConfigRequest): Promise<AnalyzeN8nConfigResponse> => {
    const response = await apiClient.post<ApiResponse<AnalyzeN8nConfigResponse>>(
      '/n8n-config-audit/analyze',
      body,
      { timeout: ANALYZE_TIMEOUT_MS },
    );
    return handleApiResponse(response.data);
  },
};

