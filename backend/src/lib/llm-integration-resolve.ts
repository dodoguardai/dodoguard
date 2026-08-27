/**
 * Resolve which LLM integration + DodoGuard provider id matches a task wizard selection.
 * Mirrors frontend `extractModelsFromIntegrations` value rules so the judge uses the same
 * apiBaseUrl/apiKey as the row chosen in Settings → Integrations.
 */

import { isLmStudioCompatibleUrl, isSglangCompatibleUrl } from './localLlmUrl';
import type { ManagedModelDto } from '../services/managedModelService';
import type { IntegrationConfig } from '../services/systemConfigService';

/** Default max output tokens for LM Studio (Qwen3 thinking can consume the whole budget). */
export const LM_STUDIO_DEFAULT_MAX_TOKENS = 4096;

/** Qwen3 family models default to thinking mode, which breaks non-streaming API calls. */
export function isQwen3ModelName(modelName: string): boolean {
  return /qwen3/i.test(String(modelName).trim());
}

/**
 * Disable Qwen3 "thinking" via OpenAI-compatible passthrough fields.
 * Merged into provider config `passthrough` (spread into `/v1/chat/completions` body).
 */
export function applyQwen3NonStreamingDefaults(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...config };

  const existingPassthrough =
    typeof next.passthrough === 'object' && next.passthrough && !Array.isArray(next.passthrough)
      ? (next.passthrough as Record<string, unknown>)
      : {};

  const existingTemplateKwargs =
    typeof existingPassthrough.chat_template_kwargs === 'object' &&
    existingPassthrough.chat_template_kwargs &&
    !Array.isArray(existingPassthrough.chat_template_kwargs)
      ? (existingPassthrough.chat_template_kwargs as Record<string, unknown>)
      : {};

  next.passthrough = {
    ...existingPassthrough,
    // DashScope / Qwen3 OpenAI-compatible API: top-level snake_case for non-streaming calls
    enable_thinking: existingPassthrough.enable_thinking ?? false,
    enableThinking: existingPassthrough.enableThinking ?? false,
    chat_template_kwargs: {
      ...existingTemplateKwargs,
      enable_thinking: existingTemplateKwargs.enable_thinking ?? false,
    },
  };

  return next;
}

/**
 * LM Studio OpenAI-compatible API extras: disable thinking where supported and cap output.
 * Merged into provider config `passthrough` (spread into `/v1/chat/completions` body).
 */
export function applyLmStudioOpenAiDefaults(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const next = applyQwen3NonStreamingDefaults(config);
  if (!next.apiKey) {
    next.apiKey = 'lm-studio';
  }
  next.apiKeyRequired = false;
  next.max_tokens = LM_STUDIO_DEFAULT_MAX_TOKENS;

  const existingPassthrough =
    typeof next.passthrough === 'object' && next.passthrough && !Array.isArray(next.passthrough)
      ? (next.passthrough as Record<string, unknown>)
      : {};

  next.passthrough = {
    ...existingPassthrough,
    response_mode: existingPassthrough.response_mode ?? 'standard',
  };

  return next;
}

/**
 * SGLang OpenAI-compatible API usually does not require a real API key, but
 * the OpenAI-compatible provider still needs an explicit opt-out.
 */
export function applySglangOpenAiDefaults(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const next = applyQwen3NonStreamingDefaults(config);
  if (!next.apiKey) {
    next.apiKey = 'sglang';
  }
  next.apiKeyRequired = false;
  next.omitDefaultMaxTokens = true;
  return next;
}

/**
 * Apply non-streaming defaults before ad-hoc provider loads (config audit wizards, etc.).
 * Attack-task judge paths should use {@link getLlmProviderPayloadForAttackTask} instead.
 */
export function applyModelAwareNonStreamingDefaults(
  config: Record<string, unknown>,
  providerId: string,
): Record<string, unknown> {
  let next = { ...(typeof config === 'object' && config ? config : {}) };
  const rawApiBaseUrl = typeof next.apiBaseUrl === 'string' ? next.apiBaseUrl : '';
  const providerFamily = providerId.toLowerCase().startsWith('openai:')
    ? inferOpenAiCompatibleProviderFromUrl(rawApiBaseUrl)
    : '';
  const apiBaseUrl = normalizeOpenAiCompatibleBaseUrlForProvider(providerFamily, rawApiBaseUrl);
  if (apiBaseUrl && apiBaseUrl !== rawApiBaseUrl) {
    next.apiBaseUrl = apiBaseUrl;
    next.baseUrl = apiBaseUrl;
  }
  const isLmStudio = apiBaseUrl !== '' && isLmStudioCompatibleUrl(apiBaseUrl);
  if (isLmStudio) {
    next = applyLmStudioOpenAiDefaults(next);
  } else if (apiBaseUrl !== '' && isSglangCompatibleUrl(apiBaseUrl)) {
    next = applySglangOpenAiDefaults(next);
  }
  const modelSuffix = extractChatModelSuffix(providerId);
  if (modelSuffix && isQwen3ModelName(modelSuffix)) {
    next = applyQwen3NonStreamingDefaults(next);
  }
  return next;
}

