/**
 * Build selectable LLM model options from Enterprise Settings → Integrations (LLM).
 * Shared by task wizard (agent driver) and Dify Config gray-box audit reviewer.
 */

import type { IntegrationConfig } from '@/types/entities';
import type { ManagedModel } from '@/services/api/models';

export interface LlmModelOption {
  value: string;
  label: string;
  modelId?: string;
  config?: {
    apiBaseUrl?: string;
    apiKey?: string;
  };
}

function looksLikeFullProviderId(s: string): boolean {
  const parts = s.split(':');
  if (parts.length < 3) {
    return false;
  }
  const kind = parts[1]?.toLowerCase();
  return ['chat', 'completion', 'embedding', 'embeddings', 'assistant'].includes(kind);
}

function buildProviderId(provider: string, modelName: string): string {
  if (looksLikeFullProviderId(modelName)) {
    return modelName;
  }
  if (provider === 'ollama') {
    return `ollama:chat:${modelName}`;
  }
  // OpenAI-compatible endpoints (DashScope, Doubao, LM Studio, custom gateway, Azure OA).
  if (
    provider === 'aliyun' ||
    provider === 'lmstudio' ||
    provider === 'custom_openai' ||
    provider === 'doubao' ||
    provider === 'azure_openai' ||
    provider === 'azure' ||
    provider === 'sglang'
  ) {
    return `openai:chat:${modelName}`;
  }
  return `${provider || 'openai'}:chat:${modelName}`;
}

function getManagedModelType(model: ManagedModel): string {
  return typeof model.metadata?.modelType === 'string' ? model.metadata.modelType : 'chat';
}

function getManagedModelEndpoint(model: ManagedModel): string | undefined {
  const metaEndpoint = model.metadata?.endpoint;
  if (typeof metaEndpoint === 'string' && metaEndpoint.trim()) {
    return metaEndpoint.trim();
  }
  const config = model.providerConfig?.config;
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    const baseUrl =
      (config as { baseUrl?: unknown; apiBaseUrl?: unknown }).apiBaseUrl ||
      (config as { baseUrl?: unknown }).baseUrl;
    if (typeof baseUrl === 'string' && baseUrl.trim()) {
      return baseUrl.trim();
    }
  }
  return undefined;
}

/**
 * Build selectable LLM model options from Settings → Models (managed models).
 * Value stays as provider-compatible id (e.g. openai:chat:qwen-max) so old tasks remain compatible.
 */
export function extractModelsFromManagedModels(models: ManagedModel[]): LlmModelOption[] {
  const out: LlmModelOption[] = [];
  const seen = new Set<string>();

  for (const model of models) {
    if (
      model.status !== 'active' ||
      model.healthStatus === 'offline' ||
      getManagedModelType(model) !== 'chat'
    ) {
      continue;
    }
    const value = buildProviderId(model.provider || 'openai', model.name || model.modelKey);
    if (seen.has(value)) {
      continue;
    }
    out.push({
      value,
      label: model.name,
      modelId: model.id,
      config: {
        apiBaseUrl: getManagedModelEndpoint(model),
      },
    });
    seen.add(value);
  }

  return out;
}

export function extractModelsFromIntegrations(integrations: IntegrationConfig[]): LlmModelOption[] {
  const models: LlmModelOption[] = [];
  const seen = new Set<string>();

  for (const integration of integrations) {
    if (integration.type === 'llm' && integration.enabled) {
      const config = integration.config || {};
      const provider = integration.provider || 'openai';
      let hasExplicitModel = false;

      if (Array.isArray(config.models)) {
        hasExplicitModel = true;
        for (const model of config.models) {
          const modelName =
            typeof model === 'string'
              ? model
              : (model as { id?: string; value?: string })?.id ||
                (model as { id?: string; value?: string })?.value ||
                String(model);
          const modelLabel =
            typeof model === 'string'
              ? model
              : (model as { name?: string; label?: string })?.name ||
                (model as { name?: string; label?: string })?.label ||
                modelName;

          if (modelName) {
            const fullProviderId = buildProviderId(provider, modelName);
            if (!seen.has(fullProviderId)) {
              models.push({
                value: fullProviderId,
                label: modelLabel,
                config: {
                  apiBaseUrl: config.apiBaseUrl as string | undefined,
                  apiKey: config.apiKey as string | undefined,
                },
              });
              seen.add(fullProviderId);
            }
          }
        }
      }

      if (config.model && typeof config.model === 'string') {
        hasExplicitModel = true;
        const modelName = config.model;
        const fullProviderId = buildProviderId(provider, modelName);
        if (!seen.has(fullProviderId)) {
          models.push({
            value: fullProviderId,
            label: modelName,
            config: {
              apiBaseUrl: config.apiBaseUrl as string | undefined,
              apiKey: config.apiKey as string | undefined,
            },
          });
          seen.add(fullProviderId);
        }
      }

      if (!hasExplicitModel && integration.provider && integration.name) {
        const modelValue = buildProviderId(provider, integration.name);
        if (!seen.has(modelValue)) {
          models.push({
            value: modelValue,
            label: `${integration.name} (${integration.provider})`,
            config: {
              apiBaseUrl: config.apiBaseUrl as string | undefined,
              apiKey: config.apiKey as string | undefined,
            },
          });
          seen.add(modelValue);
        }
      }
    }
  }

  return models;
}
