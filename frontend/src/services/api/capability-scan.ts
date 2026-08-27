/**
 * Multi-engine capability scan API.
 */

import apiClient, { handleApiResponse } from './client';
import type { ScanArtifactKind, ScanStrategy } from 'capability-audit/shared/scan';
import type { ApiResponse } from '@/types/api';

import type { SkillsMdAuditData } from './skills-md-audit';

export type EngineRunStatus = {
  engine: string;
  status: 'success' | 'skipped' | 'failed' | 'timeout';
  findingCount: number;
  message?: string;
  durationMs?: number;
};

export type EngineHealthStatus = {
  engine: string;
  available: boolean;
  required: boolean;
  phase: 'phase1' | 'phase2' | 'phase3' | 'online' | 'debug';
  path?: string;
  version?: string;
  message?: string;
};

export type SkillPreviewFile = {
  path: string;
  kind: 'instruction' | 'script' | 'config' | 'dependency' | 'data' | 'other';
  sizeBytes?: number;
  lineCount?: number;
  content?: string;
};

export type SkillPreview = {
  files: SkillPreviewFile[];
  stats: Array<{ kind: string; count: number; lines: number }>;
  defaultExpanded?: string;
};

export type CapabilityScanPayload = SkillsMdAuditData & {
  reportId?: string;
  securityScanTaskId?: string;
  remediationIds?: string[];
  registryId?: string;
  syncedFindings?: number;
  scan?: {
    taskId: string;
    status: 'completed' | 'partial_completed' | 'failed';
    strategy: ScanStrategy;
    artifactKind: ScanArtifactKind;
    engines: EngineRunStatus[];
    assetManifest?: Array<{ path: string; kind: string }>;
    skillPreview?: SkillPreview;
  };
};

export type ScanTaskSummary = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'partial_completed' | 'failed' | 'canceled';
  createdAt: string;
  updatedAt: string;
  fileName?: string;
  error?: string;
  overallRisk?: string;
  findingCount?: number;
};

export type ScanArtifactDescriptor = {
  kind: 'json' | 'sarif' | string;
  mediaType: string;
  path: string;
};

const SCAN_TIMEOUT_MS = 600_000;
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 300;

export type CapabilityScanRequest = {
  strategy: ScanStrategy;
  artifactKind: ScanArtifactKind;
  archive?: File;
  sourceUrl?: string;
  markdown?: string;
  fileName?: string;
  provider?: { id: string; config?: Record<string, unknown> };
  engines?: string[];
  callbackUrl?: string;
};

function buildFormData(body: CapabilityScanRequest): FormData {
  const formData = new FormData();
  if (body.archive) {
    formData.append('archive', body.archive, body.archive.name);
  }
  formData.append('strategy', body.strategy);
  formData.append('artifactKind', body.artifactKind);
  if (body.provider) {
    formData.append('provider', JSON.stringify(body.provider));
  }
  if (body.engines?.length) {
    formData.append('engines', JSON.stringify(body.engines));
  }
  if (body.callbackUrl) {
    formData.append('callbackUrl', body.callbackUrl);
  }
  return formData;
}

