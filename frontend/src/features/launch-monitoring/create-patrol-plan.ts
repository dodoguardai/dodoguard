import { assetIntakeApi } from '@/services/api/asset-intake';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import { computeInitialNextRunAtIso, computeNextRunAtAfterRunIso } from './patrol-schedule-client';
import {
  defaultPeriodicPlanConfig,
  labelFromOptions,
  type PeriodicPlanConfig,
  periodicFailurePolicyOptions,
  periodicFrequencyOptions,
  periodicScopeOptions,
} from './periodic-plan-config';
import { buildPatrolCapabilityTargets } from './patrol-capability-targets';
import type { AgentAsset, SecurityCaseLibrary, SecurityScanTask } from '@/types/entities';

export type CreatePatrolPlanInput = {
  asset: AgentAsset;
  periodicConfig?: PeriodicPlanConfig;
  selectedLibIds?: string[];
  caseLibraries?: SecurityCaseLibrary[];
  source?: string;
  taskName?: string;
  creationMode?: 'ai' | 'manual';
  selectedComponentIds?: string[];
};

export async function createPatrolPlan(input: CreatePatrolPlanInput): Promise<SecurityScanTask> {
  const {
    asset,
    periodicConfig = defaultPeriodicPlanConfig(),
    selectedLibIds,
    caseLibraries = [],
    source = 'launch_monitoring_wizard',
    taskName,
    creationMode = 'ai',
    selectedComponentIds,
  } = input;

  const resolvedLibIds =
    selectedLibIds && selectedLibIds.length > 0
      ? selectedLibIds
      : ['prompt-injection', 'session-adversarial'];

  const periodicFrequencyLabel = labelFromOptions(
    periodicFrequencyOptions,
    periodicConfig.frequency,
  );
  const periodicScopeLabel = labelFromOptions(periodicScopeOptions, periodicConfig.scope);
  const periodicFailurePolicyLabel = labelFromOptions(
    periodicFailurePolicyOptions,
    periodicConfig.failurePolicy,
  );

  const componentTargets = buildPatrolCapabilityTargets(asset.components, selectedComponentIds);

  const selectedCaseCount = caseLibraries
    .filter(
      (library) =>
        resolvedLibIds.includes(library.id) || resolvedLibIds.includes(library.libraryKey),
    )
    .reduce((sum, library) => sum + Number(library.caseCount || 0), 0);

  const runtimeConfig =
    asset.metadata?.runtimeConfig &&
    typeof asset.metadata.runtimeConfig === 'object' &&
    !Array.isArray(asset.metadata.runtimeConfig)
      ? (asset.metadata.runtimeConfig as Record<string, unknown>)
      : {};

  const resolvedName = taskName || `${asset.name} · ${periodicFrequencyLabel}周期巡检`;
  const strategy = `${periodicScopeLabel} · ${periodicConfig.replayFailedCases ? '原失败用例回放' : '标准用例巡检'}`;

  const patrolPlanPayload = {
    ...periodicConfig,
    frequencyLabel: periodicFrequencyLabel,
    scopeLabel: periodicScopeLabel,
    failurePolicyLabel: periodicFailurePolicyLabel,
    nextRunAt: computeInitialNextRunAtIso(periodicConfig),
  };

  const task = await detectionScanningApi.createTask({
    assetId: asset.id,
    name: resolvedName,
    source: '定期巡检',
    scanType: '周期巡检',
    targetKind: 'agent_patrol_plan',
    targetSummary: `${periodicScopeLabel} · ${periodicFrequencyLabel} ${periodicConfig.runAtTime || '02:00'}`,
    ownerName: asset.owners?.find((owner) => owner.isPrimary)?.ownerName || '安全负责人',
    runConfig: {
      sourceAssetId: asset.id,
      sourceAssetCode: asset.assetCode,
      runtimeConfig,
      runtimeAgentType: runtimeConfig.agentType,
      apiBaseUrl: runtimeConfig.apiBaseUrl,
      webhookUrl: runtimeConfig.webhookUrl,
      componentCount: componentTargets.length,
      selectedLibraryIds: resolvedLibIds,
      assessScenario: 'periodic',
      creationMode,
      patrolPlan: patrolPlanPayload,
      passRateThreshold: 90,
      executeMode: 'manual',
    },
    metadata: {
      source,
      operation: 'periodic',
      governanceStage: 'launch_monitoring',
      selectedLibraryIds: resolvedLibIds,
      isPatrolPlan: true,
      assessScenario: 'periodic',
      creationMode,
      patrolPlan: patrolPlanPayload,
      passRateThreshold: 90,
    },
    plans: [
      {
        probeType: 'periodic_regression',
        strategy,
        enabled: periodicConfig.enabled,
        libIds: resolvedLibIds,
        caseCount: selectedCaseCount,
        targets: [
          {
            kind: 'agent',
            id: asset.id,
            name: asset.name,
            code: asset.assetCode,
            runtimeAgentType: runtimeConfig.agentType,
          },
          ...componentTargets,
        ],
        metadata: {
          librarySource: selectedLibIds && selectedLibIds.length > 0 ? 'manual' : 'platform_default',
          patrolPlan: {
            frequency: periodicConfig.frequency,
            firstRunAt: periodicConfig.firstRunAt,
            runAtTime: periodicConfig.runAtTime,
            replayFailedCases: periodicConfig.replayFailedCases,
          },
        },
      },
    ],
  });

  await assetIntakeApi
    .advanceWorkflow(asset.id, {
      stage: 'launch_monitoring',
      status: 'in_progress',
      note: `已创建周期巡检任务 ${task.name}`,
    })
    .catch((error) => {
      console.warn('Failed to advance asset workflow after creating patrol plan:', error);
    });

  return task;
}

