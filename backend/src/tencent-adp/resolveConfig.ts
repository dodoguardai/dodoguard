import { DEFAULT_ADP_REGION, DEFAULT_ADP_SSE_URL, DEFAULT_ADP_WS_URL } from './constants';
import type { TencentAdpAgentConfig, TencentAdpResolvedConfig } from './types';

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  const trimmed = String(raw ?? '').trim();
  return (trimmed || fallback).replace(/\/$/, '');
}

function normalizeCustomVariables(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => key.trim() && item !== undefined && item !== null)
      .map(([key, item]) => [key.trim(), typeof item === 'string' ? item : String(item)]),
  );
}

export function resolveTencentAdpConfig(
  config: TencentAdpAgentConfig | Record<string, unknown> | null | undefined,
): TencentAdpResolvedConfig | null {
  const c = (config || {}) as TencentAdpAgentConfig;
  const appKey = String(c.apiKey ?? '').trim();
  const visitorId = String(c.userId ?? '').trim();
  if (!appKey || !visitorId) {
    return null;
  }

  const baseUrl = normalizeBaseUrl(c.apiBaseUrl, 'https://wss.lke.cloud.tencent.com');
  const transportMode = c.transportMode === 'websocket' ? 'websocket' : 'sse';
  const sseUrl =
    baseUrl.includes('/adp/v2/chat') || baseUrl.endsWith('/chat')
      ? baseUrl
      : `${baseUrl}/adp/v2/chat`;
  const wsUrl = baseUrl.includes('/adp/v2/chat/conn')
    ? baseUrl
    : `${baseUrl.replace(/\/adp\/v2\/chat$/, '')}/adp/v2/chat/conn/?language=zh-CN&EIO=4&transport=websocket`;

  const conversationId =
    typeof c.conversationId === 'string' && c.conversationId.trim()
      ? c.conversationId.trim()
      : undefined;

  const secretId = String(c.tencentSecretId ?? '').trim() || undefined;
  const secretKey = String(c.tencentSecretKey ?? '').trim() || undefined;
  const region = String(c.tencentRegion ?? '').trim() || DEFAULT_ADP_REGION;

  const stream = c.stream === 'enable' || c.stream === 'disable' ? c.stream : ('enable' as const);
  const customVariables = {
    ...normalizeCustomVariables(c.inputs),
    ...normalizeCustomVariables(c.customVariables),
  };

  return {
    appKey,
    visitorId,
    conversationId,
    transportMode,
    sseUrl: sseUrl || DEFAULT_ADP_SSE_URL,
    wsUrl: wsUrl || DEFAULT_ADP_WS_URL,
    secretId,
    secretKey,
    region,
    incremental: c.incremental !== false,
    stream,
    customVariables,
  };
}

export function validateTencentAdpConfigForTransport(
  resolved: TencentAdpResolvedConfig,
): string | null {
  if (resolved.transportMode === 'websocket') {
    if (!resolved.secretId || !resolved.secretKey) {
      return 'WebSocket 模式需要配置腾讯云 SecretId 和 SecretKey（用于 GetWsToken）';
    }
  }
  return null;
}
