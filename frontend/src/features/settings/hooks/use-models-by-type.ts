import { useMemo } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ManagedModel, modelsApi } from '@/services/api/models';
import { isSeedModelId, type ModelTypeId, slugFromModelName } from '../constants/model-settings';
import {
  buildModelMetadata,
  buildProviderConfigFromForm,
  groupModelsByType,
  mergeModelsWithSeeds,
} from '../lib/model-settings-utils';

export const MODELS_QUERY_KEY = ['models'] as const;

import type { ModelSourceId } from '../constants/model-settings';

export interface ModelFormValues {
  name: string;
  provider: string;
  endpoint: string;
  modelSource?: ModelSourceId;
  apiKey?: string;
  apiKeyEnvVar?: string;
  supportsMultimodal?: boolean;
  healthStatus?: ManagedModel['healthStatus'];
}

export function useModelsByType() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const p = 'pages.settingsModels';

  const {
    data: apiModels = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: MODELS_QUERY_KEY,
    queryFn: () => modelsApi.list(),
  });

  const models = useMemo(() => mergeModelsWithSeeds(apiModels), [apiModels]);
  const grouped = useMemo(() => groupModelsByType(models), [models]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
  };

  const upsertModelInCache = (model: ManagedModel) => {
    queryClient.setQueryData<ManagedModel[]>(MODELS_QUERY_KEY, (current = []) => {
      const index = current.findIndex((item) => item.id === model.id);
      if (index === -1) {
        return [model, ...current];
      }
      const next = [...current];
      next[index] = model;
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: ({ modelType, values }: { modelType: ModelTypeId; values: ModelFormValues }) => {
      const name = values.name.trim();
      const provider = values.provider.trim() || 'custom_openai';
      return modelsApi.create({
        name,
        provider,
        modelKey: slugFromModelName(name, provider),
        status: 'active',
        healthStatus: values.healthStatus,
        metadata: buildModelMetadata(modelType, values),
        providerConfig: buildProviderConfigFromForm(values),
      });
    },
    onSuccess: (model) => {
      upsertModelInCache(model);
      toast.success(t(`${p}.toastCreated`));
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(t(`${p}.toastError`, { message: err.message }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      model,
      modelType,
      values,
    }: {
      model: ManagedModel;
      modelType: ModelTypeId;
      values: ModelFormValues;
    }) => {
      if (isSeedModelId(model.id)) {
        const name = values.name.trim();
        const provider = values.provider.trim() || model.provider;
        return modelsApi.create({
          name,
          provider,
          modelKey: slugFromModelName(name, provider),
          status: 'active',
          healthStatus: values.healthStatus,
          metadata: buildModelMetadata(modelType, values),
          providerConfig: buildProviderConfigFromForm(values),
        });
      }

      const name = values.name.trim();
      const provider = values.provider.trim() || model.provider;
      return modelsApi.update(model.id, {
        name,
        provider,
        modelKey: slugFromModelName(name, provider),
        healthStatus: values.healthStatus,
        metadata: buildModelMetadata(modelType, values, model),
        providerConfig: buildProviderConfigFromForm(values, model),
      });
    },
    onSuccess: (model) => {
      upsertModelInCache(model);
      toast.success(t(`${p}.toastUpdated`));
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(t(`${p}.toastError`, { message: err.message }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => modelsApi.remove(id),
    onSuccess: () => {
      toast.success(t(`${p}.toastDeleted`));
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(t(`${p}.toastError`, { message: err.message }));
    },
  });

  return {
    models,
    grouped,
    isLoading,
    isError,
    error,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
