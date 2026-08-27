/**
 * API Client Configuration
 * Handles HTTP requests with authentication, organization context, and error handling
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { useOrganizationStore } from '@/stores/organization-store';
import type { ApiResponse } from '@/types/api';

// Get API base URL from environment variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// 输出 API 基础 URL 配置
console.log('[API Client] Initialized with baseURL:', API_BASE_URL);

/**
 * Create axios instance with default configuration
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    // 添加 no-cache 头来避免 304 响应
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  },
});

/**
 * Request interceptor
 * - Adds authentication token
 * - Adds organization ID to requests
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 对于 /users 请求，添加详细日志
    if (config.url?.includes('/users')) {
      console.log(
        `[API Client] ✅ Request interceptor CALLED - ${config.method?.toUpperCase()} ${config.url}`,
        {
          baseURL: config.baseURL,
          fullURL: `${config.baseURL || ''}${config.url}`,
          params: config.params,
          hasHeaders: !!config.headers,
          timestamp: new Date().toISOString(),
        },
      );
      console.log(`[API Client] Request will be sent to: ${config.baseURL || ''}${config.url}`);
    }

    // Add authentication token
    const token = useAuthStore.getState().auth.accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      // Debug: log token for all requests (especially users)
      if (config.url?.includes('/users') || config.url?.includes('/vulnerabilities')) {
        console.log(
          `[API Client] ${config.method?.toUpperCase()} ${config.url} - Token added:`,
          token.substring(0, 20) + '...',
        );
      }
    } else {
      // Debug: log missing token for all requests
      if (config.url?.includes('/users') || config.url?.includes('/vulnerabilities')) {
        console.warn(
          `[API Client] ${config.method?.toUpperCase()} ${config.url} - No token found in auth store`,
        );
        console.warn('[API Client] Auth store state:', {
          hasAuth: !!useAuthStore.getState().auth,
          accessToken: useAuthStore.getState().auth?.accessToken ? 'exists' : 'missing',
        });
      }
    }

    // Add organization ID to query params or request body
    const currentOrg = useOrganizationStore.getState().currentOrg;
    console.log(
      '[API Client] Current org:',
      currentOrg ? { id: currentOrg.id, name: currentOrg.name } : 'none',
    );

    if (currentOrg) {
      // Get the full URL (baseURL + url) for checking
      const fullUrl = config.url || '';
      const baseUrl = config.baseURL || '';
      const requestUrl = baseUrl + fullUrl;

      console.log('[API Client] Processing request:', {
        method: config.method,
        fullUrl: requestUrl,
        hasOrg: !!currentOrg,
        orgId: currentOrg.id,
      });

      // Skip adding organizationId for organization creation requests
      const isOrgCreateRequest =
        requestUrl.includes('/organizations') &&
        (config.method === 'post' || config.method === 'POST');

      // Skip adding organizationId for organizations list requests
      const isOrgListRequest =
        requestUrl.includes('/organizations') &&
        (config.method === 'get' || config.method === 'GET');

      // For GET requests (except organizations list), add to query params
      if ((config.method === 'get' || config.method === 'GET') && !isOrgListRequest) {
        config.params = {
          ...config.params,
          organizationId: currentOrg.id,
        };
        console.log('[API Client] Added organizationId to GET params:', config.params);
      }
      // For other requests (except organization creation), add to request body if it exists.
      // Never spread FormData: it would drop file fields and replace the body with a plain object
      // (e.g. only { organizationId }), breaking multipart uploads and causing 400 from the API.
      else if (
        !isOrgCreateRequest &&
        config.data &&
        typeof config.data === 'object' &&
        !(config.data instanceof FormData) &&
        currentOrg.id
      ) {
        config.data = {
          ...config.data,
          organizationId: currentOrg.id,
        };
        console.log('[API Client] Added organizationId to request body');
      }
    } else {
      console.warn('[API Client] No current organization found');
    }

    if (config.data instanceof FormData) {
      // Let the runtime set multipart boundary; default `application/json` would break uploads.
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

/**
 * Response interceptor
 * - Handles authentication errors (401)
 * - Handles permission/quota errors (403)
 * - Handles server errors (500+)
 * - Transforms response to ApiResponse format
 */
