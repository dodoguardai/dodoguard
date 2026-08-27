import { Agent } from 'undici';
import { fetchWithProxy } from '../../../util/fetch/index';
import logger from '../../../logger';
import {
  buildDifyRequest,
  evaluateDifyConnectionTestResult,
  formatDifyConnectionTimeoutMessage,
  readDifyProbeResponseBody,
  resolveDifyResponseMode,
} from '../../../dify-pentest/utils/requestBuilder';
import { buildDifyApiUrl, resolveDifyApiType } from '../../../util/difyUrl';
import {
  TargetAgentClient,
  TargetAgentClientContext,
  TargetAgentRecord,
  TestConnectionResult,
} from '../types';

/** Blocking probe budget (Agent apps often hang on blocking; keep short). */
const DIFY_BLOCKING_PROBE_TIMEOUT_MS = 12_000;
/** Streaming probe budget (enough for first model token). */
const DIFY_STREAMING_PROBE_TIMEOUT_MS = 48_000;

/** Direct connection — bypass HTTP_PROXY for local Dify (avoids proxy hanging on localhost). */
const difyProbeDispatcher = new Agent({
  connect: { timeout: 30_000 },
  headersTimeout: 60_000,
  bodyTimeout: 60_000,
});

export class DifyAgentClient implements TargetAgentClient {
  constructor(
    private readonly agent: TargetAgentRecord,
    private readonly context: TargetAgentClientContext,
  ) {}

  async testConnection(): Promise<TestConnectionResult> {
    const startTime = Date.now();
    const config = (this.agent.config || {}) as any;
    const apiKey = config?.apiKey;
    const apiBaseUrl = config?.apiBaseUrl;
    const userId = config?.userId || 'test-user';
    const inputs = config?.inputs || {};
    const apiType = resolveDifyApiType(config?.apiType);
    const workflowInputKey = String(config?.workflowInputKey || 'query');
    const responseMode = resolveDifyResponseMode(config?.responseMode);

    if (!apiKey || !apiBaseUrl) {
      return {
        status: 'failed',
        message:
          'Missing required configuration: apiKey and apiBaseUrl are required for Dify agents',
      };
    }

    const testUrl = buildDifyApiUrl(apiBaseUrl, apiType);

    logger.info(`Testing Dify connection: ${testUrl}`, {
      apiType,
      workflowInputKey,
      userId,
      responseMode,
      hasInputs: Object.keys(inputs || {}).length > 0,
    });

    const probes: Array<{ mode: 'blocking' | 'streaming'; timeoutMs: number }> =
      responseMode === 'streaming'
        ? [{ mode: 'streaming', timeoutMs: DIFY_STREAMING_PROBE_TIMEOUT_MS }]
        : [
            { mode: 'blocking', timeoutMs: DIFY_BLOCKING_PROBE_TIMEOUT_MS },
            { mode: 'streaming', timeoutMs: DIFY_STREAMING_PROBE_TIMEOUT_MS },
          ];

    let lastError: Error | undefined;
    let lastFailure: TestConnectionResult | undefined;

    for (let i = 0; i < probes.length; i++) {
      const { mode, timeoutMs } = probes[i];
      try {
        const result = await this.probeOnce({
          testUrl,
          apiKey,
          apiBaseUrl,
          userId,
          inputs,
          apiType,
          workflowInputKey,
          conversationId: config?.conversationId || '',
          responseMode: mode,
          timeoutMs,
        });

        if (result.status === 'success') {
          if (mode === 'streaming' && responseMode === 'blocking') {
            return {
              ...result,
              autoCorrectedResponseMode: 'streaming',
              message:
                'Dify connection test successful（应用仅支持 streaming，将自动把响应模式更正为「流式」并保存）',
            };
          }
          return result;
        }

        lastFailure = result;
        if (i === probes.length - 1) {
          return result;
        }
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const timedOut = lastError.message.includes('timed out') || lastError.name === 'AbortError';
        if (!timedOut || i === probes.length - 1) {
          break;
        }
        logger.info('[DifyAgentClient] Connection probe timed out, retrying with streaming', {
          testUrl,
          previousMode: mode,
        });
      }
    }

    const responseTime = Date.now() - startTime;
    const message =
      lastError?.message ||
      lastFailure?.message ||
      formatDifyConnectionTimeoutMessage(DIFY_STREAMING_PROBE_TIMEOUT_MS, String(apiBaseUrl), {
        responseMode,
        testUrl,
      });

    logger.error('Dify connection test error:', { message, testUrl });

    return {
      status: 'failed',
      message: message.startsWith('Connection test')
        ? message
        : `Connection test error: ${message}`,
      responseTime,
    };
  }

  private async probeOnce(params: {
    testUrl: string;
    apiKey: string;
    apiBaseUrl: string;
    userId: string;
    inputs: Record<string, unknown>;
    apiType: 'chat' | 'workflow';
    workflowInputKey: string;
    conversationId: string;
    responseMode: 'blocking' | 'streaming';
    timeoutMs: number;
  }): Promise<TestConnectionResult> {
    const requestBody = buildDifyRequest({
      query: 'test',
      inputs: (params.inputs || {}) as Record<string, any>,
      responseMode: params.responseMode,
      conversationId: params.conversationId,
      user: params.userId,
      apiType: params.apiType,
      workflowInputKey: params.workflowInputKey,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);
    const probeStart = Date.now();

    try {
      const testResponse = await fetchWithProxy(params.testUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        dispatcher: difyProbeDispatcher,
      });

      const bodyText = await readDifyProbeResponseBody({
        response: testResponse,
        responseMode: params.responseMode,
        deadlineMs: Math.max(1000, params.timeoutMs - (Date.now() - probeStart)),
      });

      const responseTime = Date.now() - probeStart;
      const evaluated = evaluateDifyConnectionTestResult({
        apiType: params.apiType,
        httpOk: testResponse.ok,
        httpStatus: testResponse.status,
        httpStatusText: testResponse.statusText,
        bodyText,
      });

      if (evaluated.status === 'success') {
        logger.info(`Dify connection test successful: ${params.testUrl}`, {
          responseMode: params.responseMode,
        });
      } else {
        logger.warn(`Dify connection test failed: ${params.testUrl}`, {
          status: testResponse.status,
          message: evaluated.message,
          responseMode: params.responseMode,
        });
      }

      return {
        status: evaluated.status,
        message: evaluated.message,
        responseTime,
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' ||
          error.message.includes('timed out') ||
          error.message.includes('Response body read timed out'))
      ) {
        throw new Error(
          formatDifyConnectionTimeoutMessage(params.timeoutMs, params.apiBaseUrl, {
            responseMode: params.responseMode,
            testUrl: params.testUrl,
          }),
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
