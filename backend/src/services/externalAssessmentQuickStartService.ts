/**
 * One-click assessment create for external API:
 * dialogue (对话安全评估) / compliance (输出内容合规评估).
 * Auto-recommends libraries and fills runConfig from asset runtime — mirrors UI wizards.
 */

import { z } from 'zod';
import logger from '../logger';
import { recommendCompliancePlan } from './complianceRecommendService';
import { resolveDefaultJudgeConfig } from './complianceScanService';
import { recommendDialoguePlan } from './dialogueRecommendService';
import {
  createExternalAssessment,
  executeExternalAssessment,
  loadExternalAssetDetail,
} from './externalProductApiService';
import { systemConfigService } from './systemConfigService';

export const externalQuickStartSchema = z.object({
  kind: z.enum(['dialogue', 'compliance']),
  assetId: z.string().min(1),
  name: z.string().min(1).optional(),
  /** Override auto-recommended library IDs */
  libraryIds: z.array(z.string().min(1)).optional(),
  assessScenario: z.string().optional(),
  domainOverride: z
    .enum(['通用合规', '金融合规', '政务/国企', '个人信息', '数据安全', '行业模板'])
    .optional(),
  /** Execute immediately after create */
  start: z.boolean().optional().default(true),
});

export type ExternalQuickStartInput = z.infer<typeof externalQuickStartSchema>;

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readRuntimeConfig(asset: Record<string, unknown>): Record<string, unknown> {
  const metadata = jsonRecord(asset.metadata);
  return jsonRecord(metadata.runtimeConfig);
}

function hasRuntimeEndpoint(runtime: Record<string, unknown>): boolean {
  return Boolean(
    String(runtime.apiBaseUrl || '').trim() ||
      String(runtime.webhookUrl || '').trim() ||
      runtime.agentType === 'tencent-adp',
  );
}

function assertRuntimeOrThrow(asset: Record<string, unknown>) {
  const runtime = readRuntimeConfig(asset);
  if (!hasRuntimeEndpoint(runtime)) {
    const err = new Error(
      'Agent 未配置 API 接入（metadata.runtimeConfig.apiBaseUrl / webhookUrl）。请先在资产台账完成接入配置。',
    );
    (err as Error & { code?: string }).code = 'ASSET_RUNTIME_MISSING';
    throw err;
  }
  return runtime;
}

