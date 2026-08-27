import { fetchWithProxy } from '../../../util/fetch/index';
import logger from '../../../logger';
import {
  TargetAgentClient,
  TargetAgentClientContext,
  TargetAgentRecord,
  TestConnectionResult,
} from '../types';

export class CozeAgentClient implements TargetAgentClient {
  constructor(
    private readonly agent: TargetAgentRecord,
    private readonly context: TargetAgentClientContext,
  ) {}

  async testConnection(): Promise<TestConnectionResult> {
    const startTime = Date.now();
    const config = (this.agent.config || {}) as any;

    const apiKey = config?.apiKey;
    const apiBaseUrl = config?.apiBaseUrl || 'https://api.coze.com';
    const botId = config?.botId;
    const connectorId = config?.connectorId;

    if (!apiKey || !botId) {
      return {
        status: 'failed',
        message: 'Missing required configuration: apiKey and botId are required for Coze agents',
      };
    }

    const baseUrl = String(apiBaseUrl).replace(/\/$/, '');
    const params = new URLSearchParams({
      bot_id: String(botId),
      page_num: '1',
      page_size: '1',
    });
    if (connectorId) {
      params.set('connector_id', String(connectorId));
    }

    const testUrl = `${baseUrl}/v1/conversations?${params.toString()}`;

    logger.info(`Testing Coze connection: ${testUrl}`, {
      agentId: this.agent.id,
      organizationId: this.context.organizationId,
      botId: String(botId),
      connectorId: connectorId ? String(connectorId) : undefined,
    });

    try {
      const testResponse = await fetchWithProxy(testUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const responseTime = Date.now() - startTime;

      if (testResponse.ok) {
        const json = (await testResponse.json().catch(() => null)) as {
          code?: number;
          msg?: string;
        } | null;

        if (json?.code === 0) {
          logger.info(`Coze connection test successful: ${testUrl}`, { responseTime });
          return {
            status: 'success',
            message: 'Coze connection test successful',
            responseTime,
          };
        }

        const msg = json?.msg || 'Unknown error';
        logger.warn(`Coze connection test failed: ${testUrl}`, {
          responseTime,
          code: json?.code,
          msg,
        });
        return {
          status: 'failed',
          message: `Coze connection test failed: ${msg}`,
          responseTime,
        };
      }

      const errorText = await testResponse.text().catch(() => 'Unknown error');
      logger.warn(`Coze connection test failed: ${testUrl}`, {
        status: testResponse.status,
        error: errorText,
      });

      return {
        status: 'failed',
        message: `Coze connection test failed: ${testResponse.status} ${testResponse.statusText} - ${errorText}`,
        responseTime,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      logger.error('Coze connection test error:', {
        message: error?.message,
      });

      return {
        status: 'failed',
        message: `Connection test error: ${error?.message || 'Unknown error'}`,
        responseTime,
      };
    }
  }
}