function inferOpenAiCompatibleProviderFromUrl(apiBaseUrl: string): string {
  if (apiBaseUrl && isLmStudioCompatibleUrl(apiBaseUrl)) {
    return 'lmstudio';
  }
  if (apiBaseUrl && isSglangCompatibleUrl(apiBaseUrl)) {
    return 'sglang';
  }
  return '';
}

export function looksLikeFullProviderId(s: string): boolean {
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
    provider === 'azure'
  ) {
    return `openai:chat:${modelName}`;
  }
  if (provider === 'sglang') {
    return `openai:chat:${modelName}`;
  }
  return `${provider}:chat:${modelName}`;
}

function normalizeIntegrationConfigForProvider(
  provider: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...(typeof config === 'object' && config ? config : {}) };
  const rawApiBaseUrl = typeof next.apiBaseUrl === 'string' ? next.apiBaseUrl : '';
  const apiBaseUrl = normalizeOpenAiCompatibleBaseUrlForProvider(provider, rawApiBaseUrl);
  if (apiBaseUrl && apiBaseUrl !== rawApiBaseUrl) {
    next.apiBaseUrl = apiBaseUrl;
    next.baseUrl = apiBaseUrl;
  }
  const isLmStudio =
    provider === 'lmstudio' || (apiBaseUrl !== '' && isLmStudioCompatibleUrl(apiBaseUrl));
  const isSglang =
    provider === 'sglang' || (apiBaseUrl !== '' && isSglangCompatibleUrl(apiBaseUrl));
  if (isLmStudio) {
    return applyLmStudioOpenAiDefaults(next);
  }
  if (isSglang) {
    return applySglangOpenAiDefaults(next);
  }
  return next;
}

export function normalizeOpenAiCompatibleBaseUrlForProvider(
  provider: string,
  apiBaseUrl: string,
): string {
  let normalized = apiBaseUrl.trim().replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }
  normalized = normalized.replace(/\/v1\/chat\/completions\/?$/i, '/v1');
  normalized = normalized.replace(/\/chat\/completions\/?$/i, '');
  normalized = normalized.replace(/\/+$/, '');
  if (
    (provider === 'sglang' || provider === 'lmstudio' || provider === 'custom_openai') &&
    !/\/v\d+(?:\/|$)/i.test(normalized)
  ) {
    return `${normalized}/v1`;
  }
  return normalized;
}

function getManagedModelType(model: ManagedModelDto): string {
  const raw = model.metadata?.modelType;
  return typeof raw === 'string' ? raw : 'chat';
}

function isRedactedSecret(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === '[REDACTED]';
}

function hasRedactedManagedModelApiKey(model: ManagedModelDto): boolean {
  const providerConfig = model.providerConfig || {};
  const nested =
    providerConfig.config &&
    typeof providerConfig.config === 'object' &&
    !Array.isArray(providerConfig.config)
      ? (providerConfig.config as Record<string, unknown>)
      : {};
  return isRedactedSecret(providerConfig.apiKey) || isRedactedSecret(nested.apiKey);
}

function isUsableManagedChatModel(model: ManagedModelDto): boolean {
  return (
    model.status === 'active' &&
    getManagedModelType(model) === 'chat' &&
    model.healthStatus !== 'offline' &&
    !hasRedactedManagedModelApiKey(model)
  );
}

function getManagedModelEndpoint(model: ManagedModelDto): string {
  const metaEndpoint = model.metadata?.endpoint;
  if (typeof metaEndpoint === 'string' && metaEndpoint.trim()) {
    return metaEndpoint.trim();
  }
  const providerConfig = model.providerConfig || {};
  const nested = providerConfig.config;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const cfg = nested as Record<string, unknown>;
    const raw = cfg.apiBaseUrl || cfg.baseUrl || cfg.endpoint;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  const raw = providerConfig.apiBaseUrl || providerConfig.baseUrl || providerConfig.endpoint;
  return typeof raw === 'string' ? raw.trim() : '';
}

