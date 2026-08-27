import { fetchWithProxy } from '../util/fetch/index';
import {
  ADP_API_VERSION,
  ADP_GET_WS_TOKEN_ACTION,
  ADP_WS_TOKEN_TYPE,
  DEFAULT_ADP_API_HOST,
} from './constants';
import { buildTencentCloudTc3Headers } from './tencentCloudSign';

export interface GetWsTokenParams {
  appKey: string;
  visitorId: string;
  secretId: string;
  secretKey: string;
  region: string;
}

export interface GetWsTokenResult {
  ok: boolean;
  token?: string;
  message: string;
  rawBody?: string;
}

export async function getAdpWsToken(params: GetWsTokenParams): Promise<GetWsTokenResult> {
  const payload = JSON.stringify({
    Type: ADP_WS_TOKEN_TYPE,
    BotAppKey: params.appKey,
    VisitorBizId: params.visitorId,
  });

  const headers = buildTencentCloudTc3Headers({
    secretId: params.secretId,
    secretKey: params.secretKey,
    service: 'lke',
    host: DEFAULT_ADP_API_HOST,
    action: ADP_GET_WS_TOKEN_ACTION,
    version: ADP_API_VERSION,
    region: params.region,
    payload,
  });

  const url = `https://${DEFAULT_ADP_API_HOST}/`;

  try {
    const response = await fetchWithProxy(url, {
      method: 'POST',
      headers,
      body: payload,
    });

    const rawBody = await response.text().catch(() => '');
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const errMsg =
        parsed?.Response?.Error?.Message ||
        parsed?.Error?.Message ||
        `GetWsToken HTTP ${response.status}`;
      return { ok: false, message: errMsg, rawBody };
    }

    const token = parsed?.Response?.Token;
    if (!token || typeof token !== 'string') {
      const errMsg = parsed?.Response?.Error?.Message || 'GetWsToken 未返回 Token';
      return { ok: false, message: errMsg, rawBody };
    }

    return { ok: true, token, message: 'GetWsToken success', rawBody };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: message || 'GetWsToken failed' };
  }
}
