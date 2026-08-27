/**
 * MCP server source audit API — ZIP upload, LLM structured JSON.
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

import type { SkillsMdAuditData } from './skills-md-audit';

export type McpAuditData = SkillsMdAuditData;

export type AnalyzeMcpArchiveResponse = McpAuditData & {
  reportId?: string;
  securityScanTaskId?: string;
  remediationIds?: string[];
  registryId?: string;
  syncedFindings?: number;
};

const ANALYZE_TIMEOUT_MS = 300_000;

export type AnalyzeMcpArchiveRequest = {
  archive: File;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

export const mcpAuditApi = {
  analyzeArchive: async (body: AnalyzeMcpArchiveRequest): Promise<AnalyzeMcpArchiveResponse> => {
    const formData = new FormData();
    formData.append('archive', body.archive, body.archive.name);
    if (body.provider) {
      formData.append('provider', JSON.stringify(body.provider));
    }
    const response = await apiClient.post<ApiResponse<AnalyzeMcpArchiveResponse>>(
      '/mcp-audit/analyze',
      formData,
      {
        timeout: ANALYZE_TIMEOUT_MS,
        transformRequest: [
          (data, headers) => {
            if (data instanceof FormData) {
              delete headers['Content-Type'];
            }
            return data as FormData;
          },
        ],
      },
    );
    return handleApiResponse(response.data);
  },
};