function buildManagedModelProviderConfig(model: ManagedModelDto): Record<string, unknown> {
  const providerConfig = model.providerConfig || {};
  const nested =
    providerConfig.config &&
    typeof providerConfig.config === 'object' &&
    !Array.isArray(providerConfig.config)
      ? (providerConfig.config as Record<string, unknown>)
      : {};
  const endpoint = getManagedModelEndpoint(model);
  const next: Record<string, unknown> = {
    ...nested,
    ...(endpoint ? { apiBaseUrl: endpoint, baseUrl: endpoint } : {}),
  };

  const topLevelApiKey = providerConfig.apiKey;
  const nestedApiKey = nested.apiKey;
  if (typeof nestedApiKey === 'string' && nestedApiKey.trim() && !isRedactedSecret(nestedApiKey)) {
    next.apiKey = nestedApiKey.trim();
  } else if (
    typeof topLevelApiKey === 'string' &&
    topLevelApiKey.trim() &&
    !isRedactedSecret(topLevelApiKey)
  ) {
    next.apiKey = topLevelApiKey.trim();
  }

  const apiKeyEnvVar = providerConfig.apiKeyEnvVar;
  if (typeof apiKeyEnvVar === 'string' && apiKeyEnvVar.trim() && !next.apiKey) {
    next.apiKeyEnvar = apiKeyEnvVar.trim();
    next.apiKeyEnvVar = apiKeyEnvVar.trim();
  }

  return normalizeIntegrationConfigForProvider(model.provider || 'openai', next);
}

function managedModelProviderId(model: ManagedModelDto): string {
  return buildProviderId(model.provider || 'openai', model.name || model.modelKey);
}

export function resolveManagedLlmModelForSelectedModelFuzzy(
  models: ManagedModelDto[],
  selectedModelValue: string,
): {
  model: ManagedModelDto;
  providerId: string;
  matchKind: 'id' | 'exact' | 'model_suffix';
} | null {
  const trimmed = selectedModelValue?.trim();
  if (!trimmed) {
    return null;
  }
  const suffix = extractChatModelSuffix(trimmed);
  const suffixLower = suffix?.toLowerCase();

  for (const model of models) {
    if (!isUsableManagedChatModel(model)) {
      continue;
    }
    const providerId = managedModelProviderId(model);
    if (model.id === trimmed || model.modelKey === trimmed) {
      return { model, providerId, matchKind: 'id' };
    }
    if (providerId === trimmed) {
      return { model, providerId, matchKind: 'exact' };
    }
    if (
      suffixLower &&
      (model.name.toLowerCase() === suffixLower || model.modelKey.toLowerCase() === suffixLower)
    ) {
      return { model, providerId, matchKind: 'model_suffix' };
    }
  }

  return null;
}

/**
 * Find the integration that owns `selectedModelValue` (same string as task `detectionConfig.llmConfig.model`).
 * Returns null if no match (caller should fall back to first enabled integration).
 */
export function resolveLlmIntegrationForSelectedModel(
  integrations: IntegrationConfig[],
  selectedModelValue: string,
): { integration: IntegrationConfig; providerId: string } | null {
  const trimmed = selectedModelValue?.trim();
  if (!trimmed) {
    return null;
  }

  for (const integration of integrations) {
    if (integration.type !== 'llm' || !integration.enabled) {
      continue;
    }
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
        if (modelName) {
          const fullProviderId = buildProviderId(provider, modelName);
          if (fullProviderId === trimmed) {
            return { integration, providerId: fullProviderId };
          }
        }
      }
    }

    if (config.model && typeof config.model === 'string') {
      hasExplicitModel = true;
      const fullProviderId = buildProviderId(provider, config.model);
      if (fullProviderId === trimmed) {
        return { integration, providerId: fullProviderId };
      }
    }

    if (!hasExplicitModel && integration.provider && integration.name) {
      const modelValue = buildProviderId(provider, integration.name);
      if (modelValue === trimmed) {
        return { integration, providerId: modelValue };
      }
    }
  }

  return null;
}

/** Model id after `:chat:` (or raw name when not a full provider id). */
export function extractChatModelSuffix(selectedModelValue: string): string | null {
  const trimmed = selectedModelValue?.trim();
  if (!trimmed) {
    return null;
  }
  if (!looksLikeFullProviderId(trimmed)) {
    return trimmed;
  }
  const parts = trimmed.split(':');
  if (parts[1]?.toLowerCase() !== 'chat') {
    return null;
  }
  const suffix = parts.slice(2).join(':').trim();
  return suffix || null;
}

/**
 * Exact match first, then match by bare model name (e.g. task stores `qwen/qwen3-8b` but integration lists the same id).
 */
