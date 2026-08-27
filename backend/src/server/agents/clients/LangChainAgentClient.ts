import { fetchWithProxy } from '../../../util/fetch/index';
import logger from '../../../logger';
import {
  TargetAgentClient,
  TargetAgentClientContext,
  TargetAgentRecord,
  TestConnectionResult,
} from '../types';

export class LangChainAgentClient implements TargetAgentClient {
  constructor(
    private readonly agent: TargetAgentRecord,
    private readonly context: TargetAgentClientContext,
  ) {}

  private buildFallbackDictInput(prompt: string): Record<string, unknown> {
    // Some LangServe endpoints expect `input` to be a JSON object (dict),
    // not a plain string. We keep the default key name common: `input`.
    return { input: prompt };
  }

  async testConnection(): Promise<TestConnectionResult> {
    const startTime = Date.now();
    const config = (this.agent.config || {}) as any;
    const apiBaseUrl = config?.apiBaseUrl;
    const apiKey = config?.apiKey;
    const authType = config?.authType || 'api_key';
    const additionalHeaders = config?.additionalHeaders || {};

    if (!apiBaseUrl) {
      return {
        status: 'failed',
        message: 'Missing required configuration: apiBaseUrl is required for LangChain agents',
      };
    }

    const baseUrl = String(apiBaseUrl).replace(/\/$/, '');
    const invokePath =
      typeof config?.chatPath === 'string' && config.chatPath.trim()
        ? config.chatPath.trim()
        : '/invoke';
    const endpoint = /^https?:\/\//i.test(invokePath)
      ? invokePath
      : `${baseUrl}${invokePath.startsWith('/') ? invokePath : `/${invokePath}`}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    };
    if (authType === 'api_key' && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    } else if (authType === 'basic' && apiKey) {
      headers.Authorization = `Basic ${Buffer.from(String(apiKey)).toString('base64')}`;
    }

    const prompt = config?.testInput ?? 'DodoGuard security test ping';
    const initialInput = prompt;
    const dictFallbackInput =
      typeof prompt === 'string'
        ? this.buildFallbackDictInput(prompt)
        : prompt && typeof prompt === 'object' && !Array.isArray(prompt)
          ? (prompt as Record<string, unknown>)
          : this.buildFallbackDictInput(String(prompt));

    try {
      const response = await fetchWithProxy(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: initialInput,
          config: {
            configurable:
              typeof config?.configurable === 'object' && config?.configurable !== null
                ? config.configurable
                : {},
          },
          kwargs:
            typeof config?.kwargs === 'object' && config?.kwargs !== null ? config.kwargs : {},
        }),
      });

      const responseTime = Date.now() - startTime;
      if (response.ok || response.status === 404 || response.status === 405) {
        return {
          status: 'success',
          message: 'LangChain connection test successful',
          responseTime,
        };
      }

      const errorText = await response.text().catch(() => 'Unknown error');

      // If LangServe expects `input` to be a JSON object, retry with dict payload.
      if (
        response.status === 422 &&
        typeof errorText === 'string' &&
        (errorText.includes('dict_type') ||
          errorText.includes('Input should be a valid dictionary'))
      ) {
        const retryResponse = await fetchWithProxy(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            input: dictFallbackInput,
            config: {
              configurable:
                typeof config?.configurable === 'object' && config?.configurable !== null
                  ? config.configurable
                  : {},
            },
            kwargs:
              typeof config?.kwargs === 'object' && config?.kwargs !== null ? config.kwargs : {},
          }),
        });

        const retryResponseTime = Date.now() - startTime;
        if (retryResponse.ok || retryResponse.status === 404 || retryResponse.status === 405) {
          return {
            status: 'success',
            message: 'LangChain connection test successful',
            responseTime: retryResponseTime,
          };
        }

        const retryErrorText = await retryResponse.text().catch(() => errorText);
        return {
          status: 'failed',
          message: `LangChain connection test failed (after retry): ${retryResponse.status} ${retryResponse.statusText} - ${retryErrorText}`,
          responseTime: retryResponseTime,
        };
      }

      return {
        status: 'failed',
        message: `LangChain connection test failed: ${response.status} ${response.statusText} - ${errorText}`,
        responseTime,
      };
    } catch (error: any) {
      logger.error('[LangChainAgentClient] test connection error', {
        organizationId: this.context.organizationId,
        message: error?.message,
      });
      return {
        status: 'failed',
        message: `Connection test error: ${error?.message || 'Unknown error'}`,
        responseTime: Date.now() - startTime,
      };
    }
  }
}
