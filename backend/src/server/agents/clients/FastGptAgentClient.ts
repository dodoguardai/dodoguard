import { fetchWithProxy } from '../../../util/fetch/index';
import logger from '../../../logger';
import {
  TargetAgentClient,
  TargetAgentClientContext,
  TargetAgentRecord,
  TestConnectionResult,
} from '../types';

export class FastGptAgentClient implements TargetAgentClient {
  constructor(
    private readonly agent: TargetAgentRecord,
    private readonly context: TargetAgentClientContext,
  ) {}

  async testConnection(): Promise<TestConnectionResult> {
    const startTime = Date.now();
    const config = (this.agent.config || {}) as Record<string, unknown>;
    const apiKey = config?.apiKey;
    const apiBaseUrl = config?.apiBaseUrl;
    const chatId =
      typeof config?.conversationId === 'string' && config.conversationId.trim()
        ? String(config.conversationId).trim()
        : undefined;
    const inputs = (
      config?.inputs && typeof config.inputs === 'object' && !Array.isArray(config.inputs)
        ? (config.inputs as Record<string, unknown>)
        : {}
    ) as Record<string, unknown>;

    if (!apiKey || !apiBaseUrl) {
      return {
        status: 'failed',
        message:
          'Missing required configuration: apiKey and apiBaseUrl are required for FastGPT agents',
      };
    }

    const baseUrl = String(apiBaseUrl).replace(/\/$/, '');
    const testUrl = `${baseUrl}/api/v1/chat/completions`;

    logger.info(`Testing FastGPT connection: ${testUrl}`, {
      agentId: this.agent.id,
      organizationId: this.context.organizationId,
      hasChatId: Boolean(chatId),
      hasVariables: Object.keys(inputs).length > 0,
    });

    try {
      const bodyPayload: Record<string, unknown> = {
        stream: false,
        detail: false,
        messages: [{ role: 'user', content: 'test' }],
      };
      if (chatId) {
        bodyPayload.chatId = chatId;
      }
      if (Object.keys(inputs).length > 0) {
        bodyPayload.variables = inputs;
      }

      const testResponse = await fetchWithProxy(testUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${String(apiKey)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });

      const responseTime = Date.now() - startTime;

      if (testResponse.ok) {
        await testResponse.json().catch(() => ({}));

        logger.info(`FastGPT connection test successful: ${testUrl}`, { responseTime });

        return {
          status: 'success',
          message: 'FastGPT connection test successful',
          responseTime,
        };
      }

      const errorText = await testResponse.text().catch(() => 'Unknown error');

      logger.warn(`FastGPT connection test failed: ${testUrl}`, {
        status: testResponse.status,
        error: errorText,
      });

      return {
        status: 'failed',
        message: `FastGPT connection test failed: ${testResponse.status} ${testResponse.statusText} - ${errorText}`,
        responseTime,
      };
    } catch (error: unknown) {
      const responseTime = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';

      logger.error('FastGPT connection test error:', {
        message,
      });

      return {
        status: 'failed',
        message: `Connection test error: ${message}`,
        responseTime,
      };
    }
  }
}