export function resolveLlmIntegrationForSelectedModelFuzzy(
  integrations: IntegrationConfig[],
  selectedModelValue: string,
): {
  integration: IntegrationConfig;
  providerId: string;
  matchKind: 'exact' | 'model_suffix';
} | null {
  const exact = resolveLlmIntegrationForSelectedModel(integrations, selectedModelValue);
  if (exact) {
    return { ...exact, matchKind: 'exact' };
  }

  const suffix = extractChatModelSuffix(selectedModelValue);
  if (!suffix) {
    return null;
  }

  const suffixLower = suffix.toLowerCase();
  for (const integration of integrations) {
    if (integration.type !== 'llm' || !integration.enabled) {
      continue;
    }
    const config = integration.config || {};
    const provider = integration.provider || 'openai';
    const candidates: string[] = [];

    if (Array.isArray(config.models)) {
      for (const model of config.models) {
        const modelName =
          typeof model === 'string'
            ? model
            : (model as { id?: string; value?: string })?.id ||
              (model as { id?: string; value?: string })?.value ||
              String(model);
        if (modelName) {
          candidates.push(modelName);
        }
      }
    }
    if (config.model && typeof config.model === 'string') {
      candidates.push(config.model);
    }

    for (const modelName of candidates) {
      if (modelName === suffix || modelName.toLowerCase() === suffixLower) {
        return {
          integration,
          providerId: buildProviderId(provider, modelName),
          matchKind: 'model_suffix',
        };
      }
    }
  }

  return null;
}

export type LlmProviderPayloadForAttackTask = {
  id: string;
  config: Record<string, unknown>;
  /** True when `preferredModelId` matched an integration row (same as task wizard selection). */
  matchedSelection: boolean;
};

/**
 * Resolve DodoGuard provider id + integration config for attack-task LLM usage (judge + static Dify audit).
 * Same resolution rules as attack-task LLM judge (runStructuredLlmJudge).
 */
export function getLlmProviderPayloadForAttackTask(
  integrations: IntegrationConfig[],
  preferredModelId?: string | null,
): LlmProviderPayloadForAttackTask | null {
  const trimmed =
    preferredModelId != null && String(preferredModelId).trim() !== ''
      ? String(preferredModelId).trim()
      : '';

  const resolved = trimmed
    ? resolveLlmIntegrationForSelectedModelFuzzy(integrations, trimmed)
    : null;

  // Task explicitly selected a model but no integration row matches — do not silently use another
  // integration's apiBaseUrl (e.g. Aliyun URL with LM Studio model id → instant API error).
  if (trimmed && !resolved) {
    return null;
  }

  const enabled =
    resolved?.integration ??
    integrations.find((i) => i.enabled && i.type === 'llm') ??
    integrations.find((i) => i.type === 'llm');
  if (!enabled) {
    return null;
  }

  const config = enabled.config || {};
  const provider = enabled.provider || 'openai';
  const models = Array.isArray(config.models) ? config.models : config.model ? [config.model] : [];

  let providerId: string;
  if (resolved) {
    providerId = resolved.providerId;
  } else {
    let testModel =
      trimmed ||
      (typeof models[0] === 'string'
        ? models[0]
        : models[0]?.id || models[0]?.value || String(models[0] || ''));

    if (trimmed && !testModel) {
      testModel = trimmed;
    }

    if (!testModel) {
      return null;
    }

    providerId = buildProviderId(provider, testModel);
  }

  let normalizedConfig = normalizeIntegrationConfigForProvider(
    provider,
    config as Record<string, unknown>,
  );
  const modelSuffix = extractChatModelSuffix(providerId);
  if (modelSuffix && isQwen3ModelName(modelSuffix)) {
    normalizedConfig = applyQwen3NonStreamingDefaults(normalizedConfig);
  }

  return {
    id: providerId,
    config: normalizedConfig,
    matchedSelection: !!resolved,
  };
}

/**
 * Resolve DodoGuard provider id + config from Settings → Models managed model registry.
 * Preferred model may be the new model id/modelKey or the legacy provider id (`openai:chat:qwen`).
 */
export function getLlmProviderPayloadFromManagedModels(
  models: ManagedModelDto[],
  preferredModelId?: string | null,
): LlmProviderPayloadForAttackTask | null {
  const chatModels = models.filter(isUsableManagedChatModel);
  const trimmed =
    preferredModelId != null && String(preferredModelId).trim() !== ''
      ? String(preferredModelId).trim()
      : '';

  const resolved = trimmed
    ? resolveManagedLlmModelForSelectedModelFuzzy(chatModels, trimmed)
    : null;
  if (trimmed && !resolved) {
    return null;
  }

  const model = resolved?.model ?? chatModels[0];
  if (!model) {
    return null;
  }

  let config = buildManagedModelProviderConfig(model);
  const providerId = resolved?.providerId ?? managedModelProviderId(model);
  const modelSuffix = extractChatModelSuffix(providerId);
  if (modelSuffix && isQwen3ModelName(modelSuffix)) {
    config = applyQwen3NonStreamingDefaults(config);
  }

  return {
    id: providerId,
    config,
    matchedSelection: !!resolved,
  };
}
