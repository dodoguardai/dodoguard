import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { readLibraryMeta } from '@/features/compliance-case-library/shared';
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import { cn } from '@/lib/utils';
import { assetIntakeApi } from '@/services/api/asset-intake';
import {
  type CompliancePrecheckApiResult,
  type CompliancePrecheckStep,
  type ComplianceRecommendPlanResult,
  detectionScanningApi,
} from '@/services/api/detection-scanning';
import { buildWizardStateFromTemplate } from './compliance-apply-template';
import {
  buildComplianceTaskRunConfig,
  hasAgentRuntimeEndpoint,
} from './compliance-task-run-config';
import {
  agentDepartment,
  buildCompliancePrecheck,
  buildPrecheckScanItems,
  type ComplianceDomain,
  type CompliancePrecheckResult,
  type CreationMode,
  computeTaskMetrics,
  dataTypeLabel,
  domainStrategy,
  formatAgentOptionLabel,
  resolveLibrariesForMode,
} from './compliance-precheck';
import { readComplianceScanStatus } from './compliance-task-shared';
import {
  ASSESS_SCENARIOS,
  type AssessScenario,
  ComplianceWizardStepper,
  WIZARD_FOOTER_NOTES,
  WIZARD_NEXT_LABELS,
  WizardCheckboxCard,
  WizardModeCard,
  WizardNotice,
  WizardProgressBar,
  WizardScanItem,
  WizardSectionHead,
  WizardStatCard,
  WizardTag,
} from './compliance-wizard-ui';
import type { ComplianceTaskTemplate, SecurityCaseLibrary } from '@/types/entities';

type ComplianceTaskWizardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAssetId?: string;
  initialTemplateId?: string | null;
  editTaskId?: string | null;
};

type ScanItemState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped';

const PORTRAIT_FIELD_LABELS: Record<string, string> = {
  functionIntro: '功能介绍',
  businessScene: '业务场景',
  businessSystem: '业务系统',
  components: '能力组件',
  exposureLevel: '暴露面',
  environment: '运行环境',
  agentType: 'Agent 类型',
  platformFamily: '平台类型',
  tags: '标签',
  sensitiveData: '敏感数据标识',
};

function formatMissingPortraitFields(fields: string[]): string {
  return fields
    .map((field) => PORTRAIT_FIELD_LABELS[field] || field)
    .filter(Boolean)
    .join('、');
}

function mapPrecheckApiResult(data: CompliancePrecheckApiResult): CompliancePrecheckResult {
  return {
    agent: data.agent,
    recommendedDomain: data.recommendedDomain as ComplianceDomain,
    triggers: data.triggers ?? [],
    recommendedLibraries: data.recommendedLibraries ?? [],
    applicableLaws: data.applicableLaws ?? [],
    warnings: data.warnings ?? [],
    estimatedCaseCount: data.estimatedCaseCount ?? 0,
  };
}

function mapStepUiStatus(status: CompliancePrecheckStep['status']): ScanItemState {
  if (status === 'failed') {
    return 'failed';
  }
  if (status === 'skipped') {
    return 'skipped';
  }
  return 'done';
}

