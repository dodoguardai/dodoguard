import type { IntegrationConfig } from '@/types/entities';

export function getIntegrationModelLabels(integration: IntegrationConfig): string[] {
  const config = integration.config;
  if (!config) {
    return [];
  }
  if (Array.isArray(config.models)) {
    return config.models.map((model) => {
      if (typeof model === 'string') {
        return model;
      }
      if (model && typeof model === 'object') {
        const obj = model as { name?: string; label?: string; id?: string; value?: string };
        return obj.name || obj.label || obj.id || obj.value || String(model);
      }
      return String(model);
    });
  }
  if (typeof config.model === 'string' && config.model.trim()) {
    return [config.model];
  }
  return [];
}

export function getIntegrationBaseUrl(integration: IntegrationConfig): string {
  const config = integration.config;
  if (!config) {
    return '';
  }
  const candidates = ['apiBaseUrl', 'baseUrl', 'baseURL', 'apiBase', 'endpoint', 'url'];
  for (const key of candidates) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}
