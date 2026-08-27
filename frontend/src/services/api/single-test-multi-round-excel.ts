/**
 * Multi-round Excel batch test API
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';
import type { MultiRoundSubmitResponse } from './single-test-multi-round';

export type MultiRoundExcelSubmitResponse = MultiRoundSubmitResponse & {
  instructionCount: number;
  failedRoundsByAgent: Record<string, number>;
};

export const singleTestMultiRoundExcelApi = {
  downloadTemplate: async (): Promise<Blob> => {
    const response = await apiClient.get('/single-test/multi-round/template', {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  submitExcel: async (payload: {
    file: File;
    agentIds: string[];
    judgeModel: string;
    batchName?: string;
  }): Promise<MultiRoundExcelSubmitResponse> => {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('agentIds', JSON.stringify(payload.agentIds));
    form.append('judgeModel', payload.judgeModel);
    if (payload.batchName?.trim()) {
      form.append('batchName', payload.batchName.trim());
    }

    const response = await apiClient.post<ApiResponse<MultiRoundExcelSubmitResponse>>(
      '/single-test/multi-round/excel-submit',
      form,
      {
        timeout: 1_800_000,
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return handleApiResponse(response.data);
  },
};
