import type { CapabilityScanResult } from './types';
import { buildRiskSummary, overallSuggestedAction } from './finding-meta';

export type CallbackDelivery = {
  delivered: boolean;
  status?: number;
  message?: string;
  attempts?: number;
};

const MAX_CALLBACK_RETRIES = 5;
const RETRY_DELAYS_MS = [0, 2_000, 5_000, 15_000, 60_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAllowed(url: URL): boolean {
  const allowlist = process.env.CAPABILITY_SCAN_CALLBACK_ALLOWLIST?.trim();
  if (!allowlist) {
    return true;
  }
  const hosts = allowlist
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return hosts.some(
    (host) =>
      url.hostname.toLowerCase() === host || url.hostname.toLowerCase().endsWith(`.${host}`),
  );
}

function wordCallbackPayload(result: CapabilityScanResult) {
  const riskSummary = result.riskSummary ?? buildRiskSummary(result.findings);
  const suggested = result.suggestedAction ?? overallSuggestedAction(result.findings);
  return {
    task_id: result.taskId,
    status: result.status,
    risk_summary: {
      ...riskSummary,
      suggested_action: suggested,
    },
    result_url: `/api/v1/capability-scans/${result.taskId}/findings`,
    engine_summary: result.engines.map((e) => ({
      engine: e.engine,
      status: e.status,
      finding_count: e.findingCount,
    })),
    // backward-compatible fields
    type: 'capability_scan.completed',
    taskId: result.taskId,
    overallRisk: result.overallRisk,
    findingCount: result.findings.length,
    result,
  };
}

async function deliverOnce(
  callbackUrl: string,
  result: CapabilityScanResult,
): Promise<CallbackDelivery> {
  const url = new URL(callbackUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(wordCallbackPayload(result)),
    signal: AbortSignal.timeout(15_000),
  });
  return {
    delivered: response.ok,
    status: response.status,
    message: response.ok ? undefined : `Callback returned HTTP ${response.status}`,
  };
}

export async function notifyScanCallback(
  callbackUrl: string | undefined,
  result: CapabilityScanResult,
): Promise<CallbackDelivery> {
  if (!callbackUrl) {
    return { delivered: false, message: 'No callbackUrl configured' };
  }
  if (process.env.CAPABILITY_SCAN_ENABLE_CALLBACKS !== 'true') {
    return {
      delivered: false,
      message: 'Callbacks disabled; set CAPABILITY_SCAN_ENABLE_CALLBACKS=true',
    };
  }

  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return { delivered: false, message: 'Invalid callbackUrl' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { delivered: false, message: 'callbackUrl must use http or https' };
  }
  if (!isAllowed(url)) {
    return { delivered: false, message: 'callbackUrl host is not allowlisted' };
  }

  let lastMessage: string | undefined;
  for (let attempt = 0; attempt < MAX_CALLBACK_RETRIES; attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt] ?? 60_000;
    if (delay > 0) {
      await sleep(delay);
    }
    try {
      const delivery = await deliverOnce(callbackUrl, result);
      if (delivery.delivered) {
        return { ...delivery, attempts: attempt + 1 };
      }
      lastMessage = delivery.message;
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    delivered: false,
    attempts: MAX_CALLBACK_RETRIES,
    message: lastMessage ?? `Failed after ${MAX_CALLBACK_RETRIES} attempts`,
  };
}
