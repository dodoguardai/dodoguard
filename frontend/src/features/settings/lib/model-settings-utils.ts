import {
  CHAT_VENDORS,
  DEFAULT_MODEL_SEEDS,
  isModelTypeId,
  isSeedModelId,
  MODEL_PROVIDERS,
  MODEL_TYPE_IDS,
  type ModelProviderId,
  type ModelSourceId,
  type ModelTypeId,
  slugFromModelName,
} from '../constants/model-settings';
import { normalizeIntegrationBaseUrl } from './integration-form-utils';
import type { ManagedModel } from '@/services/api/models';

export function isSeedModel(model: ManagedModel): boolean {
  return model.metadata?.seed === true || isSeedModelId(model.id);
}

export function getModelType(model: ManagedModel): ModelTypeId {
  const raw = model.metadata?.modelType;
  if (isModelTypeId(raw)) {
    return raw;
  }
  return 'chat';
}

export function isBuiltinModel(model: ManagedModel): boolean {
  return model.metadata?.builtin === true;
}

export function getModelEndpoint(model: ManagedModel): string {
  const metaEndpoint = model.metadata?.endpoint;
  if (typeof metaEndpoint === 'string' && metaEndpoint.trim()) {
    return metaEndpoint.trim();
  }

  const config = model.providerConfig?.config;
  if (config && typeof config === 'object' && config !== null && 'baseUrl' in config) {
    const baseUrl = (config as { baseUrl?: unknown }).baseUrl;
    if (typeof baseUrl === 'string' && baseUrl.trim()) {
      return baseUrl.trim();
    }
  }
  if (config && typeof config === 'object' && config !== null && 'apiBaseUrl' in config) {
    const apiBaseUrl = (config as { apiBaseUrl?: unknown }).apiBaseUrl;
    if (typeof apiBaseUrl === 'string' && apiBaseUrl.trim()) {
      return apiBaseUrl.trim();
    }
  }

  return '';
}

export function getProviderLabel(providerId: string, t: (key: string) => string): string {
  const chatMatch = CHAT_VENDORS.find((p) => p.id === providerId);
  if (chatMatch) {
    return t(chatMatch.labelKey);
  }
  const match = MODEL_PROVIDERS.find((p) => p.id === providerId);
  if (match) {
    return t(match.labelKey);
  }
  return providerId;
}

export function groupModelsByType(models: ManagedModel[]): Record<ModelTypeId, ManagedModel[]> {
  const grouped: Record<ModelTypeId, ManagedModel[]> = {
    chat: [],
    embedding: [],
    rerank: [],
    vllm: [],
    asr: [],
  };

  for (const model of models) {
    grouped[getModelType(model)].push(model);
  }

  return grouped;
}

export function buildModelMetadata(
  modelType: ModelTypeId,
  values: {
    endpoint: string;
    modelSource?: ModelSourceId;
    supportsMultimodal?: boolean;
  },
  existing?: ManagedModel | null,
): Record<string, unknown> {
  const base = existing?.metadata ?? {};
  return {
    ...base,
    modelType,
    endpoint: values.endpoint.trim() || undefined,
    modelSource: values.modelSource,
    supportsMultimodal: values.supportsMultimodal ?? false,
    builtin: existing ? isBuiltinModel(existing) : false,
    seed: existing && isSeedModel(existing) ? true : undefined,
  };
}

export function buildProviderConfigFromForm(
  values: {
    endpoint: string;
    provider?: string;
    apiKey?: string;
    apiKeyEnvVar?: string;
    name: string;
  },
  existing?: ManagedModel | null,
): Record<string, unknown> | undefined {
  const trimmed = values.endpoint.trim();
  const apiBaseUrl = trimmed ? normalizeIntegrationBaseUrl(trimmed, values.provider) : '';

  const out: Record<string, unknown> = {
    label: values.name.trim() || existing?.name,
    config: {
      ...(apiBaseUrl ? { apiBaseUrl, baseUrl: apiBaseUrl } : {}),
      ...(values.apiKey?.trim() ? { apiKey: values.apiKey.trim() } : {}),
    },
  };

  if (!values.apiKey?.trim() && values.apiKeyEnvVar?.trim()) {
    out.apiKeyEnvVar = values.apiKeyEnvVar.trim();
  }

  return out;
}

export function readModelSource(model: ManagedModel): ModelSourceId {
  const raw = model.metadata?.modelSource;
  if (raw === 'ollama' || raw === 'lmstudio' || raw === 'sglang' || raw === 'remote') {
    return raw;
  }
  // Older records did not persist modelSource. Infer it from the provider so
  // editing an existing local model does not present a misleading remote form.
  if (model.provider === 'ollama') {
    return 'ollama';
  }
  if (model.provider === 'lmstudio') {
    return 'lmstudio';
  }
  if (model.provider === 'sglang') {
    return 'sglang';
  }
  return 'remote';
}

export function readApiKeyEnvVar(model: ManagedModel): string {
  const raw = model.providerConfig?.apiKeyEnvVar;
  return typeof raw === 'string' ? raw : '';
}

export function readSupportsMultimodal(model: ManagedModel): boolean {
  return model.metadata?.supportsMultimodal === true;
}

/** @deprecated use buildProviderConfigFromForm */
export function buildProviderConfigForEndpoint(
  endpoint: string,
  existing?: ManagedModel | null,
): Record<string, unknown> | undefined {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return existing?.providerConfig;
  }

  const existingConfig =
    existing?.providerConfig?.config && typeof existing.providerConfig.config === 'object'
      ? (existing.providerConfig.config as Record<string, unknown>)
      : {};

  return {
    ...(existing?.providerConfig ?? {}),
    config: {
      ...existingConfig,
      baseUrl: trimmed,
    },
  };
}

export function defaultProviderForType(modelType: ModelTypeId): ModelProviderId {
  return modelType === 'chat' ? 'custom_openai' : 'ollama';
}

function seedToManagedModel(
  seed: (typeof DEFAULT_MODEL_SEEDS)[ModelTypeId][number],
  modelType: ModelTypeId,
): ManagedModel {
  return {
    id: seed.id,
    organizationId: '',
    name: seed.name,
    provider: seed.provider,
    modelKey: slugFromModelName(seed.name, seed.provider),
    status: 'active',
    healthStatus: 'unknown',
    quotaMonthly: 100000,
    quotaUsed: 0,
    createdAt: '',
    updatedAt: '',
    metadata: {
      modelType,
      endpoint: seed.endpoint,
      seed: true,
    },
  };
}

/** Fill empty type sections with admission defaultModels when API has no rows for that type. */
export function mergeModelsWithSeeds(apiModels: ManagedModel[]): ManagedModel[] {
  const grouped = groupModelsByType(apiModels);
  const merged = [...apiModels];

  for (const typeId of MODEL_TYPE_IDS) {
    if (grouped[typeId].length > 0) {
      continue;
    }
    for (const seed of DEFAULT_MODEL_SEEDS[typeId]) {
      merged.push(seedToManagedModel(seed, typeId));
    }
  }

  return merged;
}
