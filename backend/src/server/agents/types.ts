export type TargetAgentType =
  | 'dify'
  | 'coze'
  | 'n8n'
  | 'fastgpt'
  | 'tencent-adp'
  | 'api'
  | 'api-stream'
  | 'langchain'
  | 'custom'
  | 'other';

export interface TargetAgentRecord {
  id: string;
  type: TargetAgentType | string;
  config: Record<string, unknown> | null;
  name?: string;
  icon?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type TestConnectionStatus = 'success' | 'failed';

export interface TestConnectionResult {
  status: TestConnectionStatus;
  message: string;
  responseTime?: number;
  /** Set when probe succeeded only via streaming while config had blocking. */
  autoCorrectedResponseMode?: 'streaming';
}

export interface TargetAgentClientContext {
  organizationId: string;
}

export interface TargetAgentClient {
  testConnection(): Promise<TestConnectionResult>;
}
