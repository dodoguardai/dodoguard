import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Switch } from '@/components/ui/switch';
import {
  WizardModeCard,
  WizardNotice,
  WizardProgressBar,
  WizardSectionHead,
  WizardStatCard,
  WizardTag,
} from '@/features/compliance-detection/compliance-wizard-ui';
import { DialogueManualLibraryPanel } from '@/features/detection-scanning/dialogue-manual-library-panel';
import {
  buildDialoguePrecheckSteps,
  computeDialogueTaskMetrics,
  type DialoguePrecheckResult,
  formatAgentOptionLabel,
  resolveLibrariesForDialogueMode,
  runDialoguePrecheck,
} from '@/features/detection-scanning/dialogue-precheck';
import {
  DialogueScanHero,
  SCAN_STRATEGIES,
  type ScanStrategy,
  WizardStrategyCard,
} from '@/features/detection-scanning/dialogue-security-wizard-ui';
import { cn } from '@/lib/utils';
import { assetIntakeApi } from '@/services/api/asset-intake';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import { createPatrolPlan } from './create-patrol-plan';
import {
  PATROL_WIZARD_FOOTER_NOTES,
  PATROL_WIZARD_NEXT_LABELS,
  PatrolWizardStepper,
} from './patrol-plan-wizard-ui';
import {
  defaultPeriodicPlanConfig,
  labelFromOptions,
  type PeriodicPlanConfig,
  periodicFailurePolicyOptions,
  periodicFrequencyOptions,
} from './periodic-plan-config';
import type { CreationMode } from '@/features/compliance-detection/compliance-precheck';

type PatrolPlanWizardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  initialAssetId?: string;
};

type ScanItemState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped';

const COMPONENT_TYPE_LABELS: Record<string, string> = {
  skill: 'Skill',
  mcp: 'MCP',
  tool: 'Tool/API',
  model: '大模型',
  knowledge_base: '知识库',
};