export function ComplianceTaskWizardDialog({
  open,
  onOpenChange,
  initialAssetId,
  initialTemplateId,
  editTaskId,
}: ComplianceTaskWizardDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [taskNameCustomized, setTaskNameCustomized] = useState(false);
  const [taskDesc, setTaskDesc] = useState(
    '本次评估覆盖个人信息保护、金融合规、数据安全和高风险操作确认。违规项将生成合规评估报告，并支持推送到风险闭环数据库。',
  );
  const [domainOverride, setDomainOverride] = useState<ComplianceDomain | ''>('');
  const [precheck, setPrecheck] = useState<CompliancePrecheckResult | null>(null);
  const [precheckApiStatus, setPrecheckApiStatus] = useState<
    'passed' | 'failed' | 'skipped' | null
  >(null);
  const [precheckDone, setPrecheckDone] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanItems, setScanItems] = useState<ScanItemState[]>([]);
  const [precheckSteps, setPrecheckSteps] = useState<CompliancePrecheckStep[]>([]);
  const [creationMode, setCreationMode] = useState<CreationMode>('ai');
  const [assessScenario, setAssessScenario] = useState<AssessScenario>('launch');
  const [aiGenDone, setAiGenDone] = useState(false);
  const [aiGenProgress, setAiGenProgress] = useState(0);
  const [recommendPlan, setRecommendPlan] = useState<ComplianceRecommendPlanResult | null>(
    null,
  );
  const [selectedLibIds, setSelectedLibIds] = useState<string[]>([]);
  const [libSearch, setLibSearch] = useState('');
  const [libFilter, setLibFilter] = useState<'all' | 'recommended' | 'selected' | 'unselected'>(
    'all',
  );
  const [appliedTemplate, setAppliedTemplate] = useState<ComplianceTaskTemplate | null>(null);
  const [editCopyMode, setEditCopyMode] = useState(false);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const precheckStartedRef = useRef(false);
  const ignorePrecheckResultRef = useRef(false);
  const aiGenStartedRef = useRef(false);
  const prevOpenRef = useRef(open);

  const agentsQuery = useQuery({
    queryKey: ['compliance-wizard-agents'],
    queryFn: () => assetIntakeApi.listAgents({ limit: 100 }),
    enabled: open,
  });

  const librariesQuery = useQuery({
    queryKey: ['compliance-wizard-libraries'],
    queryFn: () => detectionScanningApi.listAllCaseLibraries({ category: 'compliance' }),
    enabled: open,
  });

  const { modelOptions } = useLlmModelOptions({ enabled: open });

  const agents = useMemo(
    () => (agentsQuery.data?.data ?? []).filter(Boolean),
    [agentsQuery.data?.data],
  );
  const libraries = useMemo(
    () => (librariesQuery.data?.data ?? []).filter(Boolean),
    [librariesQuery.data?.data],
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAssetId),
    [agents, selectedAssetId],
  );

  const recommendedLibIds = useMemo(() => {
    if (recommendPlan?.include.length) {
      return new Set(recommendPlan.include.map((item) => item.libraryId));
    }
    return new Set(precheck?.recommendedLibraries.map((lib) => lib.id) || []);
  }, [recommendPlan, precheck]);

  const activeDomain = (domainOverride ||
    recommendPlan?.recommendedDomain ||
    precheck?.recommendedDomain ||
    '通用合规') as ComplianceDomain;
  const strategy = domainStrategy(activeDomain);
  const scenarioLabel =
    ASSESS_SCENARIOS.find((item) => item.value === assessScenario)?.label || '上线前准入';

  const metrics = useMemo(() => {
    const laws = precheck?.applicableLaws || [];
    return computeTaskMetrics(libraries, selectedLibIds, laws);
  }, [libraries, selectedLibIds, precheck?.applicableLaws]);

  const resetWizard = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
    }
    setStep(1);
    setSelectedAssetId(initialAssetId || '');
    setTaskName('');
    setTaskNameCustomized(false);
    setDomainOverride('');
    setPrecheck(null);
    setPrecheckApiStatus(null);
    setPrecheckDone(false);
    setScanProgress(0);
    setScanItems([]);
    setPrecheckSteps([]);
    precheckStartedRef.current = false;
    ignorePrecheckResultRef.current = false;
    aiGenStartedRef.current = false;
    setCreationMode('ai');
    setAssessScenario('launch');
    setAiGenDone(false);
    setAiGenProgress(0);
    setRecommendPlan(null);
    setSelectedLibIds([]);
    setLibSearch('');
    setLibFilter('all');
    setAppliedTemplate(null);
    setEditCopyMode(false);
    setTaskDesc(
      '本次评估覆盖个人信息保护、金融合规、数据安全和高风险操作确认。违规项将生成合规评估报告，并支持推送到风险闭环数据库。',
    );
  }, [initialAssetId]);

  const applyTemplate = useCallback(
    (template: ComplianceTaskTemplate) => {
      const state = buildWizardStateFromTemplate(template, libraries);
      setAppliedTemplate(template);
      setDomainOverride(state.domainOverride);
      setTaskDesc(state.taskDesc || template.description || '');
      setCreationMode(state.creationMode);
      setAssessScenario(state.assessScenario);
      setSelectedLibIds(state.selectedLibIds);
      if (state.creationMode === 'manual') {
        setAiGenDone(true);
        setAiGenProgress(100);
      }
    },
    [libraries],
  );

  const clearAppliedTemplate = useCallback(() => {
    setAppliedTemplate(null);
    setDomainOverride('');
    setCreationMode('ai');
    setAssessScenario('launch');
    setSelectedLibIds([]);
    setAiGenDone(false);
    setAiGenProgress(0);
    setTaskDesc(
      '本次评估覆盖个人信息保护、金融合规、数据安全和高风险操作确认。违规项将生成合规评估报告，并支持推送到风险闭环数据库。',
    );
  }, []);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen && !open) {
      resetWizard();
    }
  }, [open, resetWizard]);

  useEffect(() => {
    if (!open || editTaskId || !initialTemplateId || libraries.length === 0) {
      return;
    }
    let cancelled = false;
    void detectionScanningApi.getComplianceTaskTemplate(initialTemplateId).then((template) => {
      if (cancelled) {
        return;
      }
      applyTemplate(template);
    });
    return () => {
      cancelled = true;
    };
  }, [open, initialTemplateId, editTaskId, libraries.length, applyTemplate]);

  useEffect(() => {
    if (!open || !editTaskId || agents.length === 0) {
      return;
    }
    let cancelled = false;
    void detectionScanningApi.getTask(editTaskId).then((task) => {
      if (cancelled) {
        return;
      }
      const metadata = task.metadata ?? {};
      const taskStatus = readComplianceScanStatus(task);
      setEditCopyMode(taskStatus === 'completed');
      setSelectedAssetId(task.assetId ?? '');
      setTaskName(task.name);
      setTaskNameCustomized(true);
      if (typeof metadata.taskDescription === 'string' && metadata.taskDescription.trim()) {
        setTaskDesc(metadata.taskDescription);
      }
      if (typeof metadata.domain === 'string' && metadata.domain.trim()) {
        setDomainOverride(metadata.domain as ComplianceDomain);
      }
      if (metadata.creationMode === 'ai' || metadata.creationMode === 'manual') {
        setCreationMode(metadata.creationMode);
      }
      if (
        metadata.assessScenario === 'launch' ||
        metadata.assessScenario === 'regression' ||
        metadata.assessScenario === 'patrol'
      ) {
        setAssessScenario(metadata.assessScenario);
      }
      const libIds = task.plans?.flatMap((plan) => plan.libIds ?? []) ?? [];
      setSelectedLibIds([...new Set(libIds.filter(Boolean))]);
      setAiGenDone(true);
      setAiGenProgress(100);
      setPrecheckDone(true);
      const agent = agents.find((item) => item.id === task.assetId);
      if (agent) {
        setPrecheck({
          agent: {
            name: agent.name,
            department: agentDepartment(agent),
            scene: agent.businessScene || '—',
            sensitiveData: Boolean(agent.sensitiveData),
            exposureLevel: agent.exposureLevel || '—',
            dataTypeLabel: dataTypeLabel(agent),
          },
          recommendedDomain: (metadata.domain as ComplianceDomain) || '通用合规',
          triggers: [],
          recommendedLibraries: libraries
            .filter((lib) => libIds.includes(lib.id))
            .map((lib) => ({
              id: lib.id,
              title: lib.title,
              domain: lib.domain,
              caseCount: lib.caseCount,
              enabled: lib.enabled,
            })),
          applicableLaws: [],
          warnings: [],
          estimatedCaseCount: task.plans?.[0]?.caseCount ?? 0,
        });
      }
      setStep(5);
    });
    return () => {
      cancelled = true;
    };
  }, [open, editTaskId, agents.length, libraries.length]);

  useEffect(() => {
    if (open && initialAssetId && agents.length) {
      setSelectedAssetId(initialAssetId);
    }
  }, [open, initialAssetId, agents.length]);

  useEffect(() => {
    if (!selectedAgent) {
      return;
    }
    const generatedTaskName = appliedTemplate
      ? `${selectedAgent.name} · ${appliedTemplate.name}`
      : `${selectedAgent.name}合规评估`;
    setTaskName((current) => {
      if (!current || !taskNameCustomized) {
        return generatedTaskName;
      }
      return current;
    });
  }, [selectedAgent, appliedTemplate, taskNameCustomized]);

  const revealPrecheckSteps = useCallback(
    (data: CompliancePrecheckApiResult) => {
      const steps = (data.steps ?? []).filter((step): step is CompliancePrecheckStep =>
        Boolean(step?.key && step?.title),
      );
      if (steps.length === 0) {
        setPrecheck(mapPrecheckApiResult(data));
        setPrecheckApiStatus(data.apiStatus ?? 'skipped');
        setPrecheckDone(true);
        setScanProgress(100);
        setScanItems([]);
        setPrecheckSteps([]);
        if (creationMode === 'ai') {
          setSelectedLibIds((data.recommendedLibraries ?? []).map((lib) => lib.id).filter(Boolean));
        }
        return;
      }

      setPrecheckSteps(steps);
      setScanItems(steps.map(() => 'waiting'));
      setScanProgress(0);
      let index = 0;
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
      }
      scanTimerRef.current = setInterval(() => {
        setScanItems((current) => {
          const next = [...current];
          if (index > 0) {
            const previous = steps[index - 1];
            if (previous) {
              next[index - 1] = mapStepUiStatus(previous.status ?? 'done');
            }
          }
          if (index < steps.length) {
            next[index] = 'running';
          }
          return next;
        });
        setScanProgress(Math.round(((index + 1) / Math.max(steps.length, 1)) * 100));
        index += 1;
        if (index > steps.length) {
          if (scanTimerRef.current) {
            clearInterval(scanTimerRef.current);
          }
          setScanItems(steps.map((item) => mapStepUiStatus(item.status ?? 'done')));
          setScanProgress(100);
          setPrecheck(mapPrecheckApiResult(data));
          setPrecheckApiStatus(data.apiStatus ?? 'skipped');
          setPrecheckDone(true);
          if (creationMode === 'ai') {
            setSelectedLibIds(
              (data.recommendedLibraries ?? []).map((lib) => lib.id).filter(Boolean),
            );
          }
        }
      }, 420);
    },
    [creationMode],
  );

  const runLocalPrecheckFallback = useCallback(
    (reason: string) => {
      if (!selectedAgent) {
        return;
      }
      const local = buildCompliancePrecheck(
        selectedAgent,
        libraries,
        [],
        domainOverride || undefined,
      );
      revealPrecheckSteps({
        steps: buildPrecheckScanItems(selectedAgent).map((item, index) => ({
          key: `local-${index}`,
          title: item.title,
          description: item.description,
          status: index === 0 ? 'skipped' : 'done',
        })),
        apiStatus: 'skipped',
        apiMessage: reason,
        agent: local.agent,
        recommendedDomain: local.recommendedDomain,
        triggers: local.triggers,
        recommendedLibraries: local.recommendedLibraries,
        applicableLaws: local.applicableLaws,
        warnings: local.warnings.includes(reason)
          ? local.warnings
          : [reason, ...local.warnings],
        estimatedCaseCount: local.estimatedCaseCount,
        identifiedScenes: [],
        identifiedDataTypes: [],
        matchedDomains: [],
      });
    },
    [selectedAgent, libraries, domainOverride, revealPrecheckSteps],
  );

  const precheckMutation = useMutation({
    mutationFn: () =>
      detectionScanningApi.runCompliancePrecheck({
        assetId: selectedAgent!.id,
        domainOverride: domainOverride || undefined,
      }),
    onSuccess: (data) => {
      if (ignorePrecheckResultRef.current) {
        return;
      }
      revealPrecheckSteps(data);
    },
    onError: (error: Error) => {
      if (ignorePrecheckResultRef.current) {
        return;
      }
      toast.error(error.message || '合规预检失败');
      setPrecheckDone(false);
      setScanItems([]);
      setPrecheckSteps([]);
      precheckStartedRef.current = false;
    },
  });

  const handleSkipApiPrecheck = useCallback(() => {
    ignorePrecheckResultRef.current = true;
    precheckMutation.reset();
    runLocalPrecheckFallback('已跳过 Agent API 连通性检测');
    precheckStartedRef.current = true;
  }, [precheckMutation, runLocalPrecheckFallback]);

  useEffect(() => {
    if (step !== 2 || !selectedAgent || precheckStartedRef.current) {
      return;
    }
    precheckStartedRef.current = true;
    const placeholders = buildPrecheckScanItems(selectedAgent);
    setPrecheckSteps(
      placeholders.map((item, index) => ({
        key: `pending-${index}`,
        title: item.title,
        description: item.description,
        status: 'done',
      })),
    );
    setScanItems(placeholders.map((_, index) => (index === 0 ? 'running' : 'waiting')));
    setPrecheckDone(false);
    setPrecheck(null);
    setPrecheckApiStatus(null);
    precheckMutation.mutate();
  }, [step, selectedAgent, precheckMutation.mutate]);

  useEffect(() => {
    if (step !== 4) {
      aiGenStartedRef.current = false;
      return;
    }
    if (creationMode === 'manual') {
      setAiGenDone(true);
      setRecommendPlan(null);
      return;
    }
    if (!selectedAgent || !precheck || aiGenDone || aiGenStartedRef.current) {
      return;
    }
    aiGenStartedRef.current = true;
    setAiGenProgress(8);
    setRecommendPlan(null);
    let cancelled = false;
    let progress = 8;
    const tick = setInterval(() => {
      progress = Math.min(progress + 7, 90);
      setAiGenProgress(progress);
    }, 400);

    void detectionScanningApi
      .recommendCompliancePlan({
        assetId: selectedAgent.id,
        domainOverride: domainOverride || undefined,
        candidateLibraryIds: libraries.filter((lib) => lib.enabled).map((lib) => lib.id),
      })
      .then((plan) => {
        if (cancelled) {
          return;
        }
        setRecommendPlan(plan);
        setSelectedLibIds(plan.include.map((item) => item.libraryId));
        setPrecheck((current) =>
          current
            ? {
                ...current,
                recommendedDomain: (plan.recommendedDomain ||
                  current.recommendedDomain) as ComplianceDomain,
                recommendedLibraries: plan.include.map((item) => ({
                  id: item.libraryId,
                  title: item.title,
                  domain: item.domain,
                  caseCount: item.caseCount,
                  enabled: true,
                })),
                estimatedCaseCount: plan.estimatedCaseCount,
              }
            : current,
        );
        setAiGenProgress(100);
        setAiGenDone(true);
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }
        toast.error(error.message || 'AI 推荐失败，已回退规则推荐');
        const nextIds = resolveLibrariesForMode('ai', precheck);
        const includeLibs = libraries.filter(
          (library) => library.enabled && nextIds.includes(library.id),
        );
        const excludeLibs = libraries.filter(
          (library) => library.enabled && !nextIds.includes(library.id),
        );
        setRecommendPlan({
          source: 'rules',
          confidence: 0.4,
          recommendedDomain: precheck.recommendedDomain,
          include: includeLibs.map((library) => ({
            libraryId: library.id,
            title: library.title,
            domain: library.domain,
            caseCount: library.caseCount,
            reason: '客户端规则兜底',
          })),
          exclude: excludeLibs.map((library) => ({
            libraryId: library.id,
            title: library.title,
            domain: library.domain,
            caseCount: library.caseCount,
            reason: '未纳入本次推荐',
          })),
          estimatedCaseCount: includeLibs.reduce((sum, library) => sum + library.caseCount, 0),
          missingPortraitFields: [],
          rationaleSummary: '接口调用失败，已使用本地规则推荐。',
        });
        setSelectedLibIds(nextIds);
        setAiGenProgress(100);
        setAiGenDone(true);
      })
      .finally(() => {
        clearInterval(tick);
      });

    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [
    step,
    creationMode,
    precheck,
    aiGenDone,
    selectedAgent,
    domainOverride,
    libraries,
  ]);

  const filteredLibraries = useMemo(() => {
    const kw = libSearch.trim().toLowerCase();
    return libraries.filter((lib) => {
      if (!lib.enabled) {
        return false;
      }
      const meta = readLibraryMeta(lib.metadata);
      const haystack = [lib.title, lib.domain, lib.description, meta.tag, meta.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (kw && !haystack.includes(kw)) {
        return false;
      }
      const selected = selectedLibIds.includes(lib.id);
      const recommended = recommendedLibIds.has(lib.id);
      if (libFilter === 'selected' && !selected) {
        return false;
      }
      if (libFilter === 'unselected' && selected) {
        return false;
      }
      if (libFilter === 'recommended' && !recommended) {
        return false;
      }
      return true;
    });
  }, [libraries, libSearch, libFilter, selectedLibIds, recommendedLibIds]);

  const librariesByDomain = useMemo(() => {
    const groups = new Map<string, SecurityCaseLibrary[]>();
    for (const lib of filteredLibraries) {
      const list = groups.get(lib.domain) || [];
      list.push(lib);
      groups.set(lib.domain, list);
    }
    return groups;
  }, [filteredLibraries]);

  const buildTaskPayload = useCallback(() => {
    if (!selectedAgent || !precheck) {
      throw new Error('缺少 Agent 或预检结果');
    }
    if (selectedLibIds.length === 0) {
      throw new Error('请至少选择一个合规库');
    }
    if (!hasAgentRuntimeEndpoint(selectedAgent)) {
      throw new Error('该 Agent 未配置 API 接入信息，请先在资产入库补充 runtimeConfig');
    }
    const runConfig = buildComplianceTaskRunConfig({
      asset: selectedAgent,
      modelOptions,
      selectedLibraryIds: selectedLibIds,
    });
    if (!runConfig.judgeConfig?.providerId) {
      throw new Error('未配置可用的审查模型，请先在设置 → 模型设置中添加并启用 LLM 集成');
    }
    const ownerName =
      selectedAgent.owners?.find((owner) => owner.isPrimary)?.ownerName || '安全负责人';
    return {
      assetId: selectedAgent.id,
      name: taskName.trim(),
      source: editTaskId
        ? editCopyMode
          ? '任务复制'
          : '合规任务编辑'
        : appliedTemplate
          ? '合规任务模版'
          : '合规任务向导',
      scanType: '合规检测',
      targetKind: 'agent_compliance',
      targetSummary: '准入、数据、权限和审计配置',
      ownerName,
      templateId: appliedTemplate?.id,
      runConfig,
      metadata: {
        source: appliedTemplate ? 'compliance_template' : 'compliance_wizard',
        creationMode,
        domain: activeDomain,
        assessScenario,
        taskDescription: taskDesc,
        templateId: appliedTemplate?.id,
        templateName: appliedTemplate?.name,
        selectedLibraryIds: selectedLibIds,
        judgeConfig: runConfig.judgeConfig
          ? {
              providerId: runConfig.judgeConfig.providerId,
              label: runConfig.judgeConfig.label,
            }
          : undefined,
        precheck: {
          triggers: precheck.triggers,
          applicableLaws: precheck.applicableLaws,
          warnings: precheck.warnings,
        },
        recommendSource: recommendPlan?.source,
        recommendConfidence: recommendPlan?.confidence,
        recommendPlan: recommendPlan
          ? {
              include: recommendPlan.include,
              exclude: recommendPlan.exclude,
              rationaleSummary: recommendPlan.rationaleSummary,
              recommendedDomain: recommendPlan.recommendedDomain,
              missingPortraitFields: recommendPlan.missingPortraitFields,
            }
          : undefined,
      },
      plans: [
        {
          probeType: 'compliance_policy_review',
          strategy,
          enabled: true,
          libIds: selectedLibIds,
          caseCount: metrics.cases,
          targets: [
            {
              kind: 'agent',
              id: selectedAgent.id,
              name: selectedAgent.name,
              code: selectedAgent.assetCode,
            },
          ],
        },
      ],
    };
  }, [
    selectedAgent,
    precheck,
    selectedLibIds,
    editTaskId,
    editCopyMode,
    appliedTemplate,
    taskName,
    creationMode,
    activeDomain,
    assessScenario,
    taskDesc,
    strategy,
    metrics.cases,
    modelOptions,
    recommendPlan,
  ]);

  const executeTaskInBackground = useCallback(
    (taskId: string) => {
      void detectionScanningApi
        .executeTask(taskId, {
          mode: 'manual',
          generateFindings: true,
        })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['compliance-scan-tasks'] });
          queryClient.invalidateQueries({ queryKey: ['security-remediations'] });
          queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] });
          toast.success('合规检测已完成，可在任务详情中确认后推送到风险闭环');
        })
        .catch((error: Error) => {
          queryClient.invalidateQueries({ queryKey: ['compliance-scan-tasks'] });
          toast.error(error.message || '任务执行失败');
        });
    },
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: async (executeAfterCreate: boolean) => {
      const payload = buildTaskPayload();
      let task;
      if (editTaskId && !editCopyMode) {
        task = await detectionScanningApi.updateTask(editTaskId, payload);
      } else {
        task = await detectionScanningApi.createTask(payload);
      }
      return { task, executeAfterCreate };
    },
    onSuccess: ({ task, executeAfterCreate }) => {
      queryClient.invalidateQueries({ queryKey: ['compliance-scan-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-task-templates'] });
      queryClient.invalidateQueries({ queryKey: ['security-remediations'] });
      queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] });
      if (editTaskId) {
        queryClient.invalidateQueries({ queryKey: ['compliance-task', editTaskId] });
      }
      if (editTaskId && !editCopyMode) {
        toast.success(executeAfterCreate ? '合规任务已更新，正在后台执行' : '合规任务已更新');
      } else if (editTaskId && editCopyMode) {
        toast.success(
          executeAfterCreate ? '已创建任务副本，正在后台执行' : '已基于已完成任务创建副本',
        );
      } else {
        toast.success(executeAfterCreate ? '合规任务已创建，正在后台执行' : '合规任务草稿已保存');
      }
      onOpenChange(false);
      if (executeAfterCreate) {
        executeTaskInBackground(task.id);
      }
    },
    onError: (error: Error) =>
      toast.error(error.message || (editTaskId ? '更新任务失败' : '创建任务失败')),
  });

  const canProceedStep1 = Boolean(selectedAssetId && taskName.trim());

  const handleNext = () => {
    if (step === 1) {
      if (!canProceedStep1) {
        toast.error('请选择 Agent 并填写任务名称');
        return;
      }
      setPrecheck(null);
      setPrecheckApiStatus(null);
      setPrecheckDone(false);
      setScanItems([]);
      setScanProgress(0);
      setPrecheckSteps([]);
      ignorePrecheckResultRef.current = false;
      precheckStartedRef.current = false;
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!precheckDone) {
        toast.error('预检进行中，请稍候');
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      setAiGenDone(false);
      setAiGenProgress(0);
      setStep(4);
      return;
    }
    if (step === 4) {
      if (creationMode === 'ai' && !aiGenDone) {
        toast.error('AI 正在生成任务方案，请稍候');
        return;
      }
      setStep(5);
      return;
    }
    if (step === 5) {
      if (selectedLibIds.length === 0) {
        toast.error('请至少选择一个合规库');
        return;
      }
      setStep(6);
      return;
    }
    if (step === 6) {
      createMutation.mutate(true);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      if (step === 2 && scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
      }
      if (step === 4) {
        aiGenStartedRef.current = false;
      }
      setStep((current) => current - 1);
    }
  };

  const toggleLibrary = (libId: string, checked: boolean) => {
    setSelectedLibIds((current) =>
      checked ? [...new Set([...current, libId])] : current.filter((id) => id !== libId),
    );
  };

  const renderStepContent = () => {
    if (step === 1) {
      return (
        <div className="grid gap-4">
          {appliedTemplate ? (
            <div className="rounded-[16px] border border-violet-200 bg-violet-50/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {appliedTemplate.icon ? (
                      <span className="text-lg">{appliedTemplate.icon}</span>
                    ) : null}
                    <span className="text-sm font-black">{appliedTemplate.name}</span>
                    <WizardTag tone="purple">{appliedTemplate.domain}</WizardTag>
                    <WizardTag tone="blue">{`${appliedTemplate.libCount} 控制库`}</WizardTag>
                    <WizardTag tone="gray">{`${appliedTemplate.caseCount} 控制项`}</WizardTag>
                    <WizardTag tone="green">{`使用 ${appliedTemplate.usageCount} 次`}</WizardTag>
                  </div>
                  {appliedTemplate.description ? (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {appliedTemplate.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    范围：{appliedTemplate.scope || '—'}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={clearAppliedTemplate}>
                  清除模版
                </Button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <section>
              <WizardSectionHead
                title="选择评估对象"
                hint="选择 Agent 后进入合规预检"
                description="选择需要进行合规评估的 Agent。系统将自动识别业务场景、数据类型、适用法规与可执行检测用例。"
              />
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[13px] font-extrabold">选择智能体</Label>
                  <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
                    <SelectTrigger className="h-11 rounded-[14px]">
                      <SelectValue placeholder="请选择需要评估的 Agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {formatAgentOptionLabel(agent)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-extrabold">评估任务名称</Label>
                  <Input
                    className="h-11 rounded-[14px]"
                    value={taskName}
                    onChange={(event) => {
                      setTaskNameCustomized(true);
                      setTaskName(event.target.value);
                    }}
                    placeholder="系统将根据 Agent 自动生成任务名称"
                  />
                </div>
                <WizardNotice variant="gray">
                  <strong>推荐流程：</strong> 选择 Agent → 合规预检 → 创建方式 → 任务生成 →
                  任务计划选库 → 确认执行。
                </WizardNotice>
              </div>
            </section>
            <section>
              <WizardSectionHead title="任务创建逻辑" />
              <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                本流程面向合规与安全人员：按 Agent
                画像映射法规条款，从合规控制库匹配检测用例并生成评估任务。
              </p>
              <WizardNotice variant="gray" className="mb-4">
                <strong>正确关系：</strong>
                <br />
                Agent 合规预检 → 选择 AI/手动模式 → 任务生成 → 在「任务计划」确认合规库 → 执行评估。
              </WizardNotice>
              <div className="grid grid-cols-2 gap-2.5">
                <WizardStatCard value="6 类" label="合规域" hint="金融、个人信息、数据安全等" />
                <WizardStatCard value="41+" label="检测用例" hint="单轮、多轮、文件审查等" />
                <WizardStatCard value="2 种" label="创建方式" hint="AI 推荐 / 手动选库" />
                <WizardStatCard value="6 步" label="向导流程" hint="与技评任务创建一致" />
              </div>
            </section>
          </div>
        </div>
      );
    }

    if (step === 2) {
      const scanList =
        precheckSteps.length > 0
          ? precheckSteps
          : buildPrecheckScanItems(selectedAgent!).map((item, index) => ({
              key: `fallback-${index}`,
              title: item.title,
              description: item.description,
              status: 'done' as const,
            }));
      const apiStatusLabel = precheckMutation.isPending
        ? '检测中'
        : precheckDone
          ? precheckApiStatus === 'passed'
            ? '通过'
            : precheckApiStatus === 'failed'
              ? '失败'
              : precheckApiStatus === 'skipped'
                ? '跳过'
                : '未配置'
          : '-';
      return (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="rounded-[20px] border border-primary/15 bg-gradient-to-br from-slate-50 via-blue-50/35 to-background p-5 shadow-sm dark:from-muted/40 dark:via-blue-950/15 dark:to-background">
            <div className="mb-4">
              <div className="text-xl font-black text-foreground">正在进行 Agent 合规预检</div>
              <p className="mt-2 text-sm text-muted-foreground">
                识别 API、业务场景、数据类型、适用合规类别、法规条款和可执行用例。
              </p>
              <div className="mt-4">
                <WizardProgressBar value={scanProgress} />
              </div>
            </div>
            <div className="grid gap-2">
              {scanList.map((item, index) => (
                <WizardScanItem
                  key={item.key}
                  index={index + 1}
                  title={item.title}
                  description={item.description}
                  status={scanItems[index] || 'waiting'}
                />
              ))}
            </div>
          </div>
          <div className="rounded-[20px] border bg-white p-5 shadow-sm">
            <div className="mb-4 text-lg font-black">预检结果</div>
            <div className="grid grid-cols-2 gap-2.5">
              <WizardStatCard value={apiStatusLabel} label="API 状态" hint="联通后才能执行检测" />
              <WizardStatCard
                value={precheckDone ? String(metrics.laws) : '-'}
                label="法规映射"
                hint="条款关联"
              />
              <WizardStatCard
                value={precheckDone ? String(precheck?.recommendedLibraries.length || 0) : '-'}
                label="推荐合规库"
                hint="按分类命中"
              />
              <WizardStatCard
                value={precheckDone ? String(precheck?.estimatedCaseCount || 0) : '-'}
                label="推荐用例"
                hint="来自合规库"
              />
            </div>
            <div className="my-4 h-px bg-border" />
            <WizardNotice variant={precheckDone ? 'blue' : 'gray'}>
              {precheckDone && precheck ? (
                <>
                  预检完成：推荐 {precheck.recommendedDomain} 等相关合规库，共{' '}
                  <strong>{precheck.estimatedCaseCount} 条检测用例</strong>。
                </>
              ) : (
                '正在进行合规预检。'
              )}
            </WizardNotice>
          </div>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <WizardModeCard
              title="AI 模式"
              description="由 AI 根据 Agent 画像、业务场景与法规映射自动推荐合规库与控制项。"
              selected={creationMode === 'ai'}
              onClick={() => setCreationMode('ai')}
              tags={[
                { label: '推荐合规库', tone: 'blue' },
                { label: '自动选用例', tone: 'green' },
                { label: '动态估算', tone: 'orange' },
              ]}
            />
            <WizardModeCard
              title="手动模式"
              description="人工按分类浏览合规库，自定义选择评估范围与控制项。"
              selected={creationMode === 'manual'}
              onClick={() => setCreationMode('manual')}
              tags={[
                { label: '人工选库', tone: 'gray' },
                { label: '自定义范围', tone: 'purple' },
                { label: '实时筛选', tone: 'blue' },
              ]}
            />
          </div>
          <div className="rounded-[20px] border bg-white p-5 shadow-sm">
            <WizardSectionHead
              title="评估场景"
              description="选择本次合规评估的业务场景，影响推荐合规库范围与必测用例权重。下一步将进入任务生成，合规库选择在「任务计划」步骤完成。"
            />
            <Select
              value={assessScenario}
              onValueChange={(value) => setAssessScenario(value as AssessScenario)}
            >
              <SelectTrigger className="h-11 rounded-[14px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSESS_SCENARIOS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    if (step === 4) {
      return (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            {creationMode === 'ai' ? (
              <div className="rounded-[20px] border bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-lg font-black">
                    {aiGenDone ? 'AI 推荐结果' : 'AI 正在分析合规库'}
                  </div>
                  <WizardTag tone="purple">
                    {aiGenDone
                      ? recommendPlan?.source === 'llm'
                        ? 'AI 模型'
                        : '规则兜底'
                      : `${aiGenProgress}%`}
                  </WizardTag>
                </div>
                {!aiGenDone ? (
                  <>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      读取 Agent 画像、业务场景与数据类型，映射适用法规并检索合规控制库。
                    </p>
                    <div className="mt-4">
                      <WizardProgressBar value={aiGenProgress} />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      {recommendPlan?.rationaleSummary ||
                        '已根据画像生成合规库推荐，可在下一步调整。'}
                    </p>
                    {recommendPlan?.missingPortraitFields?.length ? (
                      <WizardNotice variant="gray" className="mt-3">
                        该 Agent 的画像信息不完整（缺少
                        {formatMissingPortraitFields(recommendPlan.missingPortraitFields)}
                        ）。建议先在资产入库补充，再重新推荐，结果会更准确。
                      </WizardNotice>
                    ) : null}
                    {recommendPlan?.exclude?.length ? (
                      <details className="mt-3 rounded-xl border bg-muted/20 p-3 text-sm">
                        <summary className="cursor-pointer font-semibold">
                          已排除 {recommendPlan.exclude.length} 个场景不适用库
                        </summary>
                        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-muted-foreground">
                          {recommendPlan.exclude.slice(0, 15).map((item) => (
                            <li key={item.libraryId}>
                              {item.title} — {item.reason}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    {(recommendPlan?.include || precheck?.recommendedLibraries || []).map(
                      (lib) => (
                        <div
                          key={'libraryId' in lib ? lib.libraryId : lib.id}
                          className="mt-2 rounded-xl border bg-muted/20 px-3 py-2 text-sm font-bold"
                        >
                          {'title' in lib ? lib.title : ''}
                        </div>
                      ),
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-[20px] border bg-white p-5 shadow-sm">
                <div className="text-lg font-black">手动任务生成</div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  系统将依据所选 Agent
                  与评估场景生成任务方案，合规库选择在下一步「任务计划」中完成。
                </p>
                <WizardNotice variant="gray" className="mt-4">
                  手动模式下不会运行 AI 推荐扫描，请在下一步按分类勾选所需合规库。
                </WizardNotice>
              </div>
            )}
          </div>
          <div className="rounded-[20px] border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-lg font-black">任务生成依据</div>
              {aiGenDone ? <WizardTag tone="green">已生成</WizardTag> : null}
            </div>
            {aiGenDone ? (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <WizardStatCard value={metrics.libs} label="推荐合规库" />
                  <WizardStatCard value={metrics.cases} label="检测用例" />
                  <WizardStatCard value={metrics.laws} label="法规映射" />
                  <WizardStatCard value={`${metrics.mins}m`} label="预计耗时" />
                </div>
                <div className="my-4 h-px bg-border" />
                <div className="overflow-hidden rounded-2xl border">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b">
                        <td className="px-3 py-2 font-black">创建方式</td>
                        <td className="px-3 py-2">
                          {creationMode === 'ai' ? 'AI 模式' : '手动模式'}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-3 py-2 font-black">评估场景</td>
                        <td className="px-3 py-2">{scenarioLabel}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-black">必测用例</td>
                        <td className="px-3 py-2">{metrics.must} 条</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <WizardNotice variant="blue" className="mt-4">
                  任务方案已生成，下一步进入「任务计划」确认合规库。
                </WizardNotice>
              </>
            ) : (
              <WizardNotice variant="gray">
                AI 正在生成任务方案，完成后将展示推荐合规库数、用例数与预估耗时。
              </WizardNotice>
            )}
          </div>
        </div>
      );
    }

    if (step === 5) {
      return (
        <div>
          <div className="mb-4 grid gap-2.5 md:grid-cols-5">
            <WizardStatCard value={metrics.libs} label="已选合规库" hint="AI 推荐或手动选择" />
            <WizardStatCard value={metrics.laws} label="法规映射" hint="条款关联" />
            <WizardStatCard
              value={metrics.cases}
              label="检测用例"
              hint={`必测 ${metrics.must} 条`}
            />
            <WizardStatCard value={metrics.reqs} label="接口请求" hint="含对话和工具验证" />
            <WizardStatCard value={`${metrics.mins}m`} label="预计耗时" hint="不含人工复核" />
          </div>
          <div className="rounded-[20px] border bg-white p-5 shadow-sm">
            <WizardSectionHead
              title="选择合规库"
              description="确认或调整纳入本次评估的子法规与控制项，支持搜索筛选与实时统计。"
            />
            {creationMode === 'ai' ? (
              <WizardNotice variant="blue" className="mb-4">
                AI 已根据预检结果推荐合规库，可取消不适用项。
              </WizardNotice>
            ) : null}
            <div className="mb-4 grid gap-2 md:grid-cols-[1fr_160px]">
              <Input
                className="h-11 rounded-[14px]"
                placeholder="搜索法规、控制库、标签…"
                value={libSearch}
                onChange={(event) => setLibSearch(event.target.value)}
              />
              <Select
                value={libFilter}
                onValueChange={(value) => setLibFilter(value as typeof libFilter)}
              >
                <SelectTrigger className="h-11 rounded-[14px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部库</SelectItem>
                  <SelectItem value="recommended">仅 AI 推荐</SelectItem>
                  <SelectItem value="selected">已选</SelectItem>
                  <SelectItem value="unselected">未选</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-[320px] space-y-4 overflow-y-auto pr-1">
              {Array.from(librariesByDomain.entries()).map(([domain, domainLibs]) => (
                <div key={domain}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-black">{domain}</span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {domainLibs.length} 个合规库可选
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {domainLibs.map((lib) => {
                      const meta = readLibraryMeta(lib.metadata);
                      return (
                        <WizardCheckboxCard
                          key={lib.id}
                          checked={selectedLibIds.includes(lib.id)}
                          onCheckedChange={(checked) => toggleLibrary(lib.id, checked)}
                          title={lib.title}
                          description={`${lib.caseCount} 条用例 · ${meta.tag || lib.domain} · ${lib.detectMethod}`}
                          recommended={recommendedLibIds.has(lib.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredLibraries.length ? null : (
                <WizardNotice variant="gray">无匹配合规库，请调整搜索条件。</WizardNotice>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[20px] border bg-white p-5 shadow-sm">
          <WizardSectionHead
            title="确认执行"
            description="确认任务配置后开始执行合规评估。命中的违规项将进入报告，并可推送到风险闭环数据库。"
          />
          <div className="overflow-hidden rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-black text-muted-foreground">项目</th>
                  <th className="px-3 py-2 text-left font-black text-muted-foreground">配置</th>
                  <th className="px-3 py-2 text-left font-black text-muted-foreground">说明</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">评估对象</td>
                  <td className="px-3 py-2">
                    {selectedAgent?.name} · {selectedAgent ? agentDepartment(selectedAgent) : ''}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">API 已联通</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">创建方式</td>
                  <td className="px-3 py-2">
                    {creationMode === 'ai' ? 'AI 合规模式' : '手动模式'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">可回到第 5 步调整</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">合规库</td>
                  <td className="px-3 py-2">{metrics.libs} 个</td>
                  <td className="px-3 py-2 text-muted-foreground">{activeDomain} 等</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">检测用例</td>
                  <td className="px-3 py-2">{metrics.cases} 条</td>
                  <td className="px-3 py-2 text-muted-foreground">必测 {metrics.must} 条</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-black">预计耗时</td>
                  <td className="px-3 py-2">{metrics.mins} 分钟</td>
                  <td className="px-3 py-2 text-muted-foreground">不含人工复核</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-[20px] border bg-white p-5 shadow-sm">
          <WizardSectionHead title="执行说明" />
          <Textarea
            className="min-h-[120px] rounded-[14px]"
            value={taskDesc}
            onChange={(event) => setTaskDesc(event.target.value)}
            placeholder="本次评估覆盖的合规域与控制项说明…"
          />
          <WizardNotice variant="green" className="mt-4">
            任务可执行：Agent API 已联通，合规库已确定，用例计划已生成。
          </WizardNotice>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[1040px]"
      >
        <header className="flex shrink-0 items-start justify-between border-b px-8 pb-5 pt-7">
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              {editTaskId
                ? editCopyMode
                  ? '编辑合规评估任务（将创建副本）'
                  : '编辑合规评估任务'
                : '智能体合规评估任务创建'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {editTaskId
                ? '修改任务配置后保存；已完成任务将以副本形式创建新的待执行任务。'
                : '选择 Agent 后先自动做合规预检与法规映射；AI 模式展示任务生成过程；手动模式支持按分类选择合规库。'}
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-lg text-muted-foreground"
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <ComplianceWizardStepper currentStep={step} />
          <div className="min-h-[360px]">{renderStepContent()}</div>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t bg-[#fafafa] px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            {WIZARD_FOOTER_NOTES[step]}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                className="h-[42px] min-w-[104px] rounded-[13px] font-black"
                onClick={handleBack}
                disabled={createMutation.isPending}
              >
                上一步
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-[42px] min-w-[104px] rounded-[13px] font-black"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
            )}
            {step > 1 && step < 6 ? (
              <Button
                type="button"
                variant="secondary"
                className="h-[42px] min-w-[104px] rounded-[13px] font-black"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate(false)}
              >
                保存草稿
              </Button>
            ) : null}
            {step === 2 && !precheckDone ? (
              <Button
                type="button"
                variant="outline"
                className="h-[42px] min-w-[104px] rounded-[13px] font-black"
                disabled={createMutation.isPending}
                onClick={handleSkipApiPrecheck}
              >
                跳过 API 检测
              </Button>
            ) : null}
            <Button
              type="button"
              className={cn(
                'h-[42px] min-w-[104px] rounded-[13px] font-black',
                step === 6 &&
                  'bg-gradient-to-r from-[#2f6bff] to-[#5b8cff] hover:from-[#2563eb] hover:to-[#4a7cff]',
              )}
              disabled={
                createMutation.isPending ||
                (precheckMutation.isPending && step !== 2) ||
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !precheckDone) ||
                (step === 4 && creationMode === 'ai' && !aiGenDone) ||
                (step === 5 && selectedLibIds.length === 0)
              }
              onClick={handleNext}
            >
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {step === 6
                ? editTaskId
                  ? editCopyMode
                    ? '保存副本'
                    : '保存修改'
                  : WIZARD_NEXT_LABELS[step]
                : WIZARD_NEXT_LABELS[step]}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
