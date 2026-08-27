/**
 * HTTP callbacks when attack_tasks reach a terminal status (external API integration).
 * Payload signed with HMAC-SHA256 using secret stored on task metadata.externalCallback.
 */

import { createHmac } from 'node:crypto';
import logger from '../logger';
import { fetchWithProxy } from '../util/fetch';

const TERMINAL = new Set(['completed', 'failed', 'canceled']);

export type ExternalCallbackMeta = {
  url: string;
  signingSecret: string;
};

function parseExternalCallback(metadata: unknown): ExternalCallbackMeta | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const ext = (metadata as Record<string, unknown>).externalCallback;
  if (!ext || typeof ext !== 'object') {
    return null;
  }
  const url = (ext as Record<string, unknown>).url;
  const signingSecret = (ext as Record<string, unknown>).signingSecret;
  if (
    typeof url !== 'string' ||
    !url.trim() ||
    typeof signingSecret !== 'string' ||
    !signingSecret
  ) {
    return null;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    return null;
  }
  return { url: url.trim(), signingSecret };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function deliverExternalTaskWebhook(params: {
  callbackUrl: string;
  signingSecret: string;
  body: Record<string, unknown>;
}): Promise<{ ok: boolean; status?: number }> {
  const payload = JSON.stringify(params.body);
  const timestamp = String(Date.now());
  const sig = createHmac('sha256', params.signingSecret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  const maxAttempts = 4;
  const timeouts = [4000, 8000, 16000, 32000];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);
      const res = await fetchWithProxy(params.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Signature': `sha256=${sig}`,
        },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(t);
      const status = res.status;
      if (status >= 200 && status < 300) {
        return { ok: true, status };
      }
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        logger.warn('[ExternalWebhook] client error, not retrying', { status });
        return { ok: false, status };
      }
    } catch (e) {
      logger.warn('[ExternalWebhook] attempt failed', {
        message: e instanceof Error ? e.message : String(e),
        attempt: attempt + 1,
      });
    }
    if (attempt < maxAttempts - 1) {
      await sleep(timeouts[attempt] ?? 5000);
    }
  }
  return { ok: false };
}

/**
 * Fire-and-forget when a task reaches terminal status and metadata.externalCallback exists.
 */
export function notifyExternalTaskTerminalFromPayload(options: {
  taskId: string;
  organizationId: string;
  status: string;
  metadata: unknown;
}): void {
  if (!TERMINAL.has(options.status)) {
    return;
  }
  const cb = parseExternalCallback(options.metadata);
  if (!cb) {
    return;
  }

  const body = {
    event: 'task.finished',
    taskId: options.taskId,
    organizationId: options.organizationId,
    status: options.status,
    occurredAt: new Date().toISOString(),
  };

  void (async () => {
    const result = await deliverExternalTaskWebhook({
      callbackUrl: cb.url,
      signingSecret: cb.signingSecret,
      body,
    });
    if (!result.ok) {
      logger.warn('[ExternalWebhook] delivery exhausted', { taskId: options.taskId });
    }
  })();
}