function multipartConfig(timeout: number) {
  return {
    timeout,
    transformRequest: [
      (data: unknown, headers: Record<string, string>) => {
        if (data instanceof FormData) {
          delete headers['Content-Type'];
        }
        return data as FormData;
      },
    ],
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export const capabilityScanApi = {
  analyze: async (body: CapabilityScanRequest): Promise<CapabilityScanPayload> => {
    if (body.archive) {
      const response = await apiClient.post<ApiResponse<CapabilityScanPayload>>(
        '/capability-scan/analyze',
        buildFormData(body),
        multipartConfig(SCAN_TIMEOUT_MS),
      );
      return handleApiResponse(response.data);
    }

    const response = await apiClient.post<ApiResponse<CapabilityScanPayload>>(
      '/capability-scan/analyze',
      {
        strategy: body.strategy,
        artifactKind: body.artifactKind,
        markdown: body.markdown,
        sourceUrl: body.sourceUrl,
        fileName: body.fileName,
        provider: body.provider,
        engines: body.engines,
        callbackUrl: body.callbackUrl,
      },
      { timeout: SCAN_TIMEOUT_MS },
    );
    return handleApiResponse(response.data);
  },

  createTask: async (
    body: CapabilityScanRequest,
  ): Promise<{ taskId: string; status: 'queued' }> => {
    if (body.archive) {
      const response = await apiClient.post<ApiResponse<{ taskId: string; status: 'queued' }>>(
        '/capability-scan/tasks',
        buildFormData(body),
        multipartConfig(SCAN_TIMEOUT_MS),
      );
      return handleApiResponse(response.data);
    }

    const response = await apiClient.post<ApiResponse<{ taskId: string; status: 'queued' }>>(
      '/capability-scan/tasks',
      {
        strategy: body.strategy,
        artifactKind: body.artifactKind,
        markdown: body.markdown,
        sourceUrl: body.sourceUrl,
        fileName: body.fileName,
        provider: body.provider,
        engines: body.engines,
        callbackUrl: body.callbackUrl,
      },
      { timeout: 60_000 },
    );
    return handleApiResponse(response.data);
  },

  getTask: async (
    taskId: string,
  ): Promise<CapabilityScanPayload & { taskId: string; status: string }> => {
    const response = await apiClient.get<
      ApiResponse<CapabilityScanPayload & { taskId: string; status: string }>
    >(`/capability-scan/tasks/${taskId}`);
    return handleApiResponse(response.data);
  },

  waitForTask: async (
    taskId: string,
    onProgress?: (status: string) => void,
  ): Promise<CapabilityScanPayload & { taskId: string; status: string }> => {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i += 1) {
      const data = await capabilityScanApi.getTask(taskId);
      onProgress?.(data.status);
      if (data.status !== 'queued' && data.status !== 'running') {
        return data;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error('Scan task timed out while polling');
  },

  downloadSarif: async (taskId: string): Promise<Blob> => {
    const response = await apiClient.get(`/capability-scan/tasks/${taskId}/sarif`, {
      responseType: 'blob',
      timeout: 60_000,
    });
    return response.data as Blob;
  },

  listTasks: async (): Promise<ScanTaskSummary[]> => {
    const response = await apiClient.get<ApiResponse<ScanTaskSummary[]>>('/capability-scan/tasks');
    return handleApiResponse(response.data);
  },

  cancelTask: async (taskId: string): Promise<ScanTaskSummary> => {
    const response = await apiClient.post<ApiResponse<ScanTaskSummary>>(
      `/capability-scans/${taskId}/cancel`,
    );
    return handleApiResponse(response.data);
  },

  getFindings: async (taskId: string): Promise<CapabilityScanPayload['findings']> => {
    const response = await apiClient.get<ApiResponse<CapabilityScanPayload['findings']>>(
      `/capability-scans/${taskId}/findings`,
    );
    return handleApiResponse(response.data);
  },

  getAssets: async (
    taskId: string,
  ): Promise<NonNullable<CapabilityScanPayload['scan']>['assetManifest']> => {
    const response = await apiClient.get<
      ApiResponse<NonNullable<CapabilityScanPayload['scan']>['assetManifest']>
    >(`/capability-scans/${taskId}/assets`);
    return handleApiResponse(response.data);
  },

  getArtifacts: async (taskId: string): Promise<ScanArtifactDescriptor[]> => {
    const response = await apiClient.get<ApiResponse<ScanArtifactDescriptor[]>>(
      `/capability-scans/${taskId}/artifacts`,
    );
    return handleApiResponse(response.data);
  },

  listEngineStatus: async (): Promise<EngineHealthStatus[]> => {
    const response = await apiClient.get<ApiResponse<EngineHealthStatus[]>>('/engines/status');
    return handleApiResponse(response.data);
  },
};
