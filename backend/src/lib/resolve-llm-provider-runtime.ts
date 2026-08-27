/**
 * Runtime LLM provider resolution: prefer Settings → Models (managed), fall back to Integrations.
 */

import {
  getLlmProviderPayloadForAttackTask,
  getLlmProviderPayloadFromManagedModels,
  type LlmProviderPayloadForAttackTask,
} from './llm-integration-resolve';
import { managedModelService } from '../services/managedModelService';
import { systemConfigService } from '../services/systemConfigService';

export async function resolveLlmProviderPayloadForRuntime(params?: {
  preferredModelId?: string | null;
  organizationId?: string | null;
}): Promise<LlmProviderPayloadForAttackTask | null> {
  const preferredModelId = params?.preferredModelId ?? null;
  const organizationId = params?.organizationId?.trim() || null;

  try {
    const models = organizationId
      ? await managedModelService.listByOrganization(organizationId, false)
      : await managedModelService.listAll(false);
    const fromManaged = getLlmProviderPayloadFromManagedModels(models, preferredModelId);
    if (fromManaged) {
      return fromManaged;
    }
  } catch {
    // Fall back to legacy integrations if managed model table is unavailable.
  }

  const integrations = await systemConfigService.getIntegrations('llm');
  return getLlmProviderPayloadForAttackTask(integrations, preferredModelId);
}
