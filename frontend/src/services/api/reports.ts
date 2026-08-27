/**
 * Reports API Service
 */

import axios from 'axios';
import apiClient, { handleApiResponse } from './client';
import type {
  ApiResponse,
  GenerateReportRequest,
  PaginatedResponse,
  PaginationParams,
  ReportDownloadRequest,
} from '@/types/api';
import type { Report } from '@/types/entities';

export const reportsApi = {
  /**
   * List reports
   */
  list: async (
    params?: PaginationParams & { taskId?: string; format?: string; reportType?: string },
  ): Promise<PaginatedResponse<Report>> => {
    const response = await apiClient.get<ApiResponse<any>>('/reports', { params });
    const result = handleApiResponse(response.data);

    // Backend currently returns { reports, total, limit, offset }.
    // Normalize to PaginatedResponse shape expected by the UI.
    const items: Report[] = Array.isArray(result.data)
      ? result.data
      : Array.isArray(result.reports)
        ? result.reports
        : [];

    const total: number = typeof result.total === 'number' ? result.total : items.length;
    const limit: number = typeof result.limit === 'number' ? result.limit : (params?.limit ?? 50);
    const offset: number =
      typeof result.offset === 'number' ? result.offset : (params?.offset ?? 0);

    return {
      data: items,
      total,
      limit,
      offset,
      hasMore: total > offset + items.length,
    };
  },

  /**
   * Get report by ID
   */
  get: async (id: string): Promise<Report> => {
    const response = await apiClient.get<ApiResponse<Report>>(`/reports/${id}`);
    return handleApiResponse(response.data);
  },

  /**
   * Generate report
   */
  generate: async (data: GenerateReportRequest): Promise<Report> => {
    const format = data.format ?? 'pdf';
    // PDF/DOCX use Playwright or heavy conversion; allow up to 10 min (matches qna-excel / poc-suite).
    const timeout = format === 'pdf' || format === 'docx' ? 600_000 : 120_000;
    const response = await apiClient.post<ApiResponse<Report>>('/reports/generate', data, {
      timeout,
    });
    return handleApiResponse(response.data);
  },

  /**
   * Download report
   */
  download: async (data: ReportDownloadRequest): Promise<Blob> => {
    try {
      const response = await apiClient.get(`/reports/${data.reportId}/download`, {
        params: { format: data.format },
        responseType: 'blob',
        timeout: data.format === 'pdf' ? 240_000 : data.format === 'docx' ? 600_000 : 120_000,
      });
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
          const msg = parsed.error?.message || parsed.message;
          if (msg) {
            throw new Error(msg);
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            if (text.trim()) {
              throw new Error(text.trim());
            }
          } else {
            throw e;
          }
        }
      }
      throw err;
    }
  },

  /**
   * Render an in-app HTML report snapshot to PDF.
   */
  renderHtmlPdf: async (data: { title: string; html: string }): Promise<Blob> => {
    try {
      const response = await apiClient.post<Blob>('/reports/html/pdf', data, {
        responseType: 'blob',
        timeout: 240_000,
      });
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
          const msg = parsed.error?.message || parsed.message;
          if (msg) {
            throw new Error(msg);
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            if (text.trim()) {
              throw new Error(text.trim());
            }
          } else {
            throw e;
          }
        }
      }
      throw err;
    }
  },

  /**
   * Render an in-app HTML report snapshot to Word.
   */
  renderHtmlDocx: async (data: { title: string; html: string }): Promise<Blob> => {
    try {
      const response = await apiClient.post<Blob>('/reports/html/docx', data, {
        responseType: 'blob',
        timeout: 600_000,
      });
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
          const msg = parsed.error?.message || parsed.message;
          if (msg) {
            throw new Error(msg);
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            if (text.trim()) {
              throw new Error(text.trim());
            }
          } else {
            throw e;
          }
        }
      }
      throw err;
    }
  },

  /**
   * Read report image assets as data URIs for self-contained HTML/PDF snapshots.
   */
  getAssetDataUri: async (asset: 'cover-image' | 'logo'): Promise<string> => {
    const response = await apiClient.get<ApiResponse<{ dataUri: string }>>(
      `/reports/assets/${asset}`,
    );
    const result = handleApiResponse(response.data);
    return result.dataUri;
  },

  /**
   * 上传 Excel（首表含类型、问题、实际回答），服务端归纳后生成 PDF。
   */
  downloadQnaExcelPdf: async (options: {
    file: File;
    reportTitle?: string;
    targetDisplayName?: string;
    scenarioBlurb?: string;
    executionNote?: string;
    summarySubjectName?: string;
  }): Promise<Blob> => {
    const form = new FormData();
    form.append('file', options.file);
    if (options.reportTitle) {
      form.append('reportTitle', options.reportTitle);
    }
    if (options.targetDisplayName) {
      form.append('targetDisplayName', options.targetDisplayName);
    }
    if (options.scenarioBlurb) {
      form.append('scenarioBlurb', options.scenarioBlurb);
    }
    if (options.executionNote) {
      form.append('executionNote', options.executionNote);
    }
    if (options.summarySubjectName) {
      form.append('summarySubjectName', options.summarySubjectName);
    }
    try {
      const response = await apiClient.post<Blob>('/reports/qna-excel/pdf', form, {
        responseType: 'blob',
        timeout: 600_000,
      });
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string } };
          const msg = parsed.error?.message;
          if (msg) {
            throw new Error(msg);
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            /* not JSON */
          } else {
            throw e;
          }
        }
      }
      throw err;
    }
  },

  /**
   * PoC suite: zip of PDFs (server renders each HTML via Playwright).
   */
  downloadPocSuitePdfZip: async (payload: {
    taskId: string;
    documents: Array<{ baseName: string; html: string }>;
  }): Promise<Blob> => {
    try {
      // 多份 HTML 串行转 PDF，弱机/Docker 下可能较慢；略长于「单份报告 PDF」的等待上限。
      const response = await apiClient.post<Blob>('/reports/poc-suite-bundle/pdf', payload, {
        responseType: 'blob',
        timeout: 600_000,
      });
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string } };
          const msg = parsed.error?.message;
          if (msg) {
            throw new Error(msg);
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            /* not JSON */
          } else {
            throw e;
          }
        }
      }
      throw err;
    }
  },

  /**
   * Delete report
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/reports/${id}`);
  },

  /**
   * Get report templates
   */
  getTemplates: async (): Promise<
    Array<{
      id: string;
      name: string;
      description?: string;
      enabled: boolean;
    }>
  > => {
    const response =
      await apiClient.get<
        ApiResponse<
          Array<{
            id: string;
            name: string;
            description?: string;
            enabled: boolean;
          }>
        >
      >('/reports/templates');
    return handleApiResponse(response.data);
  },
};
