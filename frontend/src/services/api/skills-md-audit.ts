/**
 * SKILLS.md Audit API — static Markdown security review.
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';
import type { DifyConfigAuditData } from './dify-config-audit';

export type SkillsMdAuditData = DifyConfigAuditData;

export type AnalyzeSkillsMdRequest = {
  markdown: string;
  fileName?: string;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

export type AnalyzeSkillsMdResponse = SkillsMdAuditData & { reportId?: string };

const ANALYZE_TIMEOUT_MS = 300_000;

export type AnalyzeSkillsArchiveRequest = {
  archive: File;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

export const skillsMdAuditApi = {
  analyze: async (body: AnalyzeSkillsMdRequest): Promise<AnalyzeSkillsMdResponse> => {
    const response = await apiClient.post<ApiResponse<AnalyzeSkillsMdResponse>>(
      '/skills-md-audit/analyze',
      body,
      { timeout: ANALYZE_TIMEOUT_MS },
    );
    return handleApiResponse(response.data);
  },

  analyzeArchive: async (body: AnalyzeSkillsArchiveRequest): Promise<AnalyzeSkillsMdResponse> => {
    const formData = new FormData();
    formData.append('archive', body.archive, body.archive.name);
    if (body.provider) {
      formData.append('provider', JSON.stringify(body.provider));
    }
    const response = await apiClient.post<ApiResponse<AnalyzeSkillsMdResponse>>(
      '/skills-md-audit/analyze',
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
