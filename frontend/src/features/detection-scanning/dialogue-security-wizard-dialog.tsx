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
import type { CreationMode } from '@/features/compliance-detection/compliance-precheck';
import {
  ASSESS_SCENARIOS,
  type AssessScenario,
  WizardModeCard,
  WizardNotice,
  WizardProgressBar,
  WizardSectionHead,
  WizardStatCard,
  WizardTag,
} from '@/features/compliance-detection/compliance-wizard-ui';
import { cn } from '@/lib/utils';
import { assetIntakeApi } from '@/services/api/asset-intake';
import {
  detectionScanningApi,
  type DialogueRecommendPlanResult,
} from '@/services/api/detection-scanning';
import { useAuthStore } from '@/stores/auth-store';
import { DialogueManualLibraryPanel } from './dialogue-manual-library-panel';
import {
  DialogueScanExecutionModal,
  type DialogueScanExecutionContext,
} from './dialogue-scan-execution-modal';
import {
  assetRuntimeConfig,
  buildDialoguePrecheckSteps,
  computeDialogueTaskMetrics,
  type DialoguePrecheckResult,
  formatAgentOptionLabel,
  hasRuntimeEndpoint,
  recommendLibrariesForAgent,
  resolveLibrariesForDialogueMode,
  runDialoguePrecheck,
} from './dialogue-precheck';
import { agentDepartment, agentScene } from '@/features/compliance-detection/compliance-precheck';
import { mapTechnicalLibrary } from '@/features/technical-case-library/shared';
import {
  DialogueScanHero,
  DIALOGUE_WIZARD_FOOTER_NOTES,
  DIALOGUE_WIZARD_NEXT_LABELS,
  DialogueWizardStepper,
  SCAN_STRATEGIES,
  WizardStrategyCard,
  type ScanStrategy,
} from './dialogue-security-wizard-ui';
import type { SecurityCaseLibrary } from '@/types/entities';

type DialogueSecurityWizardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  initialAssetId?: string;
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

function isExecutableTechnicalLibrary(library: SecurityCaseLibrary): boolean {
  return library.enabled && library.caseCount > 0 && !mapTechnicalLibrary(library).isDomainOnly;
}

