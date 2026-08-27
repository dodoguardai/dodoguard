/**
 * One-time (idempotent) expansion of Settings → Integrations LLM rows
 * into Settings → Models managed chat models.
 */

import logger from '../logger';
import { managedModelService, type ManagedModelDto } from './managedModelService';
import { systemConfigService, type IntegrationConfig } from './systemConfigService';

type ExpandableModel = {
  name: string;
  modelKey: string;
  provider: string;
  endpoint?: string;
  apiKey?: string;
  integrationId: string;
  integrationName: string;
};

function looksLikeFullProviderId(s: string): boolean {
  const parts = s.split(':');
  if (parts.length < 3) {
    return false;
  }
  const kind = parts[1]?.toLowerCase();
  return ['chat', 'completion', 'embedding', 'embeddings', 'assistant'].includes(kind);
}

function extractChatModelSuffix(selectedModelValue: string): string {
  const trimmed = selectedModelValue.trim();
  if (!looksLikeFullProviderId(trimmed)) {
    return trimmed;
  }
  const parts = trimmed.split(':');
  if (parts[1]?.toLowerCase() !== 'chat') {
    return trimmed;
  }
  return parts.slice(2).join(':').trim() || trimmed;
}

function mapIntegrationProvider(provider: string): string {
  const p = (provider || 'openai').toLowerCase();
  if (p === 'ollama') {
    return 'ollama';
  }
  if (p === 'anthropic') {
    return 'anthropic';
  }
  if (p === 'deepseek') {
    return 'deepseek';
  }
  if (p === 'azure' || p === 'azure_openai') {
    return 'azure_openai';
  }
  if (p === 'openai') {
    return 'openai';
  }
  if (p === 'lmstudio' || p === 'aliyun') {
    return 'openai';
  }
  return p || 'custom_openai';
}

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function readEndpoint(config: Record<string, unknown>): string | undefined {
  const candidates = ['apiBaseUrl', 'baseUrl', 'baseURL', 'apiBase', 'endpoint', 'url'];
  for (const key of candidates) {
    const raw = config[key];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return undefined;
}

function expandIntegrationModels(integration: IntegrationConfig): ExpandableModel[] {
  if (integration.type !== 'llm' || !integration.enabled) {
    return [];
  }
  const config = (integration.config || {}) as Record<string, unknown>;
  const provider = mapIntegrationProvider(integration.provider || 'openai');
  const endpoint = readEndpoint(config);
  const apiKey =
    typeof config.apiKey === 'string' && config.apiKey.trim() ? config.apiKey.trim() : undefined;
  const out: ExpandableModel[] = [];
  let hasExplicit = false;

  if (Array.isArray(config.models)) {
    hasExplicit = true;
    for (const model of config.models) {
      const modelName =
        typeof model === 'string'
          ? model
          : (model as { id?: string; value?: string })?.id ||
            (model as { id?: string; value?: string })?.value ||
            String(model);
      if (!modelName) {
        continue;
      }
      const bare = extractChatModelSuffix(String(modelName));
      out.push({
        name: bare,
        modelKey: slugFromName(bare) || bare,
        provider,
        endpoint,
        apiKey,
        integrationId: integration.id,
        integrationName: integration.name,
      });
    }
  }

  if (typeof config.model === 'string' && config.model.trim()) {
    hasExplicit = true;
    const bare = extractChatModelSuffix(config.model);
    out.push({
      name: bare,
      modelKey: slugFromName(bare) || bare,
      provider,
      endpoint,
      apiKey,
      integrationId: integration.id,
      integrationName: integration.name,
    });
  }

  if (!hasExplicit && integration.name) {
    const bare = extractChatModelSuffix(integration.name);
    out.push({
      name: bare,
      modelKey: slugFromName(bare) || bare,
      provider,
      endpoint,
      apiKey,
      integrationId: integration.id,
      integrationName: integration.name,
    });
  }

  return out;
}

function alreadyMigrated(existing: ManagedModelDto[], candidate: ExpandableModel): boolean {
  return existing.some((model) => {
    const meta = model.metadata || {};
    if (
      meta.migratedFromIntegrationId === candidate.integrationId &&
      model.modelKey === candidate.modelKey
    ) {
      return true;
    }
    const sameName =
      model.name === candidate.name ||
      model.modelKey === candidate.modelKey ||
      model.modelKey === candidate.name;
    const sameProvider = (model.provider || '').toLowerCase() === candidate.provider.toLowerCase();
    return sameName && sameProvider;
  });
}

export async function migrateLlmIntegrationsToManagedModels(
  organizationId: string,
): Promise<{ created: number; skipped: number }> {
  const existing = await managedModelService.listByOrganization(organizationId, false);
  const integrations = await systemConfigService.getIntegrations('llm');
  const candidates = integrations.flatMap(expandIntegrationModels);

  let created = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    if (alreadyMigrated(existing, candidate)) {
      skipped += 1;
      continue;
    }

    const createdModel = await managedModelService.create({
      organizationId,
      name: candidate.name,
      provider: candidate.provider,
      modelKey: candidate.modelKey,
      status: 'active',
      providerConfig: {
        label: candidate.name,
        config: {
          ...(candidate.endpoint
            ? { baseUrl: candidate.endpoint, apiBaseUrl: candidate.endpoint }
            : {}),
          ...(candidate.apiKey ? { apiKey: candidate.apiKey } : {}),
        },
      },
      metadata: {
        modelType: 'chat',
        ...(candidate.endpoint ? { endpoint: candidate.endpoint } : {}),
        displayName: candidate.name,
        migratedFromIntegrationId: candidate.integrationId,
        migratedFromIntegrationName: candidate.integrationName,
      },
    });

    existing.push(createdModel);
    created += 1;
  }

  if (created > 0) {
    logger.info('[migrateLlmIntegrationsToManagedModels] migrated LLM integrations', {
      organizationId,
      created,
      skipped,
    });
  }

  return { created, skipped };
}
