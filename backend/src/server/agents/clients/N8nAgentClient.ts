import { fetchWithProxy } from '../../../util/fetch/index';
import logger from '../../../logger';
import type {
  TargetAgentClient,
  TargetAgentClientContext,
  TargetAgentRecord,
  TestConnectionResult,
} from '../types';

type N8nAgentConfig = {
  apiBaseUrl?: string;
  apiKey?: string;
  webhookPath?: string;
  webhookUrl?: string;
  userId?: string;
  conversationId?: string;
  inputs?: Record<string, unknown>;
  n8nApiKeyHeaderName?: string;
  n8nApiKeyPrefix?: string;
  n8nRequestBodyMode?: 'compat' | 'flat';
  n8nQueryFieldName?: string;
  additionalHeaders?: Record<string, string>;
};

export class N8nAgentClient implements TargetAgentClient {
  constructor(
    private readonly agent: TargetAgentRecord,
    private readonly context: TargetAgentClientContext,
  ) {}

  async testConnection(): Promise<TestConnectionResult> {
    const startTime = Date.now();
    const config = (this.agent.config || {}) as N8nAgentConfig;

    const apiBaseUrl = config?.apiBaseUrl;
    const webhookUrl = config?.webhookUrl;
    const webhookPath = config?.webhookPath;
    const apiKey = config?.apiKey;

    if (!webhookUrl && (!apiBaseUrl || !webhookPath)) {
      return {
        status: 'failed',
        message:
          'Missing required configuration: apiBaseUrl + webhookPath (or webhookUrl) are required for N8N agents',
      };
    }

    const baseUrl = apiBaseUrl ? String(apiBaseUrl).replace(/\/$/, '') : '';
    const url = webhookUrl ? String(webhookUrl) : `${baseUrl}${String(webhookPath)}`;

    const userId = config?.userId || 'test-user';
    const conversationId = config?.conversationId || '';
    const inputs = config?.inputs || {};

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config?.additionalHeaders || {}),
    };

    // n8n Webhook "Authentication" is typically configured via a shared secret header.
    // Default to the common `X-N8N-API-KEY` header name, but allow override.
    if (apiKey) {
      const headerName = config?.n8nApiKeyHeaderName || 'X-N8N-API-KEY';
      const prefix = config?.n8nApiKeyPrefix ?? 'Bearer ';
      headers[headerName] = `${prefix}${apiKey}`;
    }

    const requestBodyMode = config?.n8nRequestBodyMode || 'compat';
    const queryFieldName = (config?.n8nQueryFieldName || 'prompt').trim() || 'prompt';
    const requestBody =
      requestBodyMode === 'flat'
        ? {
            ...(inputs || {}),
            [queryFieldName]: 'test',
          }
        : {
            query: 'test',
            prompt: 'test',
            inputs,
            user: userId,
            conversation_id: conversationId,
            conversationId: conversationId,
          };

    logger.info(`Testing N8N connection: ${url}`, {
      organizationId: this.context.organizationId,
      hasInputs: Object.keys(inputs || {}).length > 0,
    });

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          status: 'success',
          message: 'N8N connection test successful',
          responseTime,
        };
      }

      const errorText = await response.text().catch(() => 'Unknown error');
      logger.warn(`N8N connection test failed: ${response.status}`, { error: errorText });

      return {
        status: 'failed',
        message: `N8N connection test failed: ${response.status} ${response.statusText} - ${errorText}`,
        responseTime,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('N8N connection test error:', { message: error?.message });

      return {
        status: 'failed',
        message: `Connection test error: ${error?.message || 'Unknown error'}`,
        responseTime,
      };
    }
  }
}
