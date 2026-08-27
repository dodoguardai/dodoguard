import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import { getAdpWsToken } from './getWsToken';
import {
  applyAdpEvent,
  createAdpParseState,
  parseAdpSocketIoEventPacket,
  resolveAdpPreview,
} from './parseAdpEvents';
import type { TencentAdpChatResult, TencentAdpResolvedConfig } from './types';

function buildAdpRequestPayload(params: {
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
    Type: 'request',
    Request: {
      RequestId: params.requestId,
      ConversationId: params.conversationId,
      Contents: contents,
      Incremental: params.config.incremental,
      Stream: params.config.stream,
    },
  };
}

export async function callTencentAdpWebSocket(params: {
  config: TencentAdpResolvedConfig;
  query: string;
  conversationId: string;
  timeoutMs: number;
}): Promise<TencentAdpChatResult> {
  const startTime = Date.now();

  if (!params.config.secretId || !params.config.secretKey) {
    return {
      ok: false,
      status: 0,
      preview: '',
      durationMs: Date.now() - startTime,
      rawBody: 'Missing Tencent Cloud SecretId/SecretKey',
      conversationId: params.conversationId,
      errorMessage: 'Missing Tencent Cloud SecretId/SecretKey',
    };
  }

  const tokenResult = await getAdpWsToken({
    appKey: params.config.appKey,
    visitorId: params.config.visitorId,
    secretId: params.config.secretId,
    secretKey: params.config.secretKey,
    region: params.config.region,
  });

  if (!tokenResult.ok || !tokenResult.token) {
    return {
      ok: false,
      status: 0,
      preview: '',
      durationMs: Date.now() - startTime,
      rawBody: tokenResult.rawBody || tokenResult.message,
      conversationId: params.conversationId,
      errorMessage: tokenResult.message,
    };
  }

  const requestId = randomUUID();
  const requestPayload = buildAdpRequestPayload({
    config: params.config,
    query: params.query,
    conversationId: params.conversationId,
    requestId,
  });

  return new Promise((resolve) => {
    const state = createAdpParseState();
    let settled = false;
    let authSent = false;
    let requestSent = false;

    const finish = (result: TencentAdpChatResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        status: 0,
        preview: resolveAdpPreview(state),
        durationMs: Date.now() - startTime,
        rawBody: 'WebSocket request timed out',
        conversationId: params.conversationId,
        errorMessage: 'WebSocket request timed out',
      });
    }, params.timeoutMs);

    const ws = new WebSocket(params.config.wsUrl);

    ws.on('error', (err) => {
      finish({
        ok: false,
        status: 0,
        preview: resolveAdpPreview(state),
        durationMs: Date.now() - startTime,
        rawBody: err.message,
        conversationId: params.conversationId,
        errorMessage: err.message,
      });
    });

    ws.on('message', (data) => {
      const msg = data.toString();

      if (msg === '2') {
        ws.send('3');
        return;
      }

      if (msg.startsWith('0') && !authSent) {
        authSent = true;
        ws.send(`40${JSON.stringify({ token: tokenResult.token })}`);
        return;
      }

      if (msg.startsWith('40') && authSent && !requestSent) {
        requestSent = true;
        ws.send(`42${JSON.stringify(['request', requestPayload])}`);
        return;
      }

      const parsed = parseAdpSocketIoEventPacket(msg);
      if (!parsed) {
        return;
      }

      const payloadType =
        typeof parsed.payload.Type === 'string' ? String(parsed.payload.Type) : parsed.eventName;
      applyAdpEvent(state, payloadType, parsed.payload);

      if (state.done) {
        const preview = resolveAdpPreview(state);
        finish({
          ok: Boolean(preview) && !state.errorMessage,
          status: state.errorMessage ? 400 : 200,
          preview: preview || state.errorMessage,
          durationMs: Date.now() - startTime,
          rawBody: preview || state.errorMessage,
          conversationId: params.conversationId,
          errorMessage:
            state.errorMessage || (preview ? undefined : 'No reply in ADP WebSocket response'),
        });
      }
    });
  });
}