function sameIdList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function summarizePrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 120)}...`;
}

export function PatrolPlanWizardDialog({
  open,
  onOpenChange,
  onCreated,
  initialAssetId,
}: PatrolPlanWizardDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [taskNameCustomized, setTaskNameCustomized] = useState(false);
  const [precheck, setPrecheck] = useState<DialoguePrecheckResult | null>(null);
  const [precheckApiStatus, setPrecheckApiStatus] = useState<
    'passed' | 'failed' | 'skipped' | null
  >(null);
  const [precheckDone, setPrecheckDone] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanItems, setScanItems] = useState<ScanItemState[]>([]);
  const [creationMode, setCreationMode] = useState<CreationMode>('ai');
  const [scanStrategy, setScanStrategy] = useState<ScanStrategy>('full');
  const [aiGenDone, setAiGenDone] = useState(false);
  const [aiGenProgress, setAiGenProgress] = useState(0);
  const [selectedLibIds, setSelectedLibIds] = useState<string[]>([]);
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([]);
  const [expandedLibraryId, setExpandedLibraryId] = useState<string | null>(null);
  const [periodicConfig, setPeriodicConfig] = useState<PeriodicPlanConfig>(
    defaultPeriodicPlanConfig(),
  );
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const precheckStartedRef = useRef<string | null>(null);
  const precheckCompletedRef = useRef<string | null>(null);
  const aiGenStartedRef = useRef(false);
  const prevOpenRef = useRef(open);

  const agentsQuery = useQuery({
    queryKey: ['patrol-wizard-agents'],
    queryFn: () => assetIntakeApi.listAgents({ limit: 100 }),
    enabled: open,
  });

  const librariesQuery = useQuery({
    queryKey: ['patrol-wizard-libraries'],
    queryFn: () => detectionScanningApi.listCaseLibraries({ limit: 100, category: 'technical' }),
    enabled: open,
  });

  const expandedLibraryCasesQuery = useQuery({
    queryKey: ['patrol-wizard-library-cases', expandedLibraryId],
    queryFn: () => detectionScanningApi.listTestCases(expandedLibraryId!),
    enabled: open && step === 3 && Boolean(expandedLibraryId),
    staleTime: 5 * 60 * 1000,
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
    () => allTechnicalLibraries.filter((library) => library.enabled),
    [allTechnicalLibraries],
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAssetId),
    [agents, selectedAssetId],
  );

  const precheckSnapshotKey = useMemo(() => {
    if (!selectedAgent) {
      return '';
    }
    const librarySnapshot = executableLibraries
      .map((library) => `${library.id}:${library.enabled}:${library.caseCount}`)
      .sort()
      .join('|');
    return `${selectedAgent.id}::${librarySnapshot}`;
  }, [selectedAgent, executableLibraries]);

  const recommendedLibIds = useMemo(
    () => new Set(precheck?.recommendedLibraries.map((lib) => lib.id) || []),
    [precheck],
  );

  const strategyLabel =
    SCAN_STRATEGIES.find((item) => item.value === scanStrategy)?.label || '全量扫描';

  const executionScheduleLabel = useMemo(() => {
    if (!periodicConfig.firstRunAt || !periodicConfig.runAtTime) {
      return '待设置执行时间';
    }
    const frequencyLabel = labelFromOptions(periodicFrequencyOptions, periodicConfig.frequency);
    return `${periodicConfig.firstRunAt} ${periodicConfig.runAtTime} 起，${frequencyLabel}执行`;
  }, [periodicConfig.firstRunAt, periodicConfig.frequency, periodicConfig.runAtTime]);

  const metrics = useMemo(
    () => computeDialogueTaskMetrics(allTechnicalLibraries, selectedLibIds),
    [allTechnicalLibraries, selectedLibIds],
  );

  const resetWizard = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (aiTimerRef.current) {
      clearInterval(aiTimerRef.current);
    }
    setStep(1);
    setSelectedAssetId(initialAssetId || '');
    setTaskName('');
    setTaskNameCustomized(false);
    setPrecheck(null);
    setPrecheckApiStatus(null);
    setPrecheckDone(false);
    setScanProgress(0);
    setScanItems([]);
    precheckStartedRef.current = null;
    precheckCompletedRef.current = null;
    aiGenStartedRef.current = false;
    setCreationMode('ai');
    setScanStrategy('full');
    setAiGenDone(false);
    setAiGenProgress(0);
    setSelectedLibIds([]);
    setSelectedComponentIds([]);
    setExpandedLibraryId(null);
    setPeriodicConfig(defaultPeriodicPlanConfig());
  }, [initialAssetId]);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      resetWizard();
    }
    prevOpenRef.current = open;
  }, [open, resetWizard]);

  useEffect(() => {
    if (!selectedAgent) {
      return;
    }
    const generatedTaskName = `${selectedAgent.name} · 周期巡检`;
    setTaskName((current) => {
      if (!current || !taskNameCustomized) {
        return generatedTaskName;
      }
      return current;
    });
    setSelectedComponentIds(selectedAgent.components?.map((component) => component.id) || []);
  }, [selectedAgent, taskNameCustomized]);

  const revealPrecheckResult = useCallback(
    (result: DialoguePrecheckResult) => {
      if (!selectedAgent) {
        return;
      }
      const steps = buildDialoguePrecheckSteps(selectedAgent);
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
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
            scanTimerRef.current = null;
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
          precheckCompletedRef.current = precheckSnapshotKey;
          if (creationMode === 'ai') {
            setSelectedLibIds(
              resolveLibrariesForDialogueMode('ai', result, executableLibraries, scanStrategy),
            );
          }
        }
      }, 420);
    },
    [selectedAgent, creationMode, executableLibraries, scanStrategy, precheckSnapshotKey],
  );

  const precheckMutation = useMutation({
    mutationFn: () => runDialoguePrecheck(selectedAgent!, executableLibraries, 'patrol'),
    onSuccess: (result) => {
      revealPrecheckResult(result);
    },
    onError: (error: Error) => {
      toast.error(error.message || '智能体预检失败');
      setPrecheckDone(false);
      setScanItems([]);
      precheckStartedRef.current = null;
      precheckCompletedRef.current = null;
    },
  });

  useEffect(() => {
    if (step !== 2 || !selectedAgent) {
      return;
    }
    if (precheckDone && precheck && precheckCompletedRef.current === precheckSnapshotKey) {
      return;
    }
    if (precheckStartedRef.current === precheckSnapshotKey) {
      return;
    }
    precheckStartedRef.current = precheckSnapshotKey;
    const placeholders = buildDialoguePrecheckSteps(selectedAgent);
    setScanItems(placeholders.map((_, index) => (index === 0 ? 'running' : 'waiting')));
    setPrecheckDone(false);
    setPrecheck(null);
    setPrecheckApiStatus(null);
    precheckMutation.mutate();
  }, [step, selectedAgent, precheckDone, precheck, precheckSnapshotKey, precheckMutation.mutate]);

  useEffect(() => {
    if (step !== 5) {
      aiGenStartedRef.current = false;
      return;
    }
    if (creationMode === 'manual') {
      setAiGenDone(true);
      if (scanStrategy === 'full' && selectedLibIds.length === 0) {
        setSelectedLibIds(executableLibraries.map((library) => library.id));
      }
      return;
    }
    if (!precheck || aiGenDone || aiGenStartedRef.current) {
      return;
    }
    aiGenStartedRef.current = true;
    setAiGenProgress(0);
    if (aiTimerRef.current) {
      clearInterval(aiTimerRef.current);
    }
    let progress = 0;
    aiTimerRef.current = setInterval(() => {
      progress += 12;
      setAiGenProgress(Math.min(progress, 100));
      if (progress >= 100) {
        if (aiTimerRef.current) {
          clearInterval(aiTimerRef.current);
        }
        setAiGenDone(true);
        const nextIds = resolveLibrariesForDialogueMode(
          'ai',
          precheck,
          executableLibraries,
          scanStrategy,
        );
        setSelectedLibIds((current) => (sameIdList(current, nextIds) ? current : nextIds));
      }
    }, 280);
    return () => {
      if (aiTimerRef.current) {
        clearInterval(aiTimerRef.current);
      }
    };
  }, [
    step,
    creationMode,
    precheck,
    aiGenDone,
    executableLibraries,
    scanStrategy,
    selectedLibIds.length,
  ]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent || !precheck) {
        throw new Error('缺少 Agent 或预检结果');
      }
      return createPatrolPlan({
        asset: selectedAgent,
        periodicConfig,
        selectedLibIds,
        caseLibraries: allTechnicalLibraries,
        taskName,
        creationMode,
        selectedComponentIds,
        source: 'launch_monitoring_wizard',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['launch-monitoring-scan-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['launch-monitoring-assets'] });
      queryClient.invalidateQueries({ queryKey: ['launch-monitoring-findings'] });
      queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['asset-agents'] });
      toast.success('周期巡检计划已创建');
      onOpenChange(false);
      onCreated?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || '创建周期巡检计划失败');
    },
  });

  const canProceedStep1 = Boolean(selectedAssetId && taskName.trim());

  const handleNext = () => {
    if (step === 1) {
      if (!canProceedStep1) {
        toast.error('请选择 Agent 并填写任务名称');
        return;
      }
      setStep(2);
      return;
    }
    if (step < 6) {
      setStep((current) => current + 1);
      return;
    }
    createMutation.mutate();
  };

  const handleBack = () => {
    if (step > 1) {
      if (step === 2 && scanTimerRef.current && !precheckDone) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
        precheckStartedRef.current = null;
      }
      if (step === 5 && aiTimerRef.current) {
        clearInterval(aiTimerRef.current);
        aiGenStartedRef.current = false;
      }
      setStep((current) => current - 1);
    }
  };

  const toggleLibrary = (libId: string, checked: boolean) => {
    const library = allTechnicalLibraries.find((item) => item.id === libId);
    if (!library || !library.enabled) {
      return;
    }
    setSelectedLibIds((current) =>
      checked ? [...new Set([...current, libId])] : current.filter((id) => id !== libId),
    );
  };

  const toggleComponent = (componentId: string, checked: boolean) => {
    setSelectedComponentIds((current) =>
      checked
        ? [...new Set([...current, componentId])]
        : current.filter((id) => id !== componentId),
    );
  };

  const precheckSteps = selectedAgent ? buildDialoguePrecheckSteps(selectedAgent) : [];

  const renderStepContent = () => {
    if (step === 1) {
      return (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section>
            <WizardSectionHead
              title="选择评估对象"
              hint="选择 Agent 后进入智能体预检"
              description="先选择需要评估的 Agent。系统会自动检测 API 是否可联通、配置是否可读取、组件是否可识别，并生成扫描资产清单。"
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
                <Label className="text-[13px] font-extrabold">巡检计划名称</Label>
                <Input
                  className="h-11 rounded-[14px]"
                  value={taskName}
                  onChange={(event) => {
                    setTaskNameCustomized(true);
                    setTaskName(event.target.value);
                  }}
                  placeholder="系统将根据 Agent 自动生成计划名称"
                />
              </div>
              <Badge variant="outline" className="border-purple-200 text-purple-700">
                扫描场景：定期巡检
              </Badge>
            </div>
          </section>
          <aside className="rounded-[20px] border bg-white p-5 shadow-sm">
            <WizardSectionHead title="任务创建逻辑" />
            <WizardNotice variant="gray" className="mb-4">
              <strong>推荐流程：</strong> 选择 Agent → 智能体预检 → 资产确认 → 创建方式 → 任务生成 →
              确认扫描
            </WizardNotice>
            <div className="grid grid-cols-2 gap-2.5">
              <WizardStatCard value="6 步" label="向导流程" hint="含资产确认与计划配置" />
              <WizardStatCard value="定期巡检" label="评估场景" hint="长期安全巡检" />
            </div>
          </aside>
        </div>
      );
    }

    if (step === 2) {
      const apiStatusLabel =
        precheckApiStatus === 'passed'
          ? '已联通'
          : precheckApiStatus === 'failed'
            ? '未联通'
            : '检测中';
      const latencyLabel = precheck?.responseTimeMs ? `${precheck.responseTimeMs}ms` : '—';
      return (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <DialogueScanHero
            steps={precheckSteps}
            scanItems={scanItems}
            scanProgress={scanProgress}
            precheckDone={precheckDone}
          />
          <div className="rounded-[20px] border bg-white p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-2.5">
              <WizardStatCard value={apiStatusLabel} label="API 状态" hint="联通后才能执行巡检" />
              <WizardStatCard
                value={String(precheck?.availableLibraryCount ?? '—')}
                label="可用用例库"
                hint="已启用技术安全库"
              />
              <WizardStatCard value={latencyLabel} label="平均时延" hint="最近一次探测" />
              <WizardStatCard
                value={String(selectedAgent?.components?.length ?? 0)}
                label="识别组件"
                hint="Skill / MCP / 工具等"
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
                    个技术安全用例库，推荐 <strong>{precheck.recommendedLibraries.length}</strong>{' '}
                    个库、约 <strong>{precheck.estimatedCaseCount}</strong> 条用例。
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
      const components = selectedAgent?.components || [];
      const recommendedLibCount = precheck?.recommendedLibraries.length ?? 0;
      return (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section>
            <WizardSectionHead
              title="资产确认"
              hint="确认纳入巡检的组件与用例库"
              description="系统已识别 Agent 关联的 Skill、MCP、工具链与知识库组件，请确认纳入本次周期巡检的范围。"
            />
            <div className="space-y-3">
              {components.length > 0 ? (
                components.map((component) => (
                  <label
                    key={component.id}
                    className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                  >
                    <Checkbox
                      checked={selectedComponentIds.includes(component.id)}
                      onCheckedChange={(checked) => toggleComponent(component.id, checked === true)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{component.componentName}</span>
                        <Badge variant="outline">
                          {COMPONENT_TYPE_LABELS[component.componentType] ||
                            component.componentType}
                        </Badge>
                        {component.highRisk ? (
                          <Badge variant="outline" className="border-orange-200 text-orange-700">
                            高风险
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {component.componentKey} · v{component.version || '—'}
                      </p>
                    </div>
                  </label>
                ))
              ) : (
                <WizardNotice variant="gray">
                  未识别到附加组件，将仅对 Agent API 执行巡检。
                </WizardNotice>
              )}
            </div>
          </section>
          <aside className="rounded-[20px] border bg-white p-5 shadow-sm">
            <WizardSectionHead
              title="本次巡检用例库"
              description="下方展示智能预检根据 Agent 画像、组件与已启用技术安全用例库推荐纳入本次巡检的用例库。"
            />
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant="outline">组件 {components.length} 项</Badge>
              <Badge variant="outline">推荐用例库 {recommendedLibCount} 个</Badge>
              <Badge variant="outline">
                {periodicConfig.replayFailedCases ? '回放原失败用例' : '仅标准巡检'}
              </Badge>
            </div>
            <div className="space-y-2">
              {precheck?.recommendedLibraries.map((library) => {
                const expanded = expandedLibraryId === library.id;
                const cases = expanded ? expandedLibraryCasesQuery.data || [] : [];
                return (
                  <div key={library.id} className="overflow-hidden rounded-xl border text-sm">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30"
                      onClick={() => setExpandedLibraryId(expanded ? null : library.id)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{library.title}</span>
                          {library.reason ? (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              推荐原因：{library.reason}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="shrink-0 text-muted-foreground">{library.caseCount} 条</span>
                    </button>
                    {expanded ? (
                      <div className="border-t bg-muted/15 px-3 py-2">
                        {expandedLibraryCasesQuery.isLoading ? (
                          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            正在读取测试指令
                          </div>
                        ) : expandedLibraryCasesQuery.isError ? (
                          <p className="py-3 text-xs text-destructive">
                            测试指令读取失败，请稍后重试。
                          </p>
                        ) : cases.length > 0 ? (
                          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                            {cases.slice(0, 6).map((testCase) => (
                              <div
                                key={testCase.id}
                                className="rounded-lg border bg-white px-2.5 py-2"
                              >
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <span className="truncate text-xs font-black">
                                    {testCase.name}
                                  </span>
                                  <Badge variant="outline" className="shrink-0 text-[10px]">
                                    {testCase.caseCode}
                                  </Badge>
                                </div>
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                  {summarizePrompt(testCase.prompt)}
                                </p>
                              </div>
                            ))}
                            {cases.length > 6 ? (
                              <p className="text-center text-xs text-muted-foreground">
                                仅预览前 6 条，共 {cases.length} 条。完整内容可在用例库查看。
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="py-3 text-xs text-muted-foreground">
                            该用例库暂无可展示的测试指令。
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      );
    }

    if (step === 4) {
      return (
        <div>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <WizardModeCard
              title="AI 模式"
              description="由 AI 根据 Agent 画像与巡检场景自动推荐技术安全用例库。"
              selected={creationMode === 'ai'}
              onClick={() => setCreationMode('ai')}
              tags={[
                { label: '推荐用例库', tone: 'blue' },
                { label: '自动匹配场景', tone: 'green' },
                { label: '动态估算', tone: 'orange' },
              ]}
            />
            <WizardModeCard
              title="手动模式"
              description="人工按领域浏览技术安全用例库，自定义选择巡检范围。"
              selected={creationMode === 'manual'}
              onClick={() => setCreationMode('manual')}
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
                  onClick={() => setScanStrategy(item.value)}
                />
              ))}
            </div>
          ) : null}
          <div className="rounded-[20px] border bg-white p-5 shadow-sm">
            <div className="grid grid-cols-3 gap-2.5">
              <WizardStatCard
                value={precheck?.estimatedCaseCount ?? metrics.cases}
                label="预计用例数"
              />
              <WizardStatCard value={metrics.rounds} label="对话轮次" />
              <WizardStatCard value={`${metrics.minutes}m`} label="预计耗时" />
            </div>
          </div>
        </div>
      );
    }

    if (step === 5) {
      return (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            {creationMode === 'ai' ? (
              <div className="rounded-[20px] border bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-lg font-black">AI 正在生成巡检方案</div>
                  <WizardTag tone="purple">{aiGenProgress}%</WizardTag>
                </div>
                <WizardProgressBar value={aiGenProgress} />
              </div>
            ) : null}
            <div className="rounded-[20px] border bg-white p-5 shadow-sm">
              <WizardSectionHead title="技术安全用例库" />
              <DialogueManualLibraryPanel
                libraries={allTechnicalLibraries}
                selectedLibIds={selectedLibIds}
                recommendedLibIds={recommendedLibIds}
                onToggle={toggleLibrary}
              />
            </div>
          </div>
          <div className="rounded-[20px] border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-lg font-black">任务生成依据</div>
              {aiGenDone || creationMode === 'manual' ? (
                <WizardTag tone="green">已生成</WizardTag>
              ) : null}
            </div>
            {aiGenDone || creationMode === 'manual' ? (
              <div className="grid grid-cols-2 gap-2.5">
                <WizardStatCard value={metrics.libraries} label="匹配用例库" />
                <WizardStatCard value={metrics.cases} label="检测用例" />
                <WizardStatCard value={metrics.rounds} label="对话轮次" />
                <WizardStatCard value={`${metrics.minutes}m`} label="预计耗时" />
              </div>
            ) : (
              <WizardNotice variant="gray">
                AI 正在生成巡检方案，完成后将展示匹配用例库与预估耗时。
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
            title="确认扫描"
            description="确认巡检计划配置后创建周期巡检任务，将按所选首次执行时间与频率运行。"
          />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[13px] font-extrabold">计划名称</Label>
              <Input
                className="h-11 rounded-[14px]"
                value={taskName}
                onChange={(event) => {
                  setTaskNameCustomized(true);
                  setTaskName(event.target.value);
                }}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>巡检频率</Label>
                <Select
                  value={periodicConfig.frequency}
                  onValueChange={(value) =>
                    setPeriodicConfig((current) => ({
                      ...current,
                      frequency: value as PeriodicPlanConfig['frequency'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periodicFrequencyOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>首次执行日期</Label>
                <Input
                  type="date"
                  value={periodicConfig.firstRunAt}
                  onChange={(event) =>
                    setPeriodicConfig((current) => ({
                      ...current,
                      firstRunAt: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>执行时间</Label>
                <Input
                  type="time"
                  value={periodicConfig.runAtTime}
                  onChange={(event) =>
                    setPeriodicConfig((current) => ({
                      ...current,
                      runAtTime: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>失败处置</Label>
                <Select
                  value={periodicConfig.failurePolicy}
                  onValueChange={(value) =>
                    setPeriodicConfig((current) => ({
                      ...current,
                      failurePolicy: value as PeriodicPlanConfig['failurePolicy'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periodicFailurePolicyOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-4">
                <Label>纳入原失败用例回放</Label>
                <Switch
                  checked={periodicConfig.replayFailedCases}
                  onCheckedChange={(checked) =>
                    setPeriodicConfig((current) => ({
                      ...current,
                      replayFailedCases: checked,
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label>创建后启用计划</Label>
                <Switch
                  checked={periodicConfig.enabled}
                  onCheckedChange={(checked) =>
                    setPeriodicConfig((current) => ({ ...current, enabled: checked }))
                  }
                />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-[20px] border bg-white p-5 shadow-sm">
          <WizardSectionHead title="任务汇总" />
          <div className="overflow-hidden rounded-2xl border">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-2 font-black">创建方式</td>
                  <td className="px-3 py-2">{creationMode === 'ai' ? 'AI 模式' : '手动模式'}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-black">扫描场景</td>
                  <td className="px-3 py-2">定期巡检</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-black">扫描策略</td>
                  <td className="px-3 py-2">
                    {creationMode === 'ai' ? 'AI 推荐全量' : strategyLabel}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-black">执行方式</td>
                  <td className="px-3 py-2">{executionScheduleLabel}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <WizardNotice variant="green" className="mt-4">
            计划可创建：Agent API 已联通，用例库已确定，巡检方案已生成。
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
            <h1 className="text-2xl font-black tracking-tight">创建周期巡检计划</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              为已上线 Agent 配置长期安全巡检策略 · 与技术风险评估任务共用同一创建流程
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
          <PatrolWizardStepper currentStep={step} />
          <div className="min-h-[360px]">{renderStepContent()}</div>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t bg-[#fafafa] px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            {step === 2 && precheckApiStatus === 'failed'
              ? 'API 联通失败，请修复接入配置后重新预检，无法进入下一步。'
              : step === 6
                ? `确认巡检计划配置后可创建周期巡检任务，${executionScheduleLabel}。`
                : PATROL_WIZARD_FOOTER_NOTES[step]}
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
                step === 6 &&
                  'bg-gradient-to-r from-[#2f6bff] to-[#5b8cff] hover:from-[#2563eb] hover:to-[#4a7cff]',
              )}
              disabled={
                createMutation.isPending ||
                (precheckMutation.isPending && step === 2) ||
                (step === 1 && !canProceedStep1) ||
                (step === 2 && (!precheckDone || precheckApiStatus === 'failed')) ||
                (step === 3 &&
                  selectedComponentIds.length === 0 &&
                  (selectedAgent?.components?.length || 0) > 0) ||
                (step === 5 && creationMode === 'ai' && !aiGenDone) ||
                (step === 5 && selectedLibIds.length === 0) ||
                (step === 6 && (!periodicConfig.firstRunAt || !periodicConfig.runAtTime))
              }
              onClick={handleNext}
            >
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {PATROL_WIZARD_NEXT_LABELS[step]}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