export function DialogueSecurityWizardDialog({
  open,
  onOpenChange,
  onCreated,
  initialAssetId,
  editTaskId = null,
}: DialogueSecurityWizardDialogProps) {
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.auth.user);
  const defaultOwnerName = authUser?.name || '安全负责人';
  const isEditMode = Boolean(editTaskId);
  const [step, setStep] = useState(1);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [taskNameCustomized, setTaskNameCustomized] = useState(false);
  const [ownerName, setOwnerName] = useState(defaultOwnerName);
  const [passRateThreshold, setPassRateThreshold] = useState(90);
  const [notes, setNotes] = useState('');
  const [executeNow, setExecuteNow] = useState(true);
  const [executionContext, setExecutionContext] = useState<DialogueScanExecutionContext | null>(
    null,
  );
  const [precheck, setPrecheck] = useState<DialoguePrecheckResult | null>(null);
  const [precheckApiStatus, setPrecheckApiStatus] = useState<
    'passed' | 'failed' | 'skipped' | null
  >(null);
  const [precheckDone, setPrecheckDone] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanItems, setScanItems] = useState<ScanItemState[]>([]);
  const [creationMode, setCreationMode] = useState<CreationMode>('ai');
  const [assessScenario, setAssessScenario] = useState<AssessScenario>('launch');
  const [scanStrategy, setScanStrategy] = useState<ScanStrategy>('full');
  const [aiGenDone, setAiGenDone] = useState(false);
  const [aiGenProgress, setAiGenProgress] = useState(0);
  const [recommendPlan, setRecommendPlan] = useState<DialogueRecommendPlanResult | null>(
    null,
  );
  const [selectedLibIds, setSelectedLibIds] = useState<string[]>([]);
  const [editHydrated, setEditHydrated] = useState(false);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const precheckStartedRef = useRef(false);
  const aiGenStartedRef = useRef(false);
  const prevOpenRef = useRef(open);

  const agentsQuery = useQuery({
    queryKey: ['dialogue-wizard-agents'],
    queryFn: () => assetIntakeApi.listAgents({ limit: 100 }),
    enabled: open,
  });

  const librariesQuery = useQuery({
    queryKey: ['dialogue-wizard-libraries'],
    queryFn: () => detectionScanningApi.listAllCaseLibraries({ category: 'technical' }),
    enabled: open,
  });

  const agents = useMemo(
    () => (agentsQuery.data?.data ?? []).filter(Boolean),
    [agentsQuery.data?.data],
  );

  const allTechnicalLibraries = useMemo(
    () => librariesQuery.data?.data ?? [],
    [librariesQuery.data?.data],
  );

  const executableLibraries = useMemo(
    () => allTechnicalLibraries.filter(isExecutableTechnicalLibrary),
    [allTechnicalLibraries],
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

  const scenarioLabel =
    ASSESS_SCENARIOS.find((item) => item.value === assessScenario)?.label || '上线前准入';

  const strategyLabel =
    SCAN_STRATEGIES.find((item) => item.value === scanStrategy)?.label || '全量扫描';

  const metrics = useMemo(
    () => computeDialogueTaskMetrics(allTechnicalLibraries, selectedLibIds),
    [allTechnicalLibraries, selectedLibIds],
  );
  const hasExecutableCases = metrics.cases > 0;

  const resetWizard = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
    }
    setStep(1);
    setSelectedAssetId(initialAssetId || '');
    setTaskName('');
    setTaskNameCustomized(false);
    setOwnerName(defaultOwnerName);
    setPassRateThreshold(90);
    setNotes('');
    setExecuteNow(true);
    setExecutionContext(null);
    setPrecheck(null);
    setPrecheckApiStatus(null);
    setPrecheckDone(false);
    setScanProgress(0);
    setScanItems([]);
    precheckStartedRef.current = false;
    aiGenStartedRef.current = false;
    setCreationMode('ai');
    setAssessScenario('launch');
    setScanStrategy('full');
    setAiGenDone(false);
    setAiGenProgress(0);
    setRecommendPlan(null);
    setSelectedLibIds([]);
    setEditHydrated(false);
  }, [initialAssetId, defaultOwnerName]);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      resetWizard();
    }
    prevOpenRef.current = open;
  }, [open, resetWizard]);

  useEffect(() => {
    if (
      !open ||
      !editTaskId ||
      agents.length === 0 ||
      allTechnicalLibraries.length === 0 ||
      editHydrated
    ) {
      return;
    }
    let cancelled = false;
    void detectionScanningApi.getTask(editTaskId).then((task) => {
      if (cancelled) {
        return;
      }
      const metadata = task.metadata ?? {};
      const runConfig = task.runConfig ?? {};
      setSelectedAssetId(task.assetId ?? '');
      setTaskName(task.name);
      setTaskNameCustomized(true);
      setOwnerName(task.ownerName || defaultOwnerName);
      const threshold =
        typeof runConfig.passRateThreshold === 'number'
          ? runConfig.passRateThreshold
          : typeof metadata.passRateThreshold === 'number'
            ? metadata.passRateThreshold
            : 90;
      setPassRateThreshold(threshold);
      if (typeof runConfig.notes === 'string') {
        setNotes(runConfig.notes);
      }
      if (metadata.creationMode === 'ai' || metadata.creationMode === 'manual') {
        setCreationMode(metadata.creationMode);
      }
      const scenario =
        (typeof metadata.assessScenario === 'string' && metadata.assessScenario) ||
        (typeof runConfig.assessScenario === 'string' && runConfig.assessScenario) ||
        '';
      if (scenario === 'launch' || scenario === 'regression' || scenario === 'patrol') {
        setAssessScenario(scenario);
      }
      const strategy =
        (typeof metadata.scanStrategy === 'string' && metadata.scanStrategy) ||
        (typeof runConfig.scanStrategy === 'string' && runConfig.scanStrategy) ||
        '';
      if (SCAN_STRATEGIES.some((item) => item.value === strategy)) {
        setScanStrategy(strategy as ScanStrategy);
      }
      const libIds =
        (Array.isArray(runConfig.selectedLibraryIds)
          ? (runConfig.selectedLibraryIds as string[])
          : null) ||
        task.plans?.flatMap((plan) => plan.libIds ?? []) ||
        [];
      const uniqueLibIds = [...new Set(libIds.filter(Boolean))];
      setSelectedLibIds(uniqueLibIds);
      setAiGenDone(true);
      setAiGenProgress(100);
      setPrecheckDone(true);
      setPrecheckApiStatus('passed');
      const agent = agents.find((item) => item.id === task.assetId);
      if (agent) {
        const recommended = recommendLibrariesForAgent(
          agent,
          executableLibraries,
          (scenario as AssessScenario) || 'launch',
        );
        setPrecheck({
          apiStatus: 'passed',
          endpointConfigured: hasRuntimeEndpoint(agent),
          availableLibraryCount: executableLibraries.length,
          recommendedLibraries: recommended,
          warnings: [],
          estimatedCaseCount: uniqueLibIds.reduce((sum, id) => {
            const lib = allTechnicalLibraries.find((item) => item.id === id);
            return sum + (lib?.caseCount || 0);
          }, 0),
          agent: {
            name: agent.name,
            department: agentDepartment(agent),
            scene: agentScene(agent),
            environment: agent.environment || '—',
            admissionStatus: agent.admissionStatus || '—',
          },
        });
      }
      setExecuteNow(true);
      setStep(5);
      setEditHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    editTaskId,
    agents,
    editHydrated,
    defaultOwnerName,
    executableLibraries,
    allTechnicalLibraries,
  ]);

  useEffect(() => {
    if (!selectedAgent || isEditMode) {
      return;
    }
    const generatedTaskName = `${selectedAgent.name}对话安全评估`;
    setTaskName((current) => {
      if (!current || !taskNameCustomized) {
        return generatedTaskName;
      }
      return current;
    });
  }, [selectedAgent, isEditMode, taskNameCustomized]);

  const revealPrecheckResult = useCallback(
    (result: DialoguePrecheckResult) => {
      const steps = buildDialoguePrecheckSteps(selectedAgent!);
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
      }
      setScanItems(steps.map(() => 'waiting'));
      setScanProgress(0);
      let index = 0;
      scanTimerRef.current = setInterval(() => {
        setScanItems((current) => {
          const next = [...current];
          if (index > 0) {
            next[index - 1] = index === 1 && result.apiStatus === 'failed' ? 'failed' : 'done';
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
          setScanItems(
            steps.map((_, stepIndex) =>
              stepIndex === 0 && result.apiStatus === 'failed' ? 'failed' : 'done',
            ),
          );
          setScanProgress(100);
          setPrecheck(result);
          setPrecheckApiStatus(result.apiStatus);
          setPrecheckDone(true);
          if (creationMode === 'ai') {
            setSelectedLibIds(
              resolveLibrariesForDialogueMode('ai', result, executableLibraries, scanStrategy),
            );
          }
        }
      }, 420);
    },
    [selectedAgent, creationMode, executableLibraries, scanStrategy],
  );

  const precheckMutation = useMutation({
    mutationFn: () => runDialoguePrecheck(selectedAgent!, executableLibraries, assessScenario),
    onSuccess: (result) => {
      revealPrecheckResult(result);
    },
    onError: (error: Error) => {
      toast.error(error.message || '智能体预检失败');
      setPrecheckDone(false);
      setScanItems([]);
      precheckStartedRef.current = false;
    },
  });

  useEffect(() => {
    if (step !== 2 || !selectedAgent || precheckStartedRef.current) {
      return;
    }
    precheckStartedRef.current = true;
    const placeholders = buildDialoguePrecheckSteps(selectedAgent);
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
      if (scanStrategy === 'full') {
        setSelectedLibIds(executableLibraries.map((library) => library.id));
      }
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
      .recommendDialoguePlan({
        assetId: selectedAgent.id,
        assessScenario,
        candidateLibraryIds: executableLibraries.map((library) => library.id),
      })
      .then((plan) => {
        if (cancelled) {
          return;
        }
        setRecommendPlan(plan);
        const nextIds = plan.include.map((item) => item.libraryId);
        setSelectedLibIds(nextIds);
        setPrecheck((current) =>
          current
            ? {
                ...current,
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
        const nextIds = resolveLibrariesForDialogueMode(
          'ai',
          precheck,
          executableLibraries,
          scanStrategy,
        );
        const includeLibs = executableLibraries.filter((library) =>
          nextIds.includes(library.id),
        );
        const excludeLibs = executableLibraries.filter(
          (library) => !nextIds.includes(library.id),
        );
        setRecommendPlan({
          source: 'rules',
          confidence: 0.4,
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
          focusDomains: [...new Set(includeLibs.map((library) => library.domain))],
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
    executableLibraries,
    scanStrategy,
    selectedAgent,
    assessScenario,
  ]);

  useEffect(() => {
    if (step !== 3) {
      return;
    }
    if (!selectedAgent) {
      return;
    }
    const recommended = recommendLibrariesForAgent(
      selectedAgent,
      executableLibraries,
      assessScenario,
    );
    setPrecheck((current) =>
      current
        ? {
            ...current,
            recommendedLibraries: recommended,
            estimatedCaseCount: recommended.reduce((sum, lib) => sum + lib.caseCount, 0),
          }
        : current,
    );
  }, [assessScenario, selectedAgent, executableLibraries, step]);

  const buildTaskPayload = useCallback(() => {
    if (!selectedAgent || !precheck) {
      throw new Error('缺少 Agent 或预检结果');
    }
    if (!hasRuntimeEndpoint(selectedAgent)) {
      throw new Error('该 Agent 未配置 API 接入信息，请先在资产入库补充接入配置');
    }
    if (precheckApiStatus === 'failed') {
      throw new Error('API 联通失败，请修复接入配置后重试');
    }
    const selectedLibs = allTechnicalLibraries.filter((library) =>
      selectedLibIds.includes(library.id),
    );
    const executableSelected = selectedLibs.filter((library) => library.enabled);
    if (executableSelected.length === 0) {
      throw new Error('请至少选择一个已启用的对话安全测试用例库');
    }
    const executableCaseCount = executableSelected.reduce(
      (sum, library) => sum + (library.caseCount || 0),
      0,
    );
    if (executableCaseCount <= 0) {
      throw new Error('所选用例库暂无可执行测试用例，请先导入或启用对话安全测试用例');
    }
    const runtimeConfig = assetRuntimeConfig(selectedAgent);
    const threshold = Math.min(100, Math.max(1, passRateThreshold || 90));
    const executableLibIds = executableSelected.map((library) => library.id);

    return {
      assetId: selectedAgent.id,
      name: taskName.trim() || `${selectedAgent.name}对话安全评估`,
      source: '对话安全评估向导',
      scanType: 'agent_api',
      targetKind: 'agent_api',
      targetSummary: 'Agent API 对话安全评估',
      ownerName: ownerName.trim() || defaultOwnerName,
      runConfig: {
        sourceAssetId: selectedAgent.id,
        sourceAssetCode: selectedAgent.assetCode,
        runtimeConfig,
        runtimeAgentType: runtimeConfig.agentType,
        apiBaseUrl: runtimeConfig.apiBaseUrl,
        webhookUrl: runtimeConfig.webhookUrl,
        selectedLibraryIds: executableLibIds,
        selectedCaseIds: [],
        executeMode: executeNow ? 'immediate' : 'manual',
        notes: notes.trim(),
        creationMode,
        assessScenario,
        scanStrategy,
        passRateThreshold: threshold,
      },
      metadata: {
        source: 'dialogue_security_wizard',
        governanceStage: 'agent_detection',
        creationMode,
        assessScenario,
        scanStrategy,
        passRateThreshold: threshold,
        selectedLibraries: executableSelected.map((library) => ({
          id: library.id,
          title: library.title,
          domain: library.domain,
          caseCount: library.caseCount || 0,
        })),
        selectedCaseIds: [],
        precheck: {
          apiStatus: precheck.apiStatus,
          warnings: precheck.warnings,
          recommendedLibraries: precheck.recommendedLibraries,
        },
        recommendSource: recommendPlan?.source,
        recommendConfidence: recommendPlan?.confidence,
        recommendPlan: recommendPlan
          ? {
              include: recommendPlan.include,
              exclude: recommendPlan.exclude,
              rationaleSummary: recommendPlan.rationaleSummary,
              missingPortraitFields: recommendPlan.missingPortraitFields,
            }
          : undefined,
      },
      plans: [
        {
          probeType: 'agent_api',
          strategy: 'API 对话黑盒检测',
          enabled: true,
          libIds: executableLibIds,
          caseCount: executableCaseCount,
          targets: [
            {
              kind: 'agent',
              id: selectedAgent.id,
              name: selectedAgent.name,
              code: selectedAgent.assetCode,
              runtimeAgentType: runtimeConfig.agentType,
            },
          ],
          metadata: {
            caseIds: [],
          },
        },
      ],
    };
  }, [
    selectedAgent,
    precheck,
    precheckApiStatus,
    selectedLibIds,
    allTechnicalLibraries,
    taskName,
    ownerName,
    defaultOwnerName,
    executeNow,
    notes,
    creationMode,
    assessScenario,
    scanStrategy,
    passRateThreshold,
    recommendPlan,
  ]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = buildTaskPayload();
      if (editTaskId) {
        const task = await detectionScanningApi.updateTask(editTaskId, {
          ...payload,
          status: 'pending',
          progress: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          metadata: {
            ...payload.metadata,
            technicalExecutionResults: [],
            dialogueAssessmentConclusion: undefined,
            dialoguePassRate: undefined,
            dialogueAssessmentLabel: undefined,
          },
        });
        return task;
      }
      const task = await detectionScanningApi.createTask(payload);
      await assetIntakeApi
        .advanceWorkflow(selectedAgent!.id, {
          stage: 'agent_detection',
          status: 'in_progress',
          note: `已创建对话安全评估任务 ${task.name}`,
        })
        .catch((error) => {
          console.warn('Failed to advance asset workflow after creating dialogue task:', error);
        });
      return task;
    },
    onSuccess: (task) => {
      const selectedLibs = allTechnicalLibraries.filter((library) =>
        selectedLibIds.includes(library.id),
      );
      queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] });
      queryClient.invalidateQueries({ queryKey: ['security-remediations'] });
      queryClient.invalidateQueries({ queryKey: ['asset-agents'] });
      if (editTaskId) {
        queryClient.invalidateQueries({ queryKey: ['dialogue-task', editTaskId] });
        queryClient.invalidateQueries({ queryKey: ['dialogue-task-findings', editTaskId] });
      }
      onCreated?.();
      setExecutionContext({
        taskId: task.id,
        taskName: task.name,
        agentName: selectedAgent?.name || '',
        libraryTitles: selectedLibs.map((library) => library.title),
        totalCases: metrics.cases,
        executeNow,
      });
      onOpenChange(false);
      toast.success(
        editTaskId
          ? executeNow
            ? '对话安全评估任务已更新，正在重新执行'
            : '对话安全评估任务已更新'
          : executeNow
            ? '对话安全评估任务已创建，正在执行扫描'
            : '对话安全评估任务已创建',
      );
    },
    onError: (error: Error) =>
      toast.error(
        error.message || (editTaskId ? '更新对话安全评估任务失败' : '创建对话安全评估任务失败'),
      ),
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
      precheckStartedRef.current = false;
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!precheckDone) {
        toast.error('预检进行中，请稍候');
        return;
      }
      if (precheckApiStatus === 'failed') {
        toast.error('API 联通失败，请先修复接入配置');
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      setAiGenDone(false);
      setAiGenProgress(0);
      aiGenStartedRef.current = false;
      setStep(4);
      return;
    }
    if (step === 4) {
      if (creationMode === 'ai' && !aiGenDone) {
        toast.error('AI 正在生成任务方案，请稍候');
        return;
      }
      if (selectedLibIds.length === 0) {
        toast.error('请至少选择一个对话安全测试用例库');
        return;
      }
      setStep(5);
      return;
    }
    if (step === 5) {
      createMutation.mutate();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      if (step === 2 && scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
      }
      setStep((current) => current - 1);
    }
  };

  const toggleLibrary = (libId: string, checked: boolean) => {
    const library = allTechnicalLibraries.find((item) => item.id === libId);
    if (!library || !isExecutableTechnicalLibrary(library)) {
      return;
    }
    setSelectedLibIds((current) =>
      checked ? [...new Set([...current, libId])] : current.filter((id) => id !== libId),
    );
  };

  const selectScanStrategy = (strategy: ScanStrategy) => {
    setScanStrategy(strategy);
    if (strategy === 'full') {
      setSelectedLibIds(executableLibraries.map((library) => library.id));
      return;
    }
    if (scanStrategy === 'full') {
      setSelectedLibIds(precheck?.recommendedLibraries.map((library) => library.id) || []);
    }
  };

  const selectCreationMode = (mode: CreationMode) => {
    setCreationMode(mode);
    if (mode === 'ai') {
      setAiGenDone(false);
      setAiGenProgress(0);
      setRecommendPlan(null);
      aiGenStartedRef.current = false;
    } else if (scanStrategy === 'full') {
      setSelectedLibIds(executableLibraries.map((library) => library.id));
      setAiGenDone(true);
      setRecommendPlan(null);
    }
  };

  const renderStepContent = () => {
    if (step === 1) {
      return (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section>
            <WizardSectionHead
              title="选择评估对象"
              hint="选择 Agent 后进入智能体预检"
              description="选择 Agent 后自动检测 API 联通与接入配置，并从对话安全测试用例库匹配评估方案（无能力组件扫描）。"
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
              <div className="max-w-sm space-y-2">
                <Label className="text-[13px] font-extrabold">评估场景</Label>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  用于 AI 推荐评估方案时匹配更合适的测试库；手动模式下仅作为任务场景标识。
                </p>
                <Select
                  value={assessScenario}
                  onValueChange={(value) => setAssessScenario(value as AssessScenario)}
                >
                  <SelectTrigger className="h-9 rounded-[12px] text-sm">
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
              <WizardNotice variant="gray">
                <strong>推荐流程：</strong> 选择 Agent → 智能体预检 → 创建方式 → 任务生成 →
                确认执行。
              </WizardNotice>
            </div>
          </section>
          <section>
            <WizardSectionHead title="任务创建逻辑" />
            <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
              本流程专用于 API 对话安全评估：检测 Agent
              接入联通性，从对话安全测试用例库生成评估方案并执行黑盒检测。
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <WizardStatCard value="4 类" label="对话测试库" hint="指令泄露、会话对抗、工具滥用、输出风险等" />
              <WizardStatCard value="多场景" label="评估场景" hint="准入、回归、巡检" />
              <WizardStatCard value="2 种" label="创建方式" hint="AI 推荐 / 手动选库" />
              <WizardStatCard value="5 步" label="向导流程" hint="含接入确认与预检" />
            </div>
          </section>
        </div>
      );
    }

    if (step === 2) {
      const scanList = selectedAgent ? buildDialoguePrecheckSteps(selectedAgent) : [];
      const apiStatusLabel = precheckMutation.isPending
        ? '检测中'
        : precheckDone
          ? precheckApiStatus === 'passed'
            ? '通过'
            : precheckApiStatus === 'failed'
              ? '失败'
              : '跳过'
          : '-';
      const latencyLabel =
        precheckDone && precheck?.responseTimeMs != null
          ? `${Math.round(precheck.responseTimeMs)}ms`
          : '-';
      return (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <DialogueScanHero
            steps={scanList}
            scanItems={scanItems}
            scanProgress={scanProgress}
            precheckDone={precheckDone}
          />
          <div className="rounded-[20px] border bg-white p-5 shadow-sm">
            <div className="mb-4 text-lg font-black">预检结果</div>
            <div className="grid grid-cols-2 gap-2.5">
              <WizardStatCard value={apiStatusLabel} label="API 状态" hint="联通后才能执行评估" />
              <WizardStatCard
                value={precheckDone ? String(precheck?.availableLibraryCount ?? 0) : '-'}
                label="可用用例库"
                hint="已启用"
              />
              <WizardStatCard value={latencyLabel} label="平均时延" hint="最近一次探测" />
              <WizardStatCard
                value={precheckDone ? (precheck?.endpointConfigured ? '已配置' : '未配置') : '-'}
                label="接入配置"
                hint="API / Webhook"
              />
            </div>
            <div className="my-4 h-px bg-border" />
            <WizardNotice variant={precheckApiStatus === 'failed' ? 'amber' : 'blue'}>
              {precheckDone && precheck ? (
                precheckApiStatus === 'failed' ? (
                  <>
                    预检未通过：{precheck.apiMessage || 'API 联通失败'}。请修复接入配置后重新预检。
                  </>
                ) : (
                  <>
                    预检完成：可用 <strong>{precheck.availableLibraryCount}</strong>{' '}
                    个对话安全测试用例库，推荐{' '}
                    <strong>{precheck.recommendedLibraries.length}</strong> 个库、约{' '}
                    <strong>{precheck.estimatedCaseCount}</strong> 条用例。
                  </>
                )
              ) : (
                '正在进行智能体预检。'
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
              description="由平台 Agent + Skill 根据画像推荐用例库，并排除场景不适用项。"
              selected={creationMode === 'ai'}
              onClick={() => selectCreationMode('ai')}
              tags={[
                { label: '推荐用例库', tone: 'blue' },
                { label: '自动匹配场景', tone: 'green' },
                { label: '动态估算', tone: 'orange' },
              ]}
            />
            <WizardModeCard
              title="手动模式"
              description="人工按领域浏览对话安全测试用例库，自定义选择评估范围。"
              selected={creationMode === 'manual'}
              onClick={() => selectCreationMode('manual')}
              tags={[
                { label: '人工选库', tone: 'gray' },
                { label: '自定义范围', tone: 'purple' },
                { label: '按领域筛选', tone: 'blue' },
              ]}
            />
          </div>
          {creationMode === 'manual' ? (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              {SCAN_STRATEGIES.map((item) => (
                <WizardStrategyCard
                  key={item.value}
                  title={item.label}
                  description={item.description}
                  selected={scanStrategy === item.value}
                  onClick={() => selectScanStrategy(item.value)}
                />
              ))}
            </div>
          ) : null}
          <div className="rounded-[20px] border bg-white p-5 shadow-sm">
            <div className="mb-3 text-sm font-black text-muted-foreground">预估指标</div>
            <div className="grid grid-cols-3 gap-2.5">
              <WizardStatCard
                value={
                  creationMode === 'ai'
                    ? (precheck?.estimatedCaseCount ?? metrics.cases)
                    : metrics.cases
                }
                label="预计用例数"
              />
              <WizardStatCard value={metrics.rounds} label="对话轮次" />
              <WizardStatCard value={`${metrics.minutes}m`} label="预计耗时" />
            </div>
          </div>
        </div>
      );
    }

    if (step === 4) {
      return (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            {creationMode === 'ai' && !aiGenDone ? (
              <div className="rounded-[20px] border bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-lg font-black">AI 正在生成评估方案</div>
                  <WizardTag tone="purple">{aiGenProgress}%</WizardTag>
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  平台 Agent + Skill：读取画像 → 匹配子场景 → 推荐用例库 → 排除不适用项。
                </p>
                <div className="mt-4">
                  <WizardProgressBar value={aiGenProgress} />
                </div>
              </div>
            ) : null}

            {creationMode === 'ai' && aiGenDone && recommendPlan ? (
              <div className="space-y-2 rounded-[20px] border bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-black">推荐结果</div>
                  <WizardTag tone={recommendPlan.source === 'llm' ? 'purple' : 'gray'}>
                    {recommendPlan.source === 'llm' ? 'AI 模型' : '规则兜底'}
                  </WizardTag>
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {recommendPlan.rationaleSummary}
                </p>
                {recommendPlan.missingPortraitFields.length > 0 ? (
                  <WizardNotice variant="gray">
                    该 Agent 的画像信息不完整（缺少
                    {formatMissingPortraitFields(recommendPlan.missingPortraitFields)}
                    ）。建议先在资产入库补充，再重新推荐，结果会更准确。
                  </WizardNotice>
                ) : null}
                {recommendPlan.exclude.length > 0 ? (
                  <details className="rounded-xl border bg-muted/20 p-3 text-sm">
                    <summary className="cursor-pointer font-semibold">
                      已排除 {recommendPlan.exclude.length} 个场景/能力不适用库
                    </summary>
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-muted-foreground">
                      {recommendPlan.exclude.slice(0, 20).map((item) => (
                        <li key={item.libraryId}>
                          {item.title}（{item.domain}）— {item.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}

            {creationMode === 'manual' || aiGenDone ? (
              <div className="rounded-[20px] border bg-white p-5 shadow-sm">
                <WizardSectionHead
                  title="对话安全测试用例库"
                  description={
                    creationMode === 'ai'
                      ? 'AI 已推荐用例库，可取消不适用项。'
                      : scanStrategy === 'full'
                        ? '全量扫描已锁定全部已启用的用例库。'
                        : '自定义范围：请按领域勾选纳入本次评估的子场景库。'
                  }
                />
                <DialogueManualLibraryPanel
                  libraries={allTechnicalLibraries}
                  selectedLibIds={selectedLibIds}
                  recommendedLibIds={recommendedLibIds}
                  onToggle={toggleLibrary}
                  selectionLocked={creationMode === 'manual' && scanStrategy === 'full'}
                  selectionHint={
                    creationMode === 'manual' && scanStrategy === 'full'
                      ? '全量扫描已锁定全部已启用的子场景库，切换到「自定义范围」后可手动增减。'
                      : undefined
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-[20px] border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-lg font-black">任务生成依据</div>
              {aiGenDone || creationMode === 'manual' ? (
                <WizardTag tone="green">已生成</WizardTag>
              ) : null}
            </div>
            {aiGenDone || creationMode === 'manual' ? (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <WizardStatCard value={metrics.libraries} label="匹配用例库" />
                  <WizardStatCard
                    value={recommendPlan?.estimatedCaseCount ?? metrics.cases}
                    label="检测用例"
                  />
                  <WizardStatCard value={metrics.rounds} label="对话轮次" />
                  <WizardStatCard value={`${metrics.minutes}m`} label="预计耗时" />
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
                        <td className="px-3 py-2 font-black">扫描策略</td>
                        <td className="px-3 py-2">
                          {creationMode === 'ai'
                            ? recommendPlan?.source === 'llm'
                              ? 'AI 场景裁剪推荐'
                              : '规则推荐'
                            : strategyLabel}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <WizardNotice variant="gray">
                AI 正在生成任务方案，完成后将展示匹配用例库数、用例数与预估耗时。
              </WizardNotice>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[20px] border bg-white p-5 shadow-sm">
          <WizardSectionHead
            title="确认执行"
            description="确认任务配置后创建对话安全评估任务。发现的风险项可推送到风险闭环。"
          />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[13px] font-extrabold">任务名称</Label>
              <Input
                className="h-11 rounded-[14px]"
                value={taskName}
                onChange={(event) => {
                  setTaskNameCustomized(true);
                  setTaskName(event.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-extrabold">通过率设定 (%)</Label>
              <Input
                className="h-11 max-w-[200px] rounded-[14px]"
                type="number"
                min={1}
                max={100}
                value={passRateThreshold}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  setPassRateThreshold(Number.isFinite(next) ? next : 90);
                }}
              />
              <WizardNotice variant="gray" className="mt-2">
                例如 100 条用例中 ≥{passRateThreshold || 90} 条通过则判定评估通过。
              </WizardNotice>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[13px] font-extrabold">负责人</Label>
                <div className="flex h-11 items-center rounded-[14px] border bg-muted/30 px-3 text-sm font-medium text-foreground">
                  {ownerName || defaultOwnerName}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-extrabold">执行方式</Label>
                <Select
                  value={executeNow ? 'immediate' : 'later'}
                  onValueChange={(value) => setExecuteNow(value === 'immediate')}
                >
                  <SelectTrigger className="h-11 rounded-[14px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">立即执行</SelectItem>
                    <SelectItem value="later">稍后执行</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-extrabold">检测说明</Label>
              <Textarea
                className="min-h-[100px] rounded-[14px]"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="例如：首次上线前评估，重点覆盖提示词注入、越权工具调用、RAG 数据泄露。"
              />
            </div>
          </div>
        </div>
        <div className="rounded-[20px] border bg-white p-5 shadow-sm">
          <WizardSectionHead title="任务汇总" />
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            <WizardStatCard value={metrics.cases} label="匹配用例数" />
            <WizardStatCard value={metrics.rounds} label="对话轮次" />
            <WizardStatCard value={`${metrics.minutes}m`} label="预计耗时" />
            <WizardStatCard value={selectedAgent?.name || '-'} label="扫描对象" />
          </div>
          <div className="overflow-hidden rounded-2xl border">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-2 font-black">创建方式</td>
                  <td className="px-3 py-2">{creationMode === 'ai' ? 'AI 模式' : '手动模式'}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-black">评估场景</td>
                  <td className="px-3 py-2">{scenarioLabel}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-black">扫描策略</td>
                  <td className="px-3 py-2">
                    {creationMode === 'ai' ? 'AI 推荐全量' : strategyLabel}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-black">通过率阈值</td>
                  <td className="px-3 py-2">{passRateThreshold}%</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-black">检测类型</td>
                  <td className="px-3 py-2">API 对话黑盒检测</td>
                </tr>
              </tbody>
            </table>
          </div>
          <WizardNotice variant={hasExecutableCases ? 'green' : 'amber'} className="mt-4">
            {hasExecutableCases
              ? '任务可执行：Agent API 已联通，用例库已确定，评估方案已生成。'
              : '任务暂不可执行：所选用例库暂无可执行测试用例，请先导入或启用对话安全测试用例。'}
          </WizardNotice>
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[1040px]"
        >
          <header className="flex shrink-0 items-start justify-between border-b px-8 pb-5 pt-7">
            <div>
              <h1 className="text-2xl font-black tracking-tight">
                {isEditMode ? '编辑对话安全评估任务' : '对话安全评估任务创建'}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {isEditMode
                  ? '修改任务配置后保存；勾选立即执行将清空旧结果并以更新后的配置重新扫描。'
                  : '选择 Agent 后自动检测 API 联通与接入配置，从对话安全测试用例库生成评估方案并执行黑盒检测。'}
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
            <DialogueWizardStepper currentStep={step} />
            <div className="min-h-[360px]">{renderStepContent()}</div>
          </div>

          <footer className="flex shrink-0 flex-col gap-3 border-t bg-[#fafafa] px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
              {step === 2 && precheckApiStatus === 'failed'
                ? 'API 联通失败，请修复接入配置后重新预检，无法进入下一步。'
                : DIALOGUE_WIZARD_FOOTER_NOTES[step]}
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
              <Button
                type="button"
                className={cn(
                  'h-[42px] min-w-[104px] rounded-[13px] font-black',
                  step === 5 &&
                    'bg-gradient-to-r from-[#2f6bff] to-[#5b8cff] hover:from-[#2563eb] hover:to-[#4a7cff]',
                )}
                disabled={
                  createMutation.isPending ||
                  (precheckMutation.isPending && step === 2) ||
                  (step === 1 && !canProceedStep1) ||
                  (step === 2 && (!precheckDone || precheckApiStatus === 'failed')) ||
                  (step === 4 && creationMode === 'ai' && !aiGenDone) ||
                  (step === 4 && selectedLibIds.length === 0) ||
                  (step === 5 && !hasExecutableCases)
                }
                onClick={handleNext}
              >
                {createMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {step === 5
                  ? executeNow
                    ? isEditMode
                      ? '保存并重新执行'
                      : DIALOGUE_WIZARD_NEXT_LABELS[step]
                    : isEditMode
                      ? '保存任务'
                      : '创建评估任务'
                  : DIALOGUE_WIZARD_NEXT_LABELS[step]}
              </Button>
            </div>
          </footer>
        </DialogContent>
      </Dialog>
      <DialogueScanExecutionModal
        context={executionContext}
        onClose={() => setExecutionContext(null)}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
          queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] });
        }}
      />
    </>
  );
}