export async function quickStartExternalAssessment(params: {
  organizationId: string;
  actorUserId: string | null;
  input: ExternalQuickStartInput;
}) {
  const { organizationId, actorUserId, input } = params;
  const asset = await loadExternalAssetDetail(organizationId, input.assetId);
  if (!asset) {
    const err = new Error('Agent 资产不存在');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }

  const runtimeConfig = assertRuntimeOrThrow(asset as Record<string, unknown>);
  const assetName = String(asset.name || 'Agent');
  const assetCode = asset.assetCode ? String(asset.assetCode) : undefined;

  if (input.kind === 'dialogue') {
    const plan = await recommendDialoguePlan({
      organizationId,
      assetId: input.assetId,
      assessScenario: input.assessScenario || 'launch',
      candidateLibraryIds: input.libraryIds,
    });
    const libIds =
      input.libraryIds && input.libraryIds.length > 0
        ? input.libraryIds
        : plan.include.map((item) => item.libraryId).filter(Boolean);
    if (libIds.length === 0) {
      const err = new Error(
        '未能推荐对话安全用例库。请在「对话安全检测用例库」中启用库，或传入 libraryIds。',
      );
      (err as Error & { code?: string }).code = 'NO_LIBRARIES';
      throw err;
    }

    const name = input.name?.trim() || `${assetName}·对话安全评估`;
    const created = await createExternalAssessment(organizationId, actorUserId, {
      assetId: input.assetId,
      name,
      source: 'external_api_quick_start',
      scanType: 'agent_api',
      targetKind: 'agent_api',
      targetSummary: 'Agent API 对话安全评估',
      runConfig: {
        sourceAssetId: input.assetId,
        sourceAssetCode: assetCode,
        runtimeConfig,
        runtimeAgentType: runtimeConfig.agentType,
        apiBaseUrl: runtimeConfig.apiBaseUrl,
        webhookUrl: runtimeConfig.webhookUrl,
        selectedLibraryIds: libIds,
        selectedCaseIds: [],
        executeMode: input.start ? 'immediate' : 'manual',
        assessScenario: input.assessScenario || 'launch',
        passRateThreshold: 90,
      },
      metadata: {
        source: 'external_api_quick_start',
        kind: 'dialogue',
        governanceStage: 'agent_detection',
        assessScenario: input.assessScenario || 'launch',
        recommendSource: plan.source,
        recommendConfidence: plan.confidence,
        selectedLibraryIds: libIds,
        recommendPlan: {
          include: plan.include,
          exclude: plan.exclude,
          rationaleSummary: plan.rationaleSummary,
        },
      },
      plans: [
        {
          probeType: 'agent_api',
          strategy: 'API 对话黑盒检测',
          enabled: true,
          libIds,
          caseCount: plan.estimatedCaseCount || 0,
          targets: [
            {
              kind: 'agent',
              id: input.assetId,
              name: assetName,
              code: assetCode,
              runtimeAgentType: runtimeConfig.agentType,
            },
          ],
        },
      ],
      start: false,
    });

    let task = created;
    if (input.start && created) {
      task = (await executeExternalAssessment(organizationId, actorUserId, String(created.id), {
        mode: 'manual',
        generateFindings: true,
      })) as typeof created;
    }

    return {
      kind: 'dialogue' as const,
      task,
      recommend: {
        source: plan.source,
        confidence: plan.confidence,
        libraryIds: libIds,
        estimatedCaseCount: plan.estimatedCaseCount,
        rationaleSummary: plan.rationaleSummary,
      },
    };
  }

  // compliance
  const plan = await recommendCompliancePlan({
    organizationId,
    assetId: input.assetId,
    domainOverride: input.domainOverride,
    candidateLibraryIds: input.libraryIds,
  });
  const libIds =
    input.libraryIds && input.libraryIds.length > 0
      ? input.libraryIds
      : plan.include.map((item) => item.libraryId).filter(Boolean);
  if (libIds.length === 0) {
    const err = new Error('未能推荐合规控制库。请在「合规控制库」中启用库，或传入 libraryIds。');
    (err as Error & { code?: string }).code = 'NO_LIBRARIES';
    throw err;
  }

  let judgeConfig: Record<string, unknown> | undefined;
  try {
    const integrations = await systemConfigService.getIntegrations('llm');
    const resolved = resolveDefaultJudgeConfig(integrations);
    if (resolved) {
      judgeConfig = {
        providerId: resolved.providerId,
        label: resolved.label,
        config: resolved.config,
      };
    }
  } catch (error) {
    logger.warn(
      `[external/quick-start] resolve judge config failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!judgeConfig?.providerId) {
    const err = new Error(
      '未配置可用的审查模型。请先在「设置 → 模型设置」添加并启用 LLM 集成（合规评估需要裁判模型）。',
    );
    (err as Error & { code?: string }).code = 'JUDGE_MODEL_MISSING';
    throw err;
  }

  const name = input.name?.trim() || `${assetName}·输出内容合规评估`;
  const created = await createExternalAssessment(organizationId, actorUserId, {
    assetId: input.assetId,
    name,
    source: 'external_api_quick_start',
    scanType: '合规检测',
    targetKind: 'agent_compliance',
    targetSummary: '输出内容合规评估',
    runConfig: {
      sourceAssetId: input.assetId,
      sourceAssetCode: assetCode,
      runtimeConfig,
      runtimeAgentType: runtimeConfig.agentType,
      apiBaseUrl: runtimeConfig.apiBaseUrl,
      webhookUrl: runtimeConfig.webhookUrl,
      selectedLibraryIds: libIds,
      judgeConfig,
      executeMode: input.start ? 'immediate' : 'manual',
    },
    metadata: {
      source: 'external_api_quick_start',
      kind: 'compliance',
      selectedLibraryIds: libIds,
      domain: input.domainOverride || plan.recommendedDomain,
      recommendSource: plan.source,
      recommendConfidence: plan.confidence,
      judgeConfig: { providerId: judgeConfig.providerId, label: judgeConfig.label },
      recommendPlan: {
        include: plan.include,
        exclude: plan.exclude,
        rationaleSummary: plan.rationaleSummary,
        recommendedDomain: plan.recommendedDomain,
      },
    },
    plans: [
      {
        probeType: 'compliance_policy_review',
        strategy: '合规控制项检测',
        enabled: true,
        libIds,
        caseCount: plan.estimatedCaseCount || 0,
        targets: [
          {
            kind: 'agent',
            id: input.assetId,
            name: assetName,
            code: assetCode,
            runtimeAgentType: runtimeConfig.agentType,
          },
        ],
      },
    ],
    start: false,
  });

  let task = created;
  if (input.start && created) {
    task = (await executeExternalAssessment(organizationId, actorUserId, String(created.id), {
      mode: 'manual',
      generateFindings: true,
    })) as typeof created;
  }

  return {
    kind: 'compliance' as const,
    task,
    recommend: {
      source: plan.source,
      confidence: plan.confidence,
      libraryIds: libIds,
      estimatedCaseCount: plan.estimatedCaseCount,
      rationaleSummary: plan.rationaleSummary,
      recommendedDomain: plan.recommendedDomain,
    },
  };
}
