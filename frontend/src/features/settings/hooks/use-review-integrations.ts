import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { systemConfigApi } from '@/services/api/system-config';
import type { IntegrationConfig } from '@/types/entities';

export const LLM_INTEGRATIONS_QUERY_KEY = ['llm-integrations'] as const;

export function useReviewIntegrations() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const p = 'pages.settingsModels.review';

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: LLM_INTEGRATIONS_QUERY_KEY,
    queryFn: async () => {
      const all = await systemConfigApi.getIntegrations();
      return all.filter((item) => item.type === 'llm');
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: LLM_INTEGRATIONS_QUERY_KEY });
  };

  const testMutation = useMutation({
    mutationFn: (id: string) => systemConfigApi.testIntegration(id),
    onSuccess: (result) => {
      invalidate();
      if (result.success) {
        toast.success(t(`${p}.testSuccess`, { message: result.message }));
      } else {
        toast.error(t(`${p}.testFailed`, { message: result.message }));
      }
    },
    onError: (error: Error) => {
      toast.error(t(`${p}.testFailed`, { message: error.message }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => systemConfigApi.deleteIntegration(id),
    onSuccess: () => {
      toast.success(t(`${p}.deleteSuccess`));
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(t(`${p}.deleteFailed`, { message: error.message }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IntegrationConfig> }) =>
      systemConfigApi.updateIntegration(id, data),
    onSuccess: () => {
      toast.success(t(`${p}.updateSuccess`));
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(t(`${p}.updateFailed`, { message: error.message }));
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<IntegrationConfig>) => systemConfigApi.createIntegration(data),
    onSuccess: () => {
      toast.success(t(`${p}.createSuccess`));
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(t(`${p}.createFailed`, { message: error.message }));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      systemConfigApi.updateIntegration(id, { enabled }),
    onSuccess: () => invalidate(),
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    integrations,
    isLoading,
    testMutation,
    deleteMutation,
    updateMutation,
    createMutation,
    toggleMutation,
  };
}
