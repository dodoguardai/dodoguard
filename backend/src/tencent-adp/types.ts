export type TencentAdpTransportMode = 'sse' | 'websocket';

export interface TencentAdpAgentConfig {
  apiKey?: string;
  apiBaseUrl?: string;
  userId?: string;
  conversationId?: string;
  inputs?: Record<string, unknown>;
  customVariables?: Record<string, unknown>;
  transportMode?: TencentAdpTransportMode;
  tencentSecretId?: string;
  tencentSecretKey?: string;
  tencentRegion?: string;
  incremental?: boolean;
  stream?: 'enable' | 'disable' | '';
}

export interface TencentAdpResolvedConfig {
  appKey: string;
  visitorId: string;
  conversationId?: string;
  transportMode: TencentAdpTransportMode;
  sseUrl: string;
  wsUrl: string;
  secretId?: string;
  secretKey?: string;
  region: string;
  incremental: boolean;
  stream: 'enable' | 'disable' | '';
  customVariables: Record<string, string>;
}

export interface TencentAdpChatResult {
  ok: boolean;
  status: number;
  preview: string;
  durationMs: number;
  rawBody: string;
  conversationId: string;
  errorMessage?: string;
}
