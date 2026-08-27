import crypto from 'crypto';

function sha256Hex(message: string): string {
  return crypto.createHash('sha256').update(message, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer | string, message: string): Buffer {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest();
}

export function buildTencentCloudTc3Headers(params: {
  secretId: string;
  secretKey: string;
  service: string;
  host: string;
  action: string;
  version: string;
  region: string;
  payload: string;
  timestamp?: number;
}): Record<string, string> {
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const contentType = 'application/json; charset=utf-8';
  const canonicalHeaders = `content-type:${contentType}\nhost:${params.host}\n`;
  const signedHeaders = 'content-type;host';
  const hashedRequestPayload = sha256Hex(params.payload);
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n');

  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${date}/${params.service}/tc3_request`;
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);
  const stringToSign = [algorithm, String(timestamp), credentialScope, hashedCanonicalRequest].join(
    '\n',
  );

  const secretDate = hmacSha256(`TC3${params.secretKey}`, date);
  const secretService = hmacSha256(secretDate, params.service);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = hmacSha256(secretSigning, stringToSign).toString('hex');

  const authorization = `${algorithm} Credential=${params.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    'Content-Type': contentType,
    Host: params.host,
    'X-TC-Action': params.action,
    'X-TC-Version': params.version,
    'X-TC-Region': params.region,
    'X-TC-Timestamp': String(timestamp),
  };
}
