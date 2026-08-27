/**
 * Manage programmatic API keys (JWT session — same as browser login).
 * Integration calls use these keys as Bearer tokens against `/external/*`.
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

export type ExternalApiKeyRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  name: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateExternalApiKeyResponse = ExternalApiKeyRecord & {
  apiKey: string;
  warning?: string;
};

export type RotateExternalApiKeyResponse = ExternalApiKeyRecord & {
  revokedKeyId: string;
  apiKey: string;
  warning?: string;
};

type ListExternalApiKeysResponse = ApiResponse<ExternalApiKeyRecord[]> & {
  meta?: { externalApiKeysTableMissing?: boolean };
};

export const externalApiKeysApi = {
  /** Keys plus optional flag when DB migration 0039 has not been applied */
  list: async (): Promise<{ keys: ExternalApiKeyRecord[]; tableMissing?: boolean }> => {
    const res = await apiClient.get<ListExternalApiKeysResponse>('/external-api-keys');
    const body = res.data;
    if (!body?.success) {
      const err = body?.error;
      const msg =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Failed to list API keys';
      throw new Error(msg);
    }
    return {
      keys: body.data ?? [],
      tableMissing: Boolean(body.meta?.externalApiKeysTableMissing),
    };
  },

  create: async (body: {
    name: string;
    expiresAt?: string | null;
    neverExpires?: boolean;
    scopes?: string[];
  }): Promise<CreateExternalApiKeyResponse> => {
    const res = await apiClient.post<ApiResponse<CreateExternalApiKeyResponse>>(
      '/external-api-keys',
      body,
    );
    return handleApiResponse(res.data);
  },

  revoke: async (id: string): Promise<{ id: string; status: string }> => {
    const res = await apiClient.delete<ApiResponse<{ id: string; status: string }>>(
      `/external-api-keys/${id}`,
    );
    return handleApiResponse(res.data);
  },

  /** Remove a revoked key row from storage (must already be revoked). */
  purgeRevoked: async (id: string): Promise<{ id: string; deleted: boolean }> => {
    const res = await apiClient.delete<ApiResponse<{ id: string; deleted: boolean }>>(
      `/external-api-keys/${id}/permanent`,
    );
    return handleApiResponse(res.data);
  },

  rotate: async (id: string): Promise<RotateExternalApiKeyResponse> => {
    const res = await apiClient.post<ApiResponse<RotateExternalApiKeyResponse>>(
      `/external-api-keys/${id}/rotate`,
      {},
    );
    return handleApiResponse(res.data);
  },

  listScopes: async (): Promise<{
    scopes: string[];
    defaults: string[];
    groups: Array<{ id: string; scopes: string[] }>;
  }> => {
    const res = await apiClient.get<
      ApiResponse<{
        scopes: string[];
        defaults: string[];
        groups: Array<{ id: string; scopes: string[] }>;
      }>
    >('/external-api-keys/scopes');
    return handleApiResponse(res.data);
  },
};
