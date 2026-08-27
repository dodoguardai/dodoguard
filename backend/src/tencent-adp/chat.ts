import type { AttackTaskExecutionSettings } from '../lib/attackTaskRowNormalize';
import { ATTACK_TASK_EXECUTION_LIMITS } from '../lib/attackTaskExecutionLimits';
import { REQUEST_TIMEOUT_MS } from '../providers/shared';
import { callTencentAdpSse } from './chatSse';
import { callTencentAdpWebSocket } from './chatWebSocket';
import type { TencentAdpChatResult, TencentAdpResolvedConfig } from './types';

function resolveTimeoutMs(settings?: AttackTaskExecutionSettings): number {
  if (!settings) {
    return REQUEST_TIMEOUT_MS;
  }
  const timeoutMs = settings.timeoutMs;
  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)) {
    return Math.floor(timeoutMs);
  }
  return ATTACK_TASK_EXECUTION_LIMITS.timeoutMs.default;
}

export async function callTencentAdpChat(params: {
  config: TencentAdpResolvedConfig;
  query: string;
  conversationId: string;
  executionSettings?: AttackTaskExecutionSettings;
}): Promise<TencentAdpChatResult> {
  const timeoutMs = resolveTimeoutMs(params.executionSettings);

  if (params.config.transportMode === 'websocket') {
    return callTencentAdpWebSocket({
      config: params.config,
      query: params.query,
      conversationId: params.conversationId,
      timeoutMs,
    });
  }

  return callTencentAdpSse({
    config: params.config,
    query: params.query,
    conversationId: params.conversationId,
    timeoutMs,
  });
}
