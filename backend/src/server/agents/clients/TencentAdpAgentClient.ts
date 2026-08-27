import { randomUUID } from 'crypto';
import logger from '../../../logger';
import {
  callTencentAdpChat,
  resolveTencentAdpConfig,
  validateTencentAdpConfigForTransport,
} from '../../../tencent-adp';
import {
  TargetAgentClient,
  TargetAgentClientContext,
  TargetAgentRecord,
  TestConnectionResult,
} from '../types';

function resolveTestPrompt(config: Record<string, unknown>): string {
  const prompt = typeof config.testPrompt === 'string' ? config.testPrompt.trim() : '';
  return prompt || 'test';
}

export class TencentAdpAgentClient implements TargetAgentClient {
  constructor(
    private readonly agent: TargetAgentRecord,
    private readonly context: TargetAgentClientContext,
  ) {}

  async testConnection(): Promise<TestConnectionResult> {
    const startTime = Date.now();
    const rawConfig = this.agent.config as Record<string, unknown>;
    const resolved = resolveTencentAdpConfig(rawConfig);

    if (!resolved) {
      return {
        status: 'failed',
        message:
          'Missing required configuration: AppKey (apiKey) and VisitorId (userId) are required',
      };
    }

    const transportError = validateTencentAdpConfigForTransport(resolved);
    if (transportError) {
      return {
        status: 'failed',
        message: transportError,
      };
    }

    const conversationId = resolved.conversationId || randomUUID();

    logger.info('[TencentAdpAgentClient] Testing ADP connection', {
      agentId: this.agent.id,
      organizationId: this.context.organizationId,
      transportMode: resolved.transportMode,
      sseUrl: resolved.sseUrl,
    });

    try {
      const result = await callTencentAdpChat({
        config: resolved,
        query: resolveTestPrompt(rawConfig),
        conversationId,
      });

      const responseTime = Date.now() - startTime;

      if (result.ok) {
        return {
          status: 'success',
          message: `腾讯 ADP 连接测试成功（${resolved.transportMode.toUpperCase()}）`,
          responseTime,
        };
      }

      return {
        status: 'failed',
        message: result.errorMessage || `腾讯 ADP 连接测试失败（HTTP ${result.status || 'n/a'}）`,
        responseTime,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[TencentAdpAgentClient] Connection test failed', { message });
      return {
        status: 'failed',
        message: message || '腾讯 ADP 连接测试失败',
        responseTime: Date.now() - startTime,
      };
    }
  }
}
