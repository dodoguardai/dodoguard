/**
 * Configuration Mode Wizard — API Test vs Gray-Box & API Black-Box scanning task split flows.
 */

import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Form } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Stepper } from '@/components/ui/stepper';
import { markAttackTaskRunJustStarted } from '@/features/tasks/active-run-session';
import { ATTACK_TASK_EXECUTION_LIMITS } from '@/features/tasks/execution-settings-limits';
import { zodResolverV4 } from '@/lib/zod-resolver';
import { agentsApi } from '@/services/api/agents';
import { tasksApi } from '@/services/api/tasks';
import { StepConfigYaml } from './steps/step-config-yaml';
import { Step1BasicInfo } from './steps/step1-basic-info';
import { Step2SelectTarget } from './steps/step2-select-target';
import { Step3SelectVulnerabilities } from './steps/step3-select-vulnerabilities';
import { Step4AttackMode } from './steps/step4-attack-mode';
import { Step5DetectionConfig } from './steps/step5-detection-config';
import { Step6AgentConfig } from './steps/step6-agent-config';
import { Step7AdvancedSettings } from './steps/step7-advanced-settings';
import { Step8Review } from './steps/step8-review';
import {
  getRegisteredAgentIdsFromTargetConfig,
  MAX_AGENTS_PER_BATCH,
} from './task-wizard-agent-target';
import { getWizardSteps, type WizardStepKey, wizardStepTitle } from './task-wizard-steps';
import type { CreateAttackTaskRequest } from '@/types/api';
import type { AttackTask, TargetAgent, TaskType } from '@/types/entities';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Align task platform_family + configAudit yaml|json with the selected target agent when surface is all/agent. */
function platformFamilyFromAgentType(
  agentType: TargetAgent['type'] | undefined,
): 'dify' | 'coze' | 'fastgpt' | 'n8n' | 'tencent-adp' {
  if (agentType === 'coze') {
    return 'coze';
  }
  if (agentType === 'fastgpt') {
    return 'fastgpt';
  }
  if (agentType === 'n8n') {
    return 'n8n';
  }
  if (agentType === 'tencent-adp') {
    return 'tencent-adp';
  }
  return 'dify';
}

const RUN_AFTER_CREATE_STORAGE_KEY = 'attack-task-wizard-run-after-create';

const EXEC = ATTACK_TASK_EXECUTION_LIMITS;

type EndpointTargetConfig = {
  agent?: { apiBaseUrl?: string; apiKey?: string };
  mcp?: { serverUrl?: string };
  llm?: { apiUrl?: string; apiKey?: string };
} & Record<string, { endpoint?: string } | unknown>;

function sanitizeTargetConfigForApi(tc: Record<string, unknown>): Record<string, unknown> {
  const { agentIds: _a, ...rest } = tc;
  return rest;
}

