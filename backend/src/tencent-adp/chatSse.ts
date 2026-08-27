import { randomUUID } from 'crypto';
import { fetchWithTimeout } from '../util/fetch/index';
import { parseAdpSseText, resolveAdpPreview } from './parseAdpEvents';
import type { TencentAdpChatResult, TencentAdpResolvedConfig } from './types';

function buildAdpRequestBody(params: {
  config: TencentAdpResolvedConfig;
  query: string;
  conversationId: string;
  requestId: string;
}): Record<string, unknown> {
  const contents: Array<Record<string, unknown>> = [{ Type: 'text', Text: params.query }];
  const customVariables = params.config.customVariables || {};
  if (Object.keys(customVariables).length > 0) {
    contents.push({
      Type: 'custom_variables',
      CustomVariables: customVariables,
    });
  }

  return {
    RequestId: params.requestId,
    ConversationId: params.conversationId,
    AppKey: params.config.appKey,
    VisitorId: params.config.visitorId,
    Contents: contents,
    Incremental: params.config.incremental,
    Stream: params.config.stream,
  };
}

export async function callTencentAdpSse(params: {
  config: TencentAdpResolvedConfig;
  query: string;
  conversationId: string;
  timeoutMs: number;
}): Promise<TencentAdpChatResult> {
  const startTime = Date.now();
  const requestId = randomUUID();
  const body = buildAdpRequestBody({
    config: params.config,
    query: params.query,
    conversationId: params.conversationId,
    requestId,
  });

  try {
    const response = await fetchWithTimeout(
      params.config.sseUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
      },
      params.timeoutMs,
    );

    const durationMs = Date.now() - startTime;
    const rawBody = await response.text().catch(() => '');

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        preview: rawBody.slice(0, 500),
        durationMs,
        rawBody,
        conversationId: params.conversationId,
        errorMessage: `HTTP ${response.status}`,
      };
    }

    const state = parseAdpSseText(rawBody);
    const preview = resolveAdpPreview(state);

    if (state.errorMessage) {
      return {
        ok: false,
        status: response.status,
        preview: preview || state.errorMessage,
        durationMs,
        rawBody,
        conversationId: params.conversationId,
        errorMessage: state.errorMessage,
      };
    }

    return {
      ok: Boolean(preview),
      status: response.status,
      preview: preview || rawBody.slice(0, 500),
      durationMs,
      rawBody,
      conversationId: params.conversationId,
      errorMessage: preview ? undefined : 'No reply content in ADP SSE response',
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 0,
      preview: '',
      durationMs,
      rawBody: message,
      conversationId: params.conversationId,
      errorMessage: message,
    };
  }
}
