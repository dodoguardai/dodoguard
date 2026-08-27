/**
 * useQuota Hook
 * Provides quota checking and usage information
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { useOrganizationStore } from '@/stores/organization-store';
import { quotaApi, type QuotaUsageResponse } from '@/services/api/quota';

interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
}

interface UseQuotaReturn {
  quotaUsage: QuotaUsageResponse | undefined;
  isLoading: boolean;
  checkQuota: (metric: string) => Promise<QuotaCheckResult>;
  checkQuotaMutation: ReturnType<typeof useMutation<QuotaCheckResult, Error, string>>;
}

export function useQuota(): UseQuotaReturn {
  const { currentOrg } = useOrganizationStore();

  const { data: quotaUsage, isLoading } = useQuery({
    queryKey: ['quota', 'usage', currentOrg?.id],
    queryFn: () => quotaApi.getUsage(currentOrg!.id),
    enabled: !!currentOrg,
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  const checkQuotaMutation = useMutation({
    mutationFn: (metric: string) => quotaApi.check(currentOrg!.id, metric),
    onError: (error) => {
      console.error('Quota check failed:', error);
    },
  });

  const checkQuota = async (metric: string): Promise<QuotaCheckResult> => {
    if (!currentOrg) {
      return {
        allowed: false,
        remaining: 0,
        limit: 0,
        used: 0,
      };
    }

    try {
      const result = await quotaApi.check(currentOrg.id, metric);
      return result;
    } catch (error) {
      console.error('Quota check error:', error);
      return {
        allowed: false,
        remaining: 0,
        limit: 0,
        used: 0,
      };
    }
  };

  return {
    quotaUsage,
    isLoading,
    checkQuota,
    checkQuotaMutation,
  };
}
