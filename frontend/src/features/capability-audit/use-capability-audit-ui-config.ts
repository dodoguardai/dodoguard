import { useQuery } from '@tanstack/react-query';
import { systemConfigApi } from '@/services/api/system-config';
import {
  CAPABILITY_AUDIT_UI_CONFIG_KEY,
  normalizeCapabilityAuditUiConfig,
  type CapabilityAuditUiConfig,
} from './capability-audit-ui-config';

export function useCapabilityAuditUiConfig() {
  const query = useQuery({
    queryKey: ['system-config-key', CAPABILITY_AUDIT_UI_CONFIG_KEY],
    queryFn: async (): Promise<CapabilityAuditUiConfig> => {
      try {
        const row = await systemConfigApi.getByKey(CAPABILITY_AUDIT_UI_CONFIG_KEY);
        return normalizeCapabilityAuditUiConfig(row.value);
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          return normalizeCapabilityAuditUiConfig(null);
        }
        throw e;
      }
    },
    staleTime: 30_000,
    retry: false,
  });

  return {
    config: query.data ?? normalizeCapabilityAuditUiConfig(null),
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
