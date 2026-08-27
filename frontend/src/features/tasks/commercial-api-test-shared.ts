import type { TargetAgent, TaskType } from '@/types/entities';

/** Vulnerabilities whose `id` contains this fragment are eligible for commercial API scans. */
export const COMMERCIAL_API_VULNERABILITY_ID_FRAGMENT = '11f1-8c37-00163e3a7608';

export function vulnerabilityIdMatchesCommercialApiSet(id: string): boolean {
  return id.includes(COMMERCIAL_API_VULNERABILITY_ID_FRAGMENT);
}

/** Persisted on attack_tasks.platform_family */
export const COMMERCIAL_API_PLATFORM_FAMILY = 'custom_api';

/** metadata.runSource for commercial API scan tasks */
export const COMMERCIAL_API_RUN_SOURCE = 'commercial_api';

export type CommercialApiProtocol = 'api' | 'api-stream' | 'langchain';

export const COMMERCIAL_API_AGENT_TYPES: CommercialApiProtocol[] = [
  'api',
  'api-stream',
  'langchain',
];

export function protocolToAgentType(protocol: CommercialApiProtocol): TargetAgent['type'] {
  return protocol;
}

export function agentTypeToProtocol(type: string | undefined): CommercialApiProtocol | null {
  const t = String(type ?? '').toLowerCase();
  if (t === 'api' || t === 'api-stream' || t === 'langchain') {
    return t;
  }
  return null;
}

export function defaultChatPath(protocol: CommercialApiProtocol): string {
  if (protocol === 'langchain') {
    return '/invoke';
  }
  if (protocol === 'api-stream') {
    return '/v1/chat/stream/message';
  }
  return '/v1/chat/completions';
}

export function protocolLabel(protocol: CommercialApiProtocol, isZh: boolean): string {
  if (protocol === 'langchain') {
    return isZh ? 'LangServe /invoke' : 'LangServe /invoke';
  }
  if (protocol === 'api-stream') {
    return isZh ? 'OpenAI 兼容（SSE 流式）' : 'OpenAI-compatible (SSE stream)';
  }
  return isZh ? 'OpenAI 兼容（非流式）' : 'OpenAI-compatible (blocking)';
}

export function buildEndpointPreview(config: {
  apiBaseUrl?: string;
  chatPath?: string;
}): string {
  const base = String(config.apiBaseUrl ?? '').trim().replace(/\/$/, '');
  const path =
    typeof config.chatPath === 'string' && config.chatPath.trim()
      ? config.chatPath.trim()
      : '';
  if (!base && !path) {
    return '';
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (!base) {
    return path;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function parseJsonObjectField(
  raw: string,
  fieldLabel: string,
): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${fieldLabel}: invalid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${fieldLabel}: must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function resolveV4ForCommercialApiTest(taskTypes: TaskType[]) {
  const taskTypeId = taskTypes.find((t) => t.code === 'commercial_api_scan')?.id;
  return {
    ...(taskTypeId ? { taskTypeId } : {}),
    platformFamily: COMMERCIAL_API_PLATFORM_FAMILY,
    scanMode: 'runtime' as const,
  };
}

export function isCommercialApiTestTask(
  metadata: Record<string, unknown> | undefined | null,
): boolean {
  return (
    metadata?.runSource === COMMERCIAL_API_RUN_SOURCE ||
    metadata?.taskKind === 'commercial_api_test'
  );
}

export function shortAgentId(id: string | undefined): string {
  const s = String(id ?? '').trim();
  if (s.length <= 8) {
    return s || '—';
  }
  return `…${s.slice(-8)}`;
}

export function getCommercialApiEndpointFromMetadata(
  metadata: Record<string, unknown> | undefined | null,
): string | null {
  if (!isCommercialApiTestTask(metadata)) {
    return null;
  }
  const ca = metadata?.commercialApi;
  if (ca && typeof ca === 'object') {
    const ep = String((ca as { endpointPreview?: unknown }).endpointPreview ?? '').trim();
    if (ep) {
      return ep;
    }
  }
  return null;
}

export function getCommercialApiAgentNameFromMetadata(
  metadata: Record<string, unknown> | undefined | null,
): string | null {
  if (!isCommercialApiTestTask(metadata)) {
    return null;
  }
  const ca = metadata?.commercialApi;
  if (ca && typeof ca === 'object') {
    const name = String((ca as { agentName?: unknown }).agentName ?? '').trim();
    if (name) {
      return name;
    }
  }
  return null;
}

export function getCommercialApiAgentIdFromMetadata(
  metadata: Record<string, unknown> | undefined | null,
): string | null {
  if (!isCommercialApiTestTask(metadata)) {
    return null;
  }
  const ca = metadata?.commercialApi;
  if (ca && typeof ca === 'object') {
    const id = String((ca as { agentId?: unknown }).agentId ?? '').trim();
    if (id) {
      return id;
    }
  }
  return null;
}