const taskFormSchema = z.object({
  taskKind: z.enum(['api_test', 'config_audit', 'config_static']),
  name: z.string().trim().min(1, '请输入任务名称'),
  description: z.string().optional(),
  teamId: z.string().optional(),
  configAuditYaml: z.string().optional(),
  configAuditFileName: z.string().optional(),
  targetType: z.enum(['agent', 'mcp', 'llm', 'tool', 'platform', 'composite']),
  targetConfig: z.record(z.string(), z.unknown()).refine(() => true),
  vulnerabilities: z.array(z.string()).min(1, 'At least one vulnerability must be selected'),
  attackMode: z.enum(['simple', 'conversation', 'composite']),
  compositeAttackConfig: z.record(z.string(), z.unknown()).optional(),
  detectionConfig: z.object({
    detectionMode: z.enum(['rule', 'llm']).default('rule'),
    useRule: z.boolean().optional(),
    useLLM: z.boolean().optional(),
    useKnowledgeBase: z.boolean().optional(),
    ruleSetId: z.string().optional(),
    llmConfig: z
      .object({
        model: z.string().optional(),
        prompt: z.string().optional(),
        confidenceThreshold: z.number().min(0).max(1).optional(),
        successDescription: z.string().optional(),
      })
      .optional(),
    aggregationWeights: z
      .object({
        rule: z.number().min(0).max(1).optional(),
        llm: z.number().min(0).max(1).optional(),
      })
      .optional(),
    finalThreshold: z.number().min(0).max(1).optional(),
  }),
  agentConfig: z
    .object({
      enabled: z.boolean(),
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
    })
    .optional(),
  advancedSettings: z
    .object({
      delayMs: z.number().min(EXEC.delayMs.min).max(EXEC.delayMs.max).optional(),
      maxConcurrency: z.number().min(EXEC.maxConcurrency.min).max(EXEC.maxConcurrency.max).optional(),
      timeout: z.number().min(EXEC.timeoutMs.min).max(EXEC.timeoutMs.max).optional(),
      retryStrategy: z
        .object({
          maxRetries: z.number().min(EXEC.maxRetries.min).max(EXEC.maxRetries.max).optional(),
          retryDelay: z.number().min(EXEC.retryDelayMs.min).max(EXEC.retryDelayMs.max).optional(),
        })
        .optional(),
      notifications: z
        .object({
          onComplete: z.boolean().optional(),
          onVulnerabilityFound: z.boolean().optional(),
          onFailure: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  saveWorkflowConfigAsset: z.boolean().optional(),
});

export type TaskFormData = z.infer<typeof taskFormSchema>;

type SurfaceForPayload =
  | 'all'
  | 'agent'
  | 'coze'
  | 'fastgpt'
  | 'n8n'
  | 'tencent-adp'
  | 'mcp'
  | 'tool'
  | 'platform'
  | 'llm';

/** MySQL v4：由「Task type」推导 taskTypeId（沿用 dify_* code）；platform_family 按入口 surface 区分 Coze / FastGPT / N8N / Dify。 */
function resolveV4CreatePayload(
  data: TaskFormData,
  taskTypes: TaskType[],
  surface: SurfaceForPayload,
  platformFamilyOverride?: 'dify' | 'coze' | 'fastgpt' | 'n8n' | 'tencent-adp',
) {
  const code =
    data.taskKind === 'config_audit'
      ? 'dify_config_audit'
      : data.taskKind === 'config_static'
        ? 'dify_config_static'
        : 'dify_api_scan';
  const taskTypeId = taskTypes.find((t) => t.code === code)?.id;
  const platformFamily =
    platformFamilyOverride ??
    (surface === 'coze'
      ? ('coze' as const)
      : surface === 'fastgpt'
        ? ('fastgpt' as const)
        : surface === 'n8n'
          ? ('n8n' as const)
          : surface === 'tencent-adp'
            ? ('tencent-adp' as const)
            : ('dify' as const));
  return {
    ...(taskTypeId ? { taskTypeId } : {}),
    platformFamily,
    scanMode:
      data.taskKind === 'config_audit' || data.taskKind === 'config_static'
        ? ('static' as const)
        : ('runtime' as const),
  };
}

function buildCreateAttackTaskRequest(
  data: TaskFormData,
  taskTypes: TaskType[],
  surface: SurfaceForPayload,
  overrides: { name: string; targetConfig: Record<string, unknown>; wizardBatchId?: string },
  platformFamilyOverride?: 'dify' | 'coze' | 'fastgpt' | 'n8n' | 'tencent-adp',
): CreateAttackTaskRequest {
  const detectionConfig = data.detectionConfig;
  const v4 = resolveV4CreatePayload(data, taskTypes, surface, platformFamilyOverride);
  return {
    name: overrides.name,
    description: data.description,
    teamId: data.teamId,
    targetType: data.targetType,
    targetConfig: overrides.targetConfig,
    vulnerabilities: data.vulnerabilities,
    attackMode: data.attackMode,
    compositeAttackConfig: data.compositeAttackConfig,
    platformFamily: v4.platformFamily,
    scanMode: v4.scanMode,
    ...(v4.taskTypeId ? { taskTypeId: v4.taskTypeId } : {}),
    detectionConfig: {
      useRule: Boolean(detectionConfig?.useRule),
      useLLM: Boolean(detectionConfig?.useLLM),
      useKnowledgeBase: Boolean(detectionConfig?.useKnowledgeBase),
      ruleSetId: detectionConfig?.ruleSetId,
      llmConfig: detectionConfig?.llmConfig,
    },
    agentConfig: data.agentConfig,
    ...(data.taskKind === 'config_audit' || data.taskKind === 'config_static'
      ? {
          configAudit: {
            ...(v4.platformFamily === 'fastgpt' || v4.platformFamily === 'n8n'
              ? { json: data.configAuditYaml || '' }
              : { yaml: data.configAuditYaml || '' }),
            fileName: data.configAuditFileName,
          },
        }
      : {}),
    metadata: {
      ...data.metadata,
      taskKind: data.taskKind,
      ...(overrides.wizardBatchId ? { wizardBatchId: overrides.wizardBatchId } : {}),
      ...(data.taskKind === 'config_audit' || data.taskKind === 'config_static'
        ? {
            configAudit: {
              ...(v4.platformFamily === 'fastgpt' || v4.platformFamily === 'n8n'
                ? { json: data.configAuditYaml || '' }
                : { yaml: data.configAuditYaml || '' }),
              fileName: data.configAuditFileName,
            },
          }
        : {}),
      advancedSettings: data.advancedSettings,
      creationMode: 'configuration',
    },
    ...(data.saveWorkflowConfigAsset ? { saveWorkflowConfigAsset: true } : {}),
  };
}

type Surface =
  | 'all'
  | 'agent'
  | 'coze'
  | 'fastgpt'
  | 'n8n'
  | 'tencent-adp'
  | 'mcp'
  | 'tool'
  | 'platform'
  | 'llm';

interface ConfigurationModeWizardProps {
  surface?: Surface;
  initialAgentId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  /** When true, do not navigate to `/tasks/:taskId` after create (e.g. Coze flow returns to list via onSuccess). */
  skipNavigateToTaskOnSuccess?: boolean;
}

export function ConfigurationModeWizard({
  surface = 'all',
  initialAgentId,
  onSuccess,
  onCancel,
  skipNavigateToTaskOnSuccess = false,
}: ConfigurationModeWizardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [runAfterCreate, setRunAfterCreate] = useState(() => {
    try {
      const v = localStorage.getItem(RUN_AFTER_CREATE_STORAGE_KEY);
      return v === 'true';
    } catch {
      return false;
    }
  });

  const setRunAfterCreatePersist = (value: boolean) => {
    setRunAfterCreate(value);
    try {
      localStorage.setItem(RUN_AFTER_CREATE_STORAGE_KEY, String(value));
    } catch {
      /* ignore */
    }
  };

  const form = useForm<TaskFormData, unknown, TaskFormData>({
    defaultValues: {
      taskKind: 'api_test',
      name: '',
      description: '',
      teamId: undefined,
      configAuditYaml: '',
      configAuditFileName: undefined,
      targetType: surface === 'agent' ? 'agent' : 'agent',
      targetConfig: initialAgentId ? { agentIds: [initialAgentId] } : { agentIds: [] },
      vulnerabilities: [],
      attackMode: 'simple',
      detectionConfig: {
        detectionMode: 'rule',
        useRule: true,
        useLLM: false,
        useKnowledgeBase: false,
      },
      agentConfig: {
        enabled: false,
      },
      advancedSettings: {
        delayMs: EXEC.delayMs.default,
        maxConcurrency: EXEC.maxConcurrency.default,
        timeout: EXEC.timeoutMs.default,
        retryStrategy: {
          maxRetries: EXEC.maxRetries.default,
          retryDelay: EXEC.retryDelayMs.default,
        },
        notifications: {
          onComplete: false,
          onVulnerabilityFound: true,
          onFailure: true,
        },
      },
      saveWorkflowConfigAsset: false,
    },
    mode: 'onChange',
    resolver: zodResolverV4(taskFormSchema),
  });

  const taskKind = form.watch('taskKind');
  const steps = useMemo(() => getWizardSteps(taskKind), [taskKind]);
  const configYamlSurface =
    surface === 'coze'
      ? ('coze' as const)
      : surface === 'fastgpt'
        ? ('fastgpt' as const)
        : surface === 'n8n'
          ? ('n8n' as const)
          : ('dify' as const);
  const stepperLabels = useMemo(
    () => steps.map((k) => wizardStepTitle(k, { configYamlSurface, t })),
    [steps, configYamlSurface, t],
  );

  useEffect(() => {
    setCurrentStep(0);
  }, [taskKind]);

  const { data: taskTypes = [], isFetched: taskTypesFetched } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => tasksApi.listTaskTypes(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (taskKind === 'api_test') {
      form.setValue('detectionConfig.useRule', false);
      form.setValue('detectionConfig.useLLM', true);
      form.setValue('detectionConfig.detectionMode', 'llm');
    } else {
      form.setValue('detectionConfig.useRule', true);
      form.setValue('detectionConfig.useLLM', false);
      form.setValue('detectionConfig.detectionMode', 'rule');
      form.setValue('detectionConfig.useKnowledgeBase', false);
    }
  }, [taskKind, form]);

  useEffect(() => {
    if (!initialAgentId) {
      return;
    }
    form.setValue('targetType', 'agent', {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
    form.setValue('targetConfig.agentIds', [initialAgentId], {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [form, initialAgentId]);

  useEffect(() => {
    if (
      surface === 'coze' ||
      surface === 'fastgpt' ||
      surface === 'n8n' ||
      surface === 'tencent-adp' ||
      surface === 'agent'
    ) {
      form.setValue('targetType', 'agent', {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }
  }, [surface, form]);

  const createMutation = useMutation({
    mutationFn: async ({
      data,
      runAfterCreate: shouldRun,
    }: {
      data: TaskFormData;
      runAfterCreate: boolean;
    }) => {
      if (!taskTypesFetched) {
        throw new Error(t('pages.tasks.createWizard.errorTaskTypesLoading'));
      }
      const expectedTaskTypeCode =
        data.taskKind === 'config_audit'
          ? 'dify_config_audit'
          : data.taskKind === 'config_static'
            ? 'dify_config_static'
            : 'dify_api_scan';
      const resolvedTaskTypeId = taskTypes.find((t) => t.code === expectedTaskTypeCode)?.id;
      if (taskTypes.length > 0 && !resolvedTaskTypeId) {
        throw new Error(
          t('pages.tasks.createWizard.errorTaskTypeMissing', { code: expectedTaskTypeCode }),
        );
      }

      const agentsRespAll = await agentsApi.list({ limit: 200 });
      const agentRowsAll = agentsRespAll.data ?? [];
      const idToName = new Map(agentRowsAll.map((a) => [a.id, a.name]));
      const idToType = new Map(agentRowsAll.map((a) => [a.id, a.type]));

      const tc = data.targetConfig as Record<string, unknown>;
      const registeredIds = getRegisteredAgentIdsFromTargetConfig(tc);
      const baseTc = sanitizeTargetConfigForApi(tc);
      const trimName = data.name.trim();

      const wizardBatchId =
        data.targetType === 'agent' && registeredIds.length > 1
          ? (globalThis.crypto?.randomUUID?.() ??
            `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          : undefined;

      type CreateOutcome = {
        task: AttackTask;
        runStartedSuccessfully: boolean;
        runErrorMessage?: string;
      };

      const buildRunConfigAuditPayload = (
        pf?: 'dify' | 'coze' | 'fastgpt' | 'n8n' | 'tencent-adp',
      ): { yaml?: string; json?: string; fileName?: string } | undefined => {
        if (data.taskKind !== 'config_audit' && data.taskKind !== 'config_static') {
          return undefined;
        }
        const text = String(data.configAuditYaml || '').trim();
        if (!text) {
          return undefined;
        }
        const defaultFamily =
          surface === 'coze'
            ? ('coze' as const)
            : surface === 'fastgpt'
              ? ('fastgpt' as const)
              : surface === 'n8n'
                ? ('n8n' as const)
                : surface === 'tencent-adp'
                  ? ('tencent-adp' as const)
                  : ('dify' as const);
        const family = pf ?? defaultFamily;
        return {
          ...(family === 'fastgpt' || family === 'n8n' ? { json: text } : { yaml: text }),
          ...(data.configAuditFileName ? { fileName: data.configAuditFileName } : {}),
        };
      };

      const runTaskSafe = async (
        task: AttackTask,
        platformFamilyForRun?: 'dify' | 'coze' | 'fastgpt' | 'n8n' | 'tencent-adp',
      ): Promise<CreateOutcome> => {
        if (!shouldRun) {
          return { task, runStartedSuccessfully: false };
        }
        try {
          const configAudit = buildRunConfigAuditPayload(platformFamilyForRun);
          await tasksApi.run({
            taskId: task.id,
            ...(configAudit ? { configAudit } : {}),
          });
          return { task, runStartedSuccessfully: true };
        } catch (runErr: unknown) {
          const msg = runErr instanceof Error ? runErr.message : String(runErr);
          return { task, runStartedSuccessfully: false, runErrorMessage: msg };
        }
      };

      if (data.targetType === 'agent' && registeredIds.length > 0) {
        const settled = await Promise.allSettled(
          registeredIds.map(async (agentId) => {
            const displayName = idToName.get(agentId) ?? agentId;
            const taskTitle = registeredIds.length > 1 ? `${trimName} · ${displayName}` : trimName;
            const pf = platformFamilyFromAgentType(idToType.get(agentId));
            const requestData = buildCreateAttackTaskRequest(
              data,
              taskTypes,
              surface,
              {
                name: taskTitle,
                targetConfig: { ...baseTc, agentId },
                ...(wizardBatchId ? { wizardBatchId } : {}),
              },
              pf,
            );
            const task = await tasksApi.create(requestData);
            const ran = await runTaskSafe(task as AttackTask, pf);
            return ran;
          }),
        );

        const successes: CreateOutcome[] = [];
        const failures: { label: string; message: string }[] = [];
        for (let i = 0; i < settled.length; i++) {
          const r = settled[i];
          const label = idToName.get(registeredIds[i]!) ?? registeredIds[i]!;
          if (r.status === 'fulfilled') {
            successes.push(r.value);
            if (shouldRun && !r.value.runStartedSuccessfully && r.value.runErrorMessage) {
              toast.error(
                t('pages.tasks.createWizard.toastRunFailedForAgent', {
                  agent: label,
                  message: r.value.runErrorMessage,
                }),
              );
            }
          } else {
            const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
            failures.push({ label, message: msg });
          }
        }

        if (successes.length === 0) {
          throw new Error(
            failures.map((f) => `${f.label}: ${f.message}`).join('; ') ||
              t('pages.tasks.createWizard.errorAllCreatesFailed'),
          );
        }

        return {
          outcomes: successes,
          failures,
          requestedTargetCount: registeredIds.length,
        };
      }

      let singlePlatformFamily: 'dify' | 'coze' | 'fastgpt' | 'n8n' | 'tencent-adp' | undefined;
      if (data.targetType === 'agent') {
        const aid =
          typeof (baseTc as { agentId?: unknown }).agentId === 'string'
            ? String((baseTc as { agentId: string }).agentId).trim()
            : '';
        if (aid && UUID_RE.test(aid)) {
          singlePlatformFamily = platformFamilyFromAgentType(idToType.get(aid));
        }
      }

      const requestData = buildCreateAttackTaskRequest(
        data,
        taskTypes,
        surface,
        {
          name: trimName,
          targetConfig: baseTc,
        },
        singlePlatformFamily,
      );
      const task = await tasksApi.create(requestData);
      const outcome = await runTaskSafe(
        task as AttackTask,
        (requestData.platformFamily as
          | 'dify'
          | 'coze'
          | 'fastgpt'
          | 'n8n'
          | 'tencent-adp'
          | undefined) ??
          singlePlatformFamily,
      );
      if (shouldRun && !outcome.runStartedSuccessfully && outcome.runErrorMessage) {
        toast.error(
          t('pages.tasks.createWizard.toastRunFailed', { message: outcome.runErrorMessage }),
        );
      }
      return {
        outcomes: [outcome],
        failures: [] as { label: string; message: string }[],
        requestedTargetCount: 1,
      };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      const { outcomes, failures } = result;
      const primary = outcomes[0]!;
      if (variables.data.saveWorkflowConfigAsset) {
        void queryClient.invalidateQueries({ queryKey: ['workflow-config-assets'] });
        const allSaved = outcomes.every((o) => {
          const m = o.task.metadata as Record<string, unknown> | undefined;
          return Boolean(m && typeof m.configAssetId === 'string');
        });
        if (allSaved && outcomes.length > 0) {
          const isDedup = (m: Record<string, unknown> | undefined) =>
            m?.workflowConfigAssetDeduplicated === true ||
            (m?.workflowConfigAssetSave as { deduplicated?: boolean } | undefined)?.deduplicated ===
              true;
          const allDedup = outcomes.every((o) =>
            isDedup(o.task.metadata as Record<string, unknown>),
          );
          const someDedup = outcomes.some((o) =>
            isDedup(o.task.metadata as Record<string, unknown>),
          );
          if (allDedup) {
            toast.success(t('pages.tasks.createWizard.toastWorkflowAssetDeduped'));
          } else if (someDedup) {
            toast.success(t('pages.tasks.createWizard.toastWorkflowAssetSavedSomeDeduped'));
          } else {
            toast.success(t('pages.tasks.createWizard.toastWorkflowAssetSaved'));
          }
        } else {
          const firstBad = outcomes.find((o) => {
            const m = o.task.metadata as Record<string, unknown> | undefined;
            return !(m && typeof m.configAssetId === 'string');
          });
          const meta = firstBad?.task.metadata as Record<string, unknown> | undefined;
          const saveInfo = meta?.workflowConfigAssetSave as
            | { ok?: boolean; message?: string; code?: string }
            | undefined;
          if (saveInfo && saveInfo.ok === false && typeof saveInfo.message === 'string') {
            const detail = [saveInfo.code, saveInfo.message].filter(Boolean).join(' — ');
            toast.error(
              t('pages.tasks.createWizard.toastWorkflowAssetFailed', { message: detail }),
            );
          } else {
            toast.message(t('pages.tasks.createWizard.toastWorkflowAssetSkipped'));
          }
        }
      }
      const okCount = outcomes.length;
      const failCount = failures.length;

      for (const o of outcomes) {
        if (variables.runAfterCreate && o.runStartedSuccessfully) {
          markAttackTaskRunJustStarted(o.task.id);
          queryClient.setQueryData<AttackTask>(['attack-task', o.task.id], (prev) => ({
            ...(prev ?? (o.task as AttackTask)),
            ...(o.task as AttackTask),
            status: 'running',
          }));
        }
      }

      if (failCount > 0) {
        toast.warning(
          t('pages.tasks.createWizard.toastCreatedPartial', { ok: okCount, fail: failCount }),
        );
      } else if (variables.runAfterCreate && outcomes.every((o) => o.runStartedSuccessfully)) {
        toast.success(
          okCount > 1
            ? t('pages.tasks.createWizard.toastCreatedManyRunStarted', { count: okCount })
            : t('pages.tasks.createWizard.toastCreatedRunStarted'),
        );
      } else if (okCount > 1) {
        toast.success(t('pages.tasks.createWizard.toastCreatedMany', { count: okCount }));
      } else {
        toast.success(t('pages.tasks.createWizard.toastCreated'));
      }

      onSuccess?.();

      const goToTaskList = okCount > 1 || result.requestedTargetCount > 1;
      if (!skipNavigateToTaskOnSuccess) {
        if (goToTaskList) {
          navigate({ to: '/tasks', search: { surface: 'all', status: 'all' } });
        } else {
          navigate({ to: `/tasks/${primary.task.id}` });
        }
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(
        t('pages.tasks.createWizard.toastCreateFailed', {
          message: message || 'Unknown error',
        }),
      );
    },
  });

  const validateTargetStep = (): boolean => {
    let targetType = form.getValues('targetType');
    const targetConfig = form.getValues('targetConfig') as EndpointTargetConfig | undefined;
    const registeredIds = getRegisteredAgentIdsFromTargetConfig(targetConfig);

    const validateRegisteredAgentSelection = (): boolean => {
      if (registeredIds.length === 0) {
        form.setError('targetConfig.agentIds', {
          message: t('pages.tasks.createWizard.step2.errorSelectAtLeastOne'),
        });
        return false;
      }
      if (registeredIds.length > MAX_AGENTS_PER_BATCH) {
        form.setError('targetConfig.agentIds', {
          message: t('pages.tasks.createWizard.step2.errorMaxAgents', {
            max: MAX_AGENTS_PER_BATCH,
          }),
        });
        return false;
      }
      form.clearErrors('targetConfig');
      return true;
    };

    if (
      surface === 'agent' ||
      surface === 'coze' ||
      surface === 'fastgpt' ||
      surface === 'n8n' ||
      surface === 'tencent-adp'
    ) {
      if (!targetType) {
        form.setValue('targetType', 'agent');
        targetType = 'agent';
      }
      return validateRegisteredAgentSelection();
    }
    if (!targetType) {
      form.setError('targetType', { message: 'Please select a target type' });
      return false;
    }
    if (targetType === 'agent') {
      const taskKind = form.getValues('taskKind');
      const configFileTask = taskKind === 'config_audit' || taskKind === 'config_static';
      // Config audit/static tasks always use registered agents from the list (surface=all),
      // not manual API URL fields — otherwise validation errors attach to invisible inputs.
      if (configFileTask || registeredIds.length > 0) {
        return validateRegisteredAgentSelection();
      }
      if (targetConfig?.agent?.apiBaseUrl && targetConfig?.agent?.apiKey) {
        try {
          new URL(targetConfig.agent.apiBaseUrl);
          if (targetConfig.agent.apiKey.trim().length > 0) {
            form.clearErrors('targetConfig');
            return true;
          }
          form.setError('targetConfig.agent.apiKey', { message: 'API Key is required' });
          return false;
        } catch {
          form.setError('targetConfig.agent.apiBaseUrl', { message: 'Invalid URL format' });
          return false;
        }
      }
      if (!targetConfig?.agent?.apiBaseUrl) {
        form.setError('targetConfig.agent.apiBaseUrl', { message: 'API Base URL is required' });
      }
      if (!targetConfig?.agent?.apiKey) {
        form.setError('targetConfig.agent.apiKey', { message: 'API Key is required' });
      }
      return false;
    }
    if (targetType === 'mcp') {
      if (targetConfig?.mcp?.serverUrl) {
        const urlPattern = /^(ws|wss):\/\/.+/;
        if (urlPattern.test(targetConfig.mcp.serverUrl)) {
          return true;
        }
        form.setError('targetConfig.mcp.serverUrl', {
          message: 'Invalid WebSocket URL format (must start with ws:// or wss://)',
        });
        return false;
      }
      form.setError('targetConfig.mcp.serverUrl', { message: 'MCP Server URL is required' });
      return false;
    }
    if (targetType === 'llm') {
      if (targetConfig?.llm?.apiUrl && targetConfig?.llm?.apiKey) {
        try {
          new URL(targetConfig.llm.apiUrl);
          if (targetConfig.llm.apiKey.trim().length > 0) {
            return true;
          }
          form.setError('targetConfig.llm.apiKey', { message: 'API Key is required' });
          return false;
        } catch {
          form.setError('targetConfig.llm.apiUrl', { message: 'Invalid URL format' });
          return false;
        }
      }
      if (!targetConfig?.llm?.apiUrl) {
        form.setError('targetConfig.llm.apiUrl', { message: 'API URL is required' });
      }
      if (!targetConfig?.llm?.apiKey) {
        form.setError('targetConfig.llm.apiKey', { message: 'API Key is required' });
      }
      return false;
    }
    if (targetType === 'composite') {
      return true;
    }
    const selectedTargetConfig = targetConfig?.[targetType] as { endpoint?: string } | undefined;
    if (selectedTargetConfig?.endpoint) {
      try {
        new URL(selectedTargetConfig.endpoint);
        return true;
      } catch {
        form.setError(`targetConfig.${targetType}.endpoint`, { message: 'Invalid URL format' });
        return false;
      }
    }
    form.setError(`targetConfig.${targetType}.endpoint`, { message: 'Endpoint URL is required' });
    return false;
  };

  const validateAttackModeStep = (): boolean => {
    form.setValue('attackMode', 'simple');
    form.clearErrors('attackMode');
    form.clearErrors('compositeAttackConfig');
    return true;
  };

  const validateDetectionStep = (): boolean => {
    const tk = form.getValues('taskKind');
    const detectionConfig = form.getValues('detectionConfig');
    if (tk === 'api_test') {
      if (!detectionConfig.llmConfig?.model) {
        form.setError('detectionConfig.llmConfig.model', { message: '请选择 LLM 模型' });
        return false;
      }
      form.clearErrors('detectionConfig');
      return true;
    }
    if (!detectionConfig.useRule && !detectionConfig.useLLM) {
      form.setError('detectionConfig.useRule', {
        message: '请至少选择 Rule Base 或 LLM Base 之一',
      });
      return false;
    }
    if (detectionConfig.useLLM && !detectionConfig.llmConfig?.model) {
      form.setError('detectionConfig.llmConfig.model', { message: 'LLM 模式需要选择模型' });
      return false;
    }
    form.clearErrors('detectionConfig');
    return true;
  };

  const handleNext = async () => {
    const stepKey = steps[currentStep];
    let isValid = false;

    if (stepKey === 'basic') {
      // Force showing validation message for required fields on this step.
      isValid = await form.trigger(['name', 'taskKind'], { shouldFocus: true });
    } else if (stepKey === 'target') {
      isValid = validateTargetStep();
    } else if (stepKey === 'vulns') {
      const vulnerabilities = form.getValues('vulnerabilities');
      if (!vulnerabilities || vulnerabilities.length === 0) {
        form.setError('vulnerabilities', {
          message: t('pages.tasks.createWizard.step3.errorSelectAtLeastOne'),
        });
        isValid = false;
      } else {
        form.clearErrors('vulnerabilities');
        isValid = true;
      }
    } else if (stepKey === 'configYaml') {
      const yaml = form.getValues('configAuditYaml')?.trim();
      if (yaml) {
        form.clearErrors('configAuditYaml');
        isValid = true;
      } else {
        form.setError('configAuditYaml', {
          message:
            surface === 'coze'
              ? '请上传或粘贴 Coze / 应用导出 YAML（结构解析目前与常见应用导出格式兼容，详见说明）'
              : surface === 'fastgpt'
                ? '请上传或粘贴 FastGPT 工作流 / 应用导出 JSON（详见说明）'
                : surface === 'n8n'
                  ? '请上传或粘贴 N8N 工作流导出 JSON（详见说明）'
                  : '请上传或粘贴 Dify 导出 YAML',
        });
        isValid = false;
      }
    } else if (stepKey === 'attackMode') {
      isValid = validateAttackModeStep();
    } else if (stepKey === 'detection') {
      isValid = validateDetectionStep();
    } else if (stepKey === 'agent') {
      const agentConfig = form.getValues('agentConfig');
      if (agentConfig?.enabled) {
        if (agentConfig.model) {
          form.clearErrors('agentConfig');
          isValid = true;
        } else {
          form.setError('agentConfig.model', {
            message: 'Model is required when Agent Driver is enabled',
          });
          isValid = false;
        }
      } else {
        form.clearErrors('agentConfig');
        isValid = true;
      }
    } else if (stepKey === 'advanced') {
      form.clearErrors('advancedSettings');
      isValid = true;
    } else {
      isValid = await form.trigger(getFieldsForStepKey(stepKey) as (keyof TaskFormData)[], {});
    }

    if (isValid) {
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        form.handleSubmit((data) => {
          createMutation.mutate({ data, runAfterCreate });
        })();
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      const stepKey = steps[currentStep];
      getFieldsForStepKey(stepKey).forEach((field) => {
        form.clearErrors(field as any);
      });
      setCurrentStep(currentStep - 1);
    }
  };

  const getFieldsForStepKey = (stepKey: WizardStepKey): (keyof TaskFormData)[] => {
    switch (stepKey) {
      case 'basic':
        return ['name', 'taskKind'];
      case 'target':
        return ['targetType', 'targetConfig'];
      case 'vulns':
        return ['vulnerabilities'];
      case 'configYaml':
        return ['configAuditYaml'];
      case 'attackMode':
        return ['attackMode'];
      case 'detection':
        return ['detectionConfig'];
      case 'agent':
        return ['agentConfig'];
      case 'advanced':
        return ['advancedSettings'];
      case 'review':
        return [];
      default:
        return [];
    }
  };

  const renderStepContent = () => {
    const stepKey = steps[currentStep];
    switch (stepKey) {
      case 'basic':
        return <Step1BasicInfo form={form} surface={surface} />;
      case 'target':
        return <Step2SelectTarget form={form} surface={surface} />;
      case 'vulns':
        return <Step3SelectVulnerabilities form={form} surface={surface} />;
      case 'configYaml':
        return <StepConfigYaml form={form} surface={surface} />;
      case 'attackMode':
        return <Step4AttackMode form={form} />;
      case 'detection':
        return <Step5DetectionConfig form={form} surface={surface} />;
      case 'agent':
        return <Step6AgentConfig form={form} />;
      case 'advanced':
        return <Step7AdvancedSettings form={form} />;
      case 'review':
        return <Step8Review form={form} surface={surface} />;
      default:
        return null;
    }
  };

  return (
    <Form {...form}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {surface === 'coze'
                ? t('pages.tasks.createWizard.cardTitle.coze')
                : surface === 'fastgpt'
                  ? t('pages.tasks.createWizard.cardTitle.fastgpt')
                  : surface === 'n8n'
                    ? t('pages.tasks.createWizard.cardTitle.n8n')
                    : surface === 'tencent-adp'
                      ? '创建腾讯 ADP 安全测试任务'
                      : t('pages.tasks.createWizard.cardTitle.dify')}
            </CardTitle>
            <CardDescription>
              {surface === 'coze'
                ? t('pages.tasks.createWizard.cardDescription.coze')
                : surface === 'fastgpt'
                  ? t('pages.tasks.createWizard.cardDescription.fastgpt')
                  : surface === 'n8n'
                    ? t('pages.tasks.createWizard.cardDescription.n8n')
                    : surface === 'tencent-adp'
                      ? '对腾讯 ADP 智能体进行 API 黑盒安全测试，接入方式（SSE / WebSocket）由目标智能体配置决定。'
                      : t('pages.tasks.createWizard.cardDescription.dify')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Stepper steps={stepperLabels} currentStep={currentStep + 1} />

            <div className="min-h-[400px] py-6">{renderStepContent()}</div>

            <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={currentStep === 0 ? onCancel : handleBack}
                disabled={createMutation.isPending}
                className="w-full sm:w-auto"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                {currentStep === 0
                  ? t('pages.tasks.createWizard.cancel')
                  : t('pages.tasks.createWizard.back')}
              </Button>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
                {currentStep === steps.length - 1 && (
                  <div className="flex items-start gap-2 sm:max-w-[min(100%,22rem)]">
                    <Checkbox
                      id="run-after-create-wizard"
                      checked={runAfterCreate}
                      onCheckedChange={(v) => setRunAfterCreatePersist(v === true)}
                      disabled={createMutation.isPending}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1 leading-snug">
                      <Label
                        htmlFor="run-after-create-wizard"
                        className="cursor-pointer font-medium"
                      >
                        {t('pages.tasks.createWizard.runAfterCreateLabel')}
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        {t('pages.tasks.createWizard.runAfterCreateHint')}
                      </p>
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={createMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {currentStep === steps.length - 1 ? (
                    <>
                      {createMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t('pages.tasks.createWizard.createTask')}
                    </>
                  ) : (
                    <>
                      {t('pages.tasks.createWizard.next')}
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Form>
  );
}
