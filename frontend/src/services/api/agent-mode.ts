/**
 * Agent mode API — conversational task builder.
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

export type AgentModeBundledSkill = {
  slug: string;
  manifest: {
    name: string;
    description: string;
    id?: string;
    version?: string;
    slug?: string;
    supportedSurfaces?: string[];
  };
};

export type AgentModeChatResponse = {
  assistant: string;
  draftTask?: unknown;
  validation?: { ok: boolean; errors?: unknown };
  providerId?: string;
};

export const agentModeApi = {
  listBundledSkills: async (): Promise<AgentModeBundledSkill[]> => {
    const response = await apiClient.get<ApiResponse<AgentModeBundledSkill[]>>(
      '/agent/bundled-skills',
    );
    return handleApiResponse(response.data);
  },

  chat: async (body: {
    surface: string;
    targetAgentId?: string;
    pinnedSkillSlug?: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
  }): Promise<AgentModeChatResponse> => {
    const response = await apiClient.post<ApiResponse<AgentModeChatResponse>>(
      '/agent/chat',
      body,
    );
    return handleApiResponse(response.data);
  },
};
