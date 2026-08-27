/**
 * Bridge AgentAsset (资产管理) → TargetAgent for dynamic probe / attack-task APIs.
 */

import { assetIntakeApi } from '@/services/api/asset-intake';
import { agentsApi } from '@/services/api/agents';
import type { AgentAsset, TargetAgent } from '@/types/entities';

const RUNTIME_AGENT_TYPES = new Set<TargetAgent['type']>([
  'dify',
  'coze',
  'n8n',
  'fastgpt',
  'tencent-adp',
  'api',
  'api-stream',
  'langchain',
  'custom',
  'other',
]);

export function assetRuntimeConfig(asset?: AgentAsset): Record<string, unknown> {
  const config = asset?.metadata?.runtimeConfig;
  return config && typeof config === 'object' && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

export function hasAssetRuntimeEndpoint(asset?: AgentAsset): boolean {
  const config = assetRuntimeConfig(asset);
  return Boolean(
    String(config.apiBaseUrl || '').trim() ||
      String(config.webhookUrl || '').trim() ||
      String(config.botId || '').trim() ||
      String(config.connectorId || '').trim() ||
      config.agentType === 'tencent-adp',
  );
}

function mapPlatformFamilyToAgentType(platformFamily: string): TargetAgent['type'] {
  const normalized = platformFamily.toLowerCase();
  if (normalized.includes('dify')) {
    return 'dify';
  }
  if (normalized.includes('coze')) {
    return 'coze';
  }
  if (normalized.includes('fastgpt')) {
    return 'fastgpt';
  }
  if (normalized.includes('n8n')) {
    return 'n8n';
  }
  if (normalized.includes('tencent') || normalized.includes('adp') || normalized.includes('腾讯')) {
    return 'tencent-adp';
  }
  if (normalized.includes('langchain')) {
    return 'langchain';
  }
  if (normalized.includes('api-stream') || normalized.includes('stream')) {
    return 'api-stream';
  }
  if (normalized.includes('api') || normalized.includes('http')) {
    return 'api';
  }
  return 'custom';
}

export function mapAssetToTargetAgentType(asset: AgentAsset): TargetAgent['type'] {
  const config = assetRuntimeConfig(asset);
  const fromConfig = config.agentType;
  if (typeof fromConfig === 'string' && RUNTIME_AGENT_TYPES.has(fromConfig as TargetAgent['type'])) {
    return fromConfig as TargetAgent['type'];
  }
  if (asset.agentType === 'api' || asset.agentType === 'api-stream') {
    return asset.agentType;
  }
  return mapPlatformFamilyToAgentType(asset.platformFamily || '');
}

export function platformFamilyFromAsset(asset: AgentAsset | undefined): string {
  if (!asset) {
    return 'dify';
  }
  const t = mapAssetToTargetAgentType(asset);
  if (t === 'coze') {
    return 'coze';
  }
  if (t === 'fastgpt') {
    return 'fastgpt';
  }
  if (t === 'n8n') {
    return 'n8n';
  }
  if (t === 'tencent-adp') {
    return 'tencent-adp';
  }
  if (t === 'api' || t === 'api-stream') {
    return 'custom';
  }
  return 'dify';
}

export function assetUsesJsonConfig(asset: AgentAsset | undefined): boolean {
  if (!asset) {
    return false;
  }
  const t = mapAssetToTargetAgentType(asset);
  return t === 'fastgpt' || t === 'n8n';
}

export function formatAssetAgentOptionLabel(asset: AgentAsset): string {
  const dept =
    asset.owners?.find((owner) => owner.isPrimary)?.department ||
    asset.owners?.find((owner) => owner.department)?.department ||
    '';
  const typeLabel = mapAssetToTargetAgentType(asset).toUpperCase();
  const parts = [asset.name, typeLabel];
  if (dept) {
    parts.push(dept);
  }
  return parts.join(' · ');
}

/**
 * Ensure a TargetAgent exists for the ledger asset (reuse legacyId or create + link).
 */
export async function ensureTargetAgentFromAsset(asset: AgentAsset): Promise<TargetAgent> {
  if (!hasAssetRuntimeEndpoint(asset)) {
    throw new Error(
      `「${asset.name}」未配置 API 接入信息，请先在资产管理中补充接入配置`,
    );
  }

  const runtimeConfig = assetRuntimeConfig(asset);
  const type = mapAssetToTargetAgentType(asset);
  const legacyId = typeof asset.legacyId === 'string' ? asset.legacyId.trim() : '';

  if (legacyId) {
    try {
      const existing = await agentsApi.get(legacyId);
      // Keep runtime config in sync for probe accuracy
      return await agentsApi.update(existing.id, {
        name: asset.name,
        type,
        config: runtimeConfig,
        status: 'active',
        metadata: {
          ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
          sourceAssetId: asset.id,
          sourceAssetCode: asset.assetCode,
        },
      });
    } catch {
      // Fall through to create if linked target agent was deleted
    }
  }

  const created = await agentsApi.create({
    name: asset.name,
    type,
    config: runtimeConfig,
    status: 'active',
    metadata: {
      sourceAssetId: asset.id,
      sourceAssetCode: asset.assetCode,
    },
  });

  try {
    await assetIntakeApi.updateAgent(asset.id, {
      name: asset.name,
      agentType: asset.agentType,
      platformFamily: asset.platformFamily,
      environment: asset.environment,
      functionIntro: asset.functionIntro,
      exposureLevel: asset.exposureLevel,
      sensitiveData: asset.sensitiveData,
      legacyId: created.id,
      metadata: {
        ...(asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {}),
        targetAgentId: created.id,
      },
    });
  } catch {
    // Probe can still run with created target agent even if link-back fails
  }

  return created;
}

export async function ensureTargetAgentsFromAssets(
  assets: AgentAsset[],
): Promise<TargetAgent[]> {
  const results: TargetAgent[] = [];
  for (const asset of assets) {
    results.push(await ensureTargetAgentFromAsset(asset));
  }
  return results;
}
