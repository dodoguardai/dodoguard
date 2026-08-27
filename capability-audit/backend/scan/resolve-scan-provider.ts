/**
 * Resolve capability-scan LLM provider credentials server-side.
 * Frontend managed-model options only send id/apiBaseUrl (no apiKey); look up
 * Settings → Models / Integrations for the real key.
 */

import { resolveLlmProviderPayloadForRuntime } from '../../../backend/src/lib/resolve-llm-provider-runtime';
import logger from '../../../backend/src/logger';

export type ScanLlmProvider = {
  id: string;
  config?: Record<string, unknown>;
};

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Pure merge used by resolveCapabilityScanProvider (unit-tested). */
export function mergeResolvedScanProvider(
  request: ScanLlmProvider | undefined,
  resolved: { id: string; config?: Record<string, unknown>; matchedSelection?: boolean },
): ScanLlmProvider {
  const requestApiKey = nonEmptyString(request?.config?.apiKey);
  const resolvedApiKey = nonEmptyString(resolved.config?.apiKey);
  const mergedConfig: Record<string, unknown> = {
    ...(request?.config && typeof request.config === 'object' ? request.config : {}),
    ...(resolved.config && typeof resolved.config === 'object' ? resolved.config : {}),
  };

  if (requestApiKey) {
    mergedConfig.apiKey = requestApiKey;
  } else if (resolvedApiKey) {
    mergedConfig.apiKey = resolvedApiKey;
  }

  const resolvedBase =
    nonEmptyString(resolved.config?.apiBaseUrl) || nonEmptyString(resolved.config?.baseUrl);
  const requestBase =
    nonEmptyString(request?.config?.apiBaseUrl) || nonEmptyString(request?.config?.baseUrl);
  if (resolvedBase) {
    mergedConfig.apiBaseUrl = resolvedBase;
    mergedConfig.baseUrl = resolvedBase;
  } else if (requestBase) {
    mergedConfig.apiBaseUrl = requestBase;
    mergedConfig.baseUrl = requestBase;
  }

  return {
    id: resolved.id,
    config: mergedConfig,
  };
}

export function providerResolutionCandidates(
  request: ScanLlmProvider | undefined,
): (string | null)[] {
  const candidates = [
    nonEmptyString(request?.config?.modelId),
    nonEmptyString(request?.config?.managedModelId),
    nonEmptyString(request?.id),
  ].filter((value): value is string => Boolean(value));

  return candidates.length > 0 ? [...new Set(candidates)] : [null];
}

/**
 * Merge request provider with org managed-model / integration credentials.
 */
export async function resolveCapabilityScanProvider(params: {
  provider?: ScanLlmProvider;
  organizationId?: string | null;
}): Promise<ScanLlmProvider | undefined> {
  const request = params.provider;
  const candidates = providerResolutionCandidates(request);

  if (candidates.length === 1 && candidates[0] == null && !params.organizationId) {
    return request;
  }

  try {
    for (const preferredModelId of candidates) {
      const resolved = await resolveLlmProviderPayloadForRuntime({
        preferredModelId,
        organizationId: params.organizationId ?? null,
      });

      if (!resolved?.id) {
        continue;
      }

      const merged = mergeResolvedScanProvider(request, resolved);

      logger.info('[capability-scan] Resolved LLM provider for scan', {
        preferredModelId,
        providerId: resolved.id,
        matchedSelection: resolved.matchedSelection,
        hasApiKey: Boolean(nonEmptyString(merged.config?.apiKey)),
        hasApiBaseUrl: Boolean(nonEmptyString(merged.config?.apiBaseUrl)),
        organizationId: params.organizationId ? '[set]' : null,
      });

      return merged;
    }

    return request;
  } catch (error) {
    logger.warn('[capability-scan] Failed to resolve managed LLM provider; using request payload', {
      error: error instanceof Error ? error.message : String(error),
    });
    return request;
  }
}