apiClient.interceptors.response.use(
  (response) => {
    // 对于 /users 请求，添加详细日志
    if (response.config.url?.includes('/users')) {
      console.log(
        `[API Client] Response interceptor - ${response.config.method?.toUpperCase()} ${response.config.url}`,
        {
          status: response.status,
          statusText: response.statusText,
          hasData: !!response.data,
          dataKeys: response.data ? Object.keys(response.data) : [],
        },
      );
    }

    // 处理 304 响应（Not Modified）
    if (response.status === 304) {
      console.warn('[API Client] Received 304 Not Modified response for:', response.config.url);
      // 304 响应通常没有响应体，需要重新请求
      // 抛出错误让 React Query 重试
      throw new Error('304 Not Modified - Cache expired, please retry');
    }

    // Return the full response object, not just response.data
    // This allows API services to access response.data.data for ApiResponse<T> format
    return response;
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    let parsedBlobErrorData: ApiResponse<unknown> | Record<string, unknown> | undefined;

    if (error.response?.data instanceof Blob) {
      const text = await error.response.data.text();
      if (text.trim()) {
        try {
          parsedBlobErrorData = JSON.parse(text) as ApiResponse<unknown>;
          error.response.data = parsedBlobErrorData as ApiResponse<unknown>;
        } catch {
          parsedBlobErrorData = { message: text.trim() };
          error.response.data = parsedBlobErrorData as unknown as ApiResponse<unknown>;
        }
      }
    }

    // Handle 401 Unauthorized - Token expired or invalid
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Try to refresh token (if refresh logic exists)
      try {
        // TODO: Implement token refresh logic
        // const newToken = await refreshToken()
        // useAuthStore.getState().auth.setAccessToken(newToken)
        // originalRequest.headers.Authorization = `Bearer ${newToken}`
        // return apiClient(originalRequest)
      } catch {
        // Refresh failed, fall through to reset
      }

      // Clear auth state (including persisted user cookie) and redirect to sign-in
      useAuthStore.getState().auth.reset();
      window.location.href = '/sign-in';
      return Promise.reject(error);
    }

    const shouldShowGlobalErrorToast = originalRequest.method?.toLowerCase() !== 'get';

    // Handle 403 Forbidden - Permission denied or quota exceeded
    if (error.response?.status === 403 && shouldShowGlobalErrorToast) {
      const errorData = (error.response?.data ?? undefined) as unknown as
        | Record<string, unknown>
        | undefined;
      const code =
        errorData?.code ??
        (typeof errorData?.error === 'object' &&
        errorData?.error !== null &&
        'code' in errorData.error
          ? (errorData.error as { code?: string }).code
          : undefined);
      const msg =
        (errorData?.message as string | undefined) ??
        (typeof errorData?.error === 'object' &&
        errorData?.error !== null &&
        'message' in errorData.error
          ? (errorData.error as { message?: string }).message
          : undefined);
      if (code === 'QUOTA_EXCEEDED') {
        toast.error(`配额不足: ${msg || 'Unknown metric'}`);
      } else if (code === 'PERMISSION_DENIED') {
        toast.error('权限不足，无法执行此操作');
      } else {
        toast.error('访问被拒绝');
      }
    }

    // Handle 500+ Server errors
    if (
      error.response?.status &&
      error.response.status >= 500 &&
      shouldShowGlobalErrorToast
    ) {
      toast.error('服务器错误，请稍后重试');
    }

    // Transform error to ApiError format
    // For API errors, extract error message from error.response.data.error or error.response.data
    const responseData = error.response?.data;
    let errorMessage = error.message || 'Request failed';
    let errorCode: string | undefined = undefined;
    let errorDetails: string | { message?: string; code?: string } | undefined = undefined;

    // Check if response has standard API error format: {success: false, error: {...}}
    const err = responseData?.error;
    if (err !== undefined && err !== null) {
      errorMessage =
        typeof err === 'string' ? err : (err as { message?: string }).message || errorMessage;
      errorCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code?: string }).code
          : undefined;
      errorDetails = typeof err === 'string' ? err : (err as { message?: string; code?: string });
    } else if (responseData?.message) {
      errorMessage = responseData.message;
      errorCode = responseData.code;
    }

    // Create a custom error object that preserves the original structure
    const apiError: any = {
      message: errorMessage,
      code: errorCode,
      status: error.response?.status,
      details: errorDetails,
      // Preserve original response for debugging
      response: error.response,
    };

    return Promise.reject(apiError);
  },
);

/**
 * Message for failed requests. The axios error interceptor rejects a plain
 * object `{ message, code, status, ... }`, not an `Error`, so always use this
 * in UI instead of `String(error)` (which becomes "[object Object]").
 */
export function getApiClientErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string' && m.length > 0) {
      return m;
    }
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Type-safe API response helper
 */
/**
 * Human-readable message for failed requests. Axios interceptor rejects with a
 * plain `{ message, code, ... }` object (not an Error), so `String(err)` becomes "[object Object]".
 */
export function formatApiClientError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.trim() !== '') {
      return o.message;
    }
  }
  try {
    return JSON.stringify(err);
  } catch {
    return 'Request failed';
  }
}

export function handleApiResponse<T>(response: ApiResponse<T>): T {
  if (!response) {
    throw new Error('API response is null or undefined');
  }

  if (!response.success) {
    // Extract error message from various possible formats
    let errorMessage = 'API request failed';

    // Check for error object with message
    if (response.error) {
      if (typeof response.error === 'string') {
        errorMessage = response.error;
      } else if (
        typeof response.error === 'object' &&
        response.error !== null &&
        'message' in response.error
      ) {
        errorMessage = (response.error as { message?: string }).message || errorMessage;
      } else if (typeof response.error === 'object') {
        // Try to extract meaningful message from error object
        const errorObj = response.error as Record<string, unknown>;
        if (errorObj.message) {
          errorMessage = String(errorObj.message);
        } else if (errorObj.code && errorObj.type) {
          errorMessage = `${errorObj.type}: ${errorObj.code}`;
        } else {
          errorMessage = JSON.stringify(response.error);
        }
      }
    }
    // Check for direct message field
    else if (response.message) {
      errorMessage = response.message;
    }

    // Create error object that preserves the original structure
    const apiError: any = new Error(errorMessage);
    apiError.response = response;
    apiError.error = response.error;
    throw apiError;
  }

  // Check if data exists (it might be null for some responses, which is valid)
  if (response.data === undefined) {
    throw new Error('API response missing data');
  }

  return response.data;
}

export default apiClient;
