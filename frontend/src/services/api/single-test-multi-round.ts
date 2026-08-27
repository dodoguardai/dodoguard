/**
 * Multi-round single test API
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

export type MultiRoundChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type MultiRoundChatResponse = {
  agentId: string;
  ok: boolean;
  status: number;
  reply: string;
  durationMs: number;
  conversationId?: string;
  error?: string;
  source: string;
};

export type MultiRoundSubmitAgent = {
  agentId: string;
  agentName?: string;
  conversationId?: string;
  messages: MultiRoundChatMessage[];
};

export type MultiRoundSubmitResponse = {
  batchId: string;
  sessionId: string;
  tasks: Array<{ taskId: string; agentId: string; agentName: string }>;
};

export const singleTestMultiRoundApi = {
  chat: async (payload: {
    agentId: string;
    message: string;
    conversationId?: string;
  }): Promise<MultiRoundChatResponse> => {
    const response = await apiClient.post<ApiResponse<MultiRoundChatResponse>>(
      '/single-test/multi-round/chat',
      payload,
      { timeout: 180_000 },
    );
    return handleApiResponse(response.data);
  },

  submit: async (payload: {
    batchName?: string;
    judgeModel: string;
    expectedSuccess?: string;
    sessionId?: string;
    agents: MultiRoundSubmitAgent[];
  }): Promise<MultiRoundSubmitResponse> => {
    const response = await apiClient.post<ApiResponse<MultiRoundSubmitResponse>>(
      '/single-test/multi-round/submit',
      payload,
    );
    return handleApiResponse(response.data);
  },
};