export type UpdatePatrolPlanInput = {
  task: SecurityScanTask;
  taskName: string;
  periodicConfig: PeriodicPlanConfig;
};

export async function updatePatrolPlan(input: UpdatePatrolPlanInput): Promise<SecurityScanTask> {
  const { task, taskName, periodicConfig } = input;
  const existingPlan = task.metadata?.patrolPlan || task.runConfig?.patrolPlan || {};
  const periodicFrequencyLabel = labelFromOptions(
    periodicFrequencyOptions,
    periodicConfig.frequency,
  );
  const periodicScopeLabel = labelFromOptions(periodicScopeOptions, periodicConfig.scope);
  const periodicFailurePolicyLabel = labelFromOptions(
    periodicFailurePolicyOptions,
    periodicConfig.failurePolicy,
  );

  const lastRunAt =
    typeof (existingPlan as { lastRunAt?: string }).lastRunAt === 'string'
      ? (existingPlan as { lastRunAt: string }).lastRunAt
      : undefined;
  const nextRunAt = lastRunAt
    ? computeNextRunAtAfterRunIso(periodicConfig, new Date(lastRunAt))
    : computeInitialNextRunAtIso(periodicConfig);

  const patrolPlanPayload = {
    ...periodicConfig,
    frequencyLabel: periodicFrequencyLabel,
    scopeLabel: periodicScopeLabel,
    failurePolicyLabel: periodicFailurePolicyLabel,
    nextRunAt,
    ...(lastRunAt ? { lastRunAt } : {}),
  };

  const existingMetadata =
    task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const existingRunConfig =
    task.runConfig && typeof task.runConfig === 'object' ? task.runConfig : {};

  return detectionScanningApi.updateTask(task.id, {
    name: taskName.trim(),
    targetSummary: `${periodicScopeLabel} · ${periodicFrequencyLabel} ${periodicConfig.runAtTime || '02:00'}`,
    metadata: {
      ...existingMetadata,
      patrolPlan: patrolPlanPayload,
    },
    runConfig: {
      ...existingRunConfig,
      patrolPlan: patrolPlanPayload,
    },
  });
}
