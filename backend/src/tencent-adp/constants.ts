/** Default ADP chat SSE endpoint (see Tencent ADP HTTP SSE docs). */
export const DEFAULT_ADP_SSE_URL = 'https://wss.lke.cloud.tencent.com/adp/v2/chat';

/** Default ADP WebSocket endpoint (Socket.IO v4). */
export const DEFAULT_ADP_WS_URL =
  'wss://wss.lke.cloud.tencent.com/adp/v2/chat/conn/?language=zh-CN&EIO=4&transport=websocket';

/** Tencent Cloud API host for GetWsToken. */
export const DEFAULT_ADP_API_HOST = 'lke.tencentcloudapi.com';

/** Default region for LKE API calls. */
export const DEFAULT_ADP_REGION = 'ap-guangzhou';

export const ADP_API_VERSION = '2023-11-30';

export const ADP_GET_WS_TOKEN_ACTION = 'GetWsToken';

/** API visitor access type for GetWsToken. */
export const ADP_WS_TOKEN_TYPE = 5;
