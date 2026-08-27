import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  extractModelsFromIntegrations,
  extractModelsFromManagedModels,
  type LlmModelOption,
} from '@/lib/llm-integration-models';
import { modelsApi } from '@/services/api/models';
import { systemConfigApi } from '@/services/api/system-config';

export const MANAGED_MODELS_QUERY_KEY = ['models'] as const;
export const LLM_INTEGRATIONS_QUERY_KEY = ['llm-integrations'] as const;

/**
 * Prefer Settings → Models (chat). Fall back to legacy Integrations LLM rows
 * until migration is complete.
 */
export function useLlmModelOptions(options?: { enabled?: boolean }) {
  const hookEnabled = options?.enabled ?? true;

  const modelsQuery = useQuery({
    queryKey: MANAGED_MODELS_QUERY_KEY,
    queryFn: () => modelsApi.list(),
    enabled: hookEnabled,
  });

  const integrationsQuery = useQuery({
    queryKey: LLM_INTEGRATIONS_QUERY_KEY,
    queryFn: () => systemConfigApi.getIntegrations(),
    enabled: hookEnabled && !modelsQuery.isLoading,
  });

  const modelOptions = useMemo(() => {
    const fromManaged = extractModelsFromManagedModels(modelsQuery.data || []);
    if (fromManaged.length > 0) {
      return fromManaged;
    }
    const enabled = (integrationsQuery.data || []).filter(
      (item) => item.type === 'llm' && item.enabled,
    );
    return extractModelsFromIntegrations(enabled);
  }, [modelsQuery.data, integrationsQuery.data]);

  return {
    modelOptions: modelOptions as LlmModelOption[],
    isLoading: modelsQuery.isLoading || (modelOptions.length === 0 && integrationsQuery.isLoading),
    isError: modelsQuery.isError && integrationsQuery.isError,
    error: modelsQuery.error || integrationsQuery.error,
  };
}
