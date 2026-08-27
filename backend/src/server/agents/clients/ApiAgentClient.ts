import { fetchWithTimeout } from '../../../util/fetch/index';
import logger from '../../../logger';
import {
  TargetAgentClient,
  TargetAgentClientContext,
  TargetAgentRecord,
  TestConnectionResult,
} from '../types';
import { REQUEST_TIMEOUT_MS } from '../../../providers/shared';

export class ApiAgentClient implements TargetAgentClient {
  constructor(
    private readonly agent: TargetAgentRecord,
    private readonly context: TargetAgentClientContext,
  ) {}

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
        message: 'Missing required configuration: apiBaseUrl is required for API agents',
      };
    }

    const normalizedBaseUrl = String(apiBaseUrl).trim().replace(/\/$/, '');
    let parsedBaseUrl: URL | null = null;
    try {
      parsedBaseUrl = new URL(normalizedBaseUrl);
    } catch {
      return {
        status: 'failed',
        message: `Invalid apiBaseUrl: ${String(apiBaseUrl)}`,
      };
    }

    const baseOrigin = parsedBaseUrl.origin;
    const basePath = parsedBaseUrl.pathname || '/';
    const isOpenAiHost = parsedBaseUrl.hostname === 'api.openai.com';

    const candidateUrls: string[] = [];
    const addCandidate = (u: string) => {
      if (!candidateUrls.includes(u)) {
        candidateUrls.push(u);
      }
    };

    // OpenAI uses /v1/models as a reliable read-only probe endpoint.
    if (isOpenAiHost) {
      addCandidate(`${baseOrigin}/v1/models`);
    }

    addCandidate(normalizedBaseUrl);

    // If user provided only origin or /v1, probe /v1/models as a generic fallback.
    if (basePath === '/' || basePath === '/v1') {
      addCandidate(`${baseOrigin}/v1/models`);
    }

    // If user pasted a chat-completions endpoint, also test its parent /v1/models.
    if (basePath.includes('/chat/completions')) {
      addCandidate(`${baseOrigin}/v1/models`);
    }

    logger.info(`Testing API connection: ${normalizedBaseUrl}`, {
      authType,
      hasHeaders: Object.keys(additionalHeaders || {}).length > 0,
      candidateCount: candidateUrls.length,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    };

    if (authType === 'api_key' && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    } else if (authType === 'basic' && apiKey) {
      headers.Authorization = `Basic ${Buffer.from(String(apiKey)).toString('base64')}`;
    }

    const probeErrors: string[] = [];
    // Connectivity probe should not hang for a long time.
    // fetchWithProxy only sets a header timeout; fetching the full body can still wait indefinitely.
    const timeoutMs = Math.min(REQUEST_TIMEOUT_MS, 30_000);
    for (const testUrl of candidateUrls) {
      try {
        const testResponse = await fetchWithTimeout(
          testUrl,
          {
            method: 'GET',
            headers,
          },
          timeoutMs,
        );

        const responseTime = Date.now() - startTime;

        // Success criteria:
        // - 2xx means authenticated and reachable
        // - 401/403 means reachable but auth failed (still proves network/API connectivity)
        // - 404/405 means endpoint reachable but method/path mismatch (still connectivity success)
        if (
          testResponse.ok ||
          testResponse.status === 401 ||
          testResponse.status === 403 ||
          testResponse.status === 404 ||
          testResponse.status === 405
        ) {
          const message =
            testResponse.status === 401 || testResponse.status === 403
              ? `API reachable but authentication failed (${testResponse.status})`
              : 'API connection test successful';

          logger.info(`API connection test successful: ${testUrl}`, {
            responseTime,
            status: testResponse.status,
          });

          return {
            status: 'success',
            message,
            responseTime,
          };
        }

        const errorText = await testResponse.text().catch(() => 'Unknown error');
        const err = `${testUrl} -> ${testResponse.status} ${testResponse.statusText}`;
        probeErrors.push(err);
        logger.warn(`API connection probe failed: ${testUrl}`, {
          status: testResponse.status,
          error: errorText,
        });
      } catch (error: any) {
        const err = `${testUrl} -> ${error?.message || 'Unknown error'}`;
        probeErrors.push(err);
        logger.warn('API connection probe error:', {
          url: testUrl,
          message: error?.message,
        });
      }
    }

    const responseTime = Date.now() - startTime;
    return {
      status: 'failed',
      message: `Connection test failed after ${candidateUrls.length} probe(s): ${probeErrors.join('; ')}`,
      responseTime,
    };
  }
}
