import { getIntegrationBaseUrl } from './integration-models';
import type { IntegrationConfig } from '@/types/entities';

import type { ModelSourceId } from '../constants/model-settings';

export interface ReviewIntegrationFormValues {
  /** Display name and primary model id for connection tests. */
  name: string;
  provider: string;
  endpoint: string;
  modelSource: ModelSourceId;
  apiKey?: string;
  supportsMultimodal?: boolean;
}

/** Strip endpoint paths users paste from API docs (e.g. …/chat/completions). */
export function normalizeIntegrationBaseUrl(url: string, provider?: string): string {
  let normalized = url.trim().replace(/\/+$/, '');
  normalized = normalized.replace(/\/v1\/chat\/completions\/?$/i, '/v1');
  normalized = normalized.replace(/\/chat\/completions\/?$/i, '');
  normalized = normalized.replace(/\/+$/, '');

  // DeepSeek SDK uses https://api.deepseek.com; our client appends /chat/completions to apiBaseUrl
  if (
    provider === 'deepseek' &&
    /^https:\/\/api\.deepseek\.com$/i.test(normalized)
  ) {
    return `${normalized}/v1`;
  }

  if (
    (provider === 'sglang' || provider === 'lmstudio' || provider === 'custom_openai') &&
    !/\/v\d+(?:\/|$)/i.test(normalized)
  ) {
    return `${normalized}/v1`;
  }

  return normalized;
}

function getPrimaryModelId(integration: IntegrationConfig): string {
  const config = integration.config ?? {};
  if (Array.isArray(config.models) && config.models.length > 0) {
    const first = config.models[0];
    if (typeof first === 'string') {
      return first;
    }
    if (first && typeof first === 'object') {
      const obj = first as { id?: string; value?: string; name?: string };
      return obj.id || obj.value || obj.name || integration.name;
    }
  }
  if (typeof config.model === 'string' && config.model.trim()) {
    return config.model.trim();
  }
  return integration.name;
}

export function inferModelSourceFromProvider(provider: string): ModelSourceId {
  if (provider === 'ollama') {
    return 'ollama';
  }
  if (provider === 'lmstudio') {
    return 'lmstudio';
  }
  if (provider === 'sglang') {
    return 'sglang';
  }
  return 'remote';
}

export function integrationToFormValues(
  integration: IntegrationConfig,
): ReviewIntegrationFormValues {
  const config = integration.config ?? {};
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey : '';
  return {
    name: getPrimaryModelId(integration),
    provider: integration.provider || 'openai',
    endpoint: getIntegrationBaseUrl(integration),
    modelSource: inferModelSourceFromProvider(integration.provider),
    apiKey,
    supportsMultimodal: config.supportsMultimodal === true,
  };
}

export function formValuesToIntegrationPatch(
  values: ReviewIntegrationFormValues,
  existing?: IntegrationConfig | null,
): Partial<IntegrationConfig> {
  const prevConfig = existing?.config ?? {};
  const modelId = values.name.trim();
  const endpoint = normalizeIntegrationBaseUrl(values.endpoint, values.provider);

  return {
    name: modelId,
    provider: values.provider,
    type: 'llm',
    config: {
      ...prevConfig,
      apiBaseUrl: endpoint,
      baseUrl: endpoint,
      models: [modelId],
      ...(values.apiKey?.trim() ? { apiKey: values.apiKey.trim() } : {}),
      supportsMultimodal: values.supportsMultimodal ?? false,
    },
  };
}

export function getIntegrationProviderLabel(provider: string, t: (key: string) => string): string {
  const reviewKey = `pages.settingsModels.review.providers.${provider}`;
  const translated = t(reviewKey);
  if (translated !== reviewKey) {
    return translated;
  }
  const providerKey = `pages.settingsModels.providers.${provider === 'custom_openai' ? 'customOpenai' : provider}`;
  const providerTranslated = t(providerKey);
  if (providerTranslated !== providerKey) {
    return providerTranslated;
  }
  return provider;
}

export function isIntegrationActive(integration: IntegrationConfig): boolean {
  return integration.enabled && integration.testStatus !== 'failed';
}
