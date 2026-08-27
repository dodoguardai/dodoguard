import type { LlmModelOption } from '@/lib/llm-integration-models';
import type { AgentAsset } from '@/types/entities';

export function readAgentRuntimeConfig(asset: AgentAsset): Record<string, unknown> {
  const metadata = asset.metadata;
  if (metadata?.runtimeConfig && typeof metadata.runtimeConfig === 'object' && !Array.isArray(metadata.runtimeConfig)) {
    return metadata.runtimeConfig as Record<string, unknown>;
  }
  return {};
}

export function hasAgentRuntimeEndpoint(asset: AgentAsset): boolean {
  const config = readAgentRuntimeConfig(asset);
  return Boolean(
    String(config.apiBaseUrl || '').trim() ||
      String(config.webhookUrl || '').trim() ||
      config.agentType === 'tencent-adp',
  );
}

export function resolveDefaultJudgeModel(
  models: LlmModelOption[],
): LlmModelOption | null {
  return models[0] ?? null;
}

export function buildComplianceJudgeConfig(
  models: LlmModelOption[],
): { providerId: string; label: string; config: Record<string, unknown> } | undefined {
  const model = resolveDefaultJudgeModel(models);
  if (!model) {
    return undefined;
  }
  return {
    providerId: model.value,
    label: model.label,
    config: model.config || {},
  };
}

export function buildComplianceTaskRunConfig(params: {
  asset: AgentAsset;
  modelOptions: LlmModelOption[];
  selectedLibraryIds: string[];
}) {
  const runtimeConfig = readAgentRuntimeConfig(params.asset);
  const judgeConfig = buildComplianceJudgeConfig(params.modelOptions);
  return {
    sourceAssetId: params.asset.id,
    sourceAssetCode: params.asset.assetCode,
    runtimeConfig,
    runtimeAgentType: runtimeConfig.agentType,
    apiBaseUrl: runtimeConfig.apiBaseUrl,
    webhookUrl: runtimeConfig.webhookUrl,
    selectedLibraryIds: params.selectedLibraryIds,
    judgeConfig,
    executeMode: 'manual' as const,
  };
}
