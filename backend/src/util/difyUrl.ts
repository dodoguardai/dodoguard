export type DifyApiType = 'chat' | 'workflow';

/**
 * Dify `apiBaseUrl` should be the API root (e.g. `https://api.dify.ai`).
 * Callers append `/v1/chat-messages` or `/v1/workflows/run`.
 * Users often paste a full endpoint or include `/v1`, which causes duplicated paths and HTML 404 pages.
 */
export function normalizeDifyApiBaseUrl(baseUrl: string): string {
  let u = baseUrl.trim().replace(/\/+$/, '');
  u = u.replace(/\/v1\/chat-messages\/?$/i, '');
  u = u.replace(/\/v1\/workflows\/run\/?$/i, '');
  u = u.replace(/\/v1\/?$/i, '');
  return u.replace(/\/+$/, '');
}

/** Node fetch may resolve `localhost` to IPv6 (::1) while Docker-mapped Dify listens on IPv4 only. */
export function preferIpv4LoopbackBaseUrl(baseUrl: string): string {
  const normalized = normalizeDifyApiBaseUrl(baseUrl);
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === 'localhost' || parsed.hostname === '::1') {
      parsed.hostname = '127.0.0.1';
    }
    return parsed.origin.replace(/\/$/, '');
  } catch {
    return normalized;
  }
}

export function buildDifyApiUrl(baseUrl: string, apiType: DifyApiType): string {
  const root = preferIpv4LoopbackBaseUrl(baseUrl);
  const path = apiType === 'workflow' ? '/v1/workflows/run' : '/v1/chat-messages';
  return `${root}${path}`;
}

export function resolveDifyApiType(apiType: unknown): DifyApiType {
  return apiType === 'workflow' ? 'workflow' : 'chat';
}

/**
 * Human-readable preview when Dify returns non-JSON HTTP errors (common with wrong base URL).
 */
export function formatDifyHttpErrorPreview(
  status: number,
  body: string,
  apiType: DifyApiType,
): string {
  const trimmed = body.trim();
  const looksLikeHtml =
    trimmed.startsWith('<!') ||
    trimmed.startsWith('<html') ||
    /<html[\s>]/i.test(trimmed) ||
    /404/.test(trimmed.slice(0, 200));

  if (status === 404 || (status >= 400 && looksLikeHtml)) {
    const endpoint = apiType === 'workflow' ? '/v1/workflows/run' : '/v1/chat-messages';
    return `HTTP ${status || '错误'}：无法访问 Dify ${apiType === 'workflow' ? '工作流' : '对话'} API（${endpoint}）。请检查：1) apiBaseUrl 填写为 API 根地址（如 https://api.dify.ai），不要包含 /v1 或完整接口路径；2) 接口类型与 Dify 应用类型一致；3) API Key 来自对应应用。`;
  }

  if (status >= 400) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const message =
        (typeof parsed.message === 'string' && parsed.message) ||
        (typeof parsed.error === 'string' && parsed.error) ||
        (parsed.error &&
          typeof parsed.error === 'object' &&
          typeof (parsed.error as Record<string, unknown>).message === 'string' &&
          ((parsed.error as Record<string, unknown>).message as string));
      if (message) {
        return `HTTP ${status}: ${message}`;
      }
    } catch {
      // fall through
    }
  }

  return trimmed.slice(0, 4000);
}
