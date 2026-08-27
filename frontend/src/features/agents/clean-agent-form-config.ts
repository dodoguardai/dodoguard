import type { AgentFormValues } from './components/agent-form';

const ALLOW_EMPTY_STRING_CONFIG_KEYS = new Set(['conversationId', 'n8nApiKeyPrefix']);

/**
 * Normalize agent form values into the config payload sent to the API.
 * Shared by save and connection-test (draft) flows.
 */
export function cleanAgentConfigFromForm(
  values: AgentFormValues,
): Record<string, unknown> {
  const cleanConfig: Record<string, unknown> = {};

  if (!values.config) {
    return cleanConfig;
  }

  for (const [key, value] of Object.entries(values.config)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (key === 'inputs') {
      if (typeof value === 'string') {
        if (value.trim() === '') {
          continue;
        }
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
            cleanConfig[key] = parsed;
          }
        } catch {
          // skip invalid JSON
        }
      } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        cleanConfig[key] = value;
      }
      continue;
    }

    if (typeof value === 'string') {
      if (value.trim() === '' && !ALLOW_EMPTY_STRING_CONFIG_KEYS.has(key)) {
        continue;
      }
      cleanConfig[key] = value.trim();
    } else {
      cleanConfig[key] = value;
    }
  }

  return cleanConfig;
}

export function buildAgentUpdatePayload(values: AgentFormValues): Partial<AgentFormValues> {
  const cleanConfig = cleanAgentConfigFromForm(values);

  const cleanData: Partial<AgentFormValues> = {
    name: values.name.trim(),
    type: values.type,
    config: cleanConfig as AgentFormValues['config'],
  };

  if (values.description?.trim()) {
    cleanData.description = values.description.trim();
  }
  if (values.icon) {
    cleanData.icon = values.icon;
  }
  if (values.metadata && Object.keys(values.metadata).length > 0) {
    const cleanMetadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values.metadata)) {
      if (value !== null && value !== undefined && value !== '') {
        cleanMetadata[key] = value;
      }
    }
    if (Object.keys(cleanMetadata).length > 0) {
      cleanData.metadata = cleanMetadata;
    }
  }
  if (values.status) {
    cleanData.status = values.status;
  }

  return cleanData;
}
