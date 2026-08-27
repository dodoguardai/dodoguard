import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ClipboardCheck,
  Copy,
  Eye,
  FileText,
  Gauge,
  MoreHorizontal,
  Pencil,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfigDrawer } from '@/components/config-drawer';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import '@/features/compliance-detection/compliance-hero.css';

import { isPatrolTask } from '@/features/launch-monitoring/patrol-utils';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import { DialogueSecurityWizardDialog } from './dialogue-security-wizard-dialog';
import {
  type BinaryDialogueConclusion,
  computeDialogueTaskStats,
  type DialogueAssessmentConclusion,
  EXECUTION_STATUS_CLASS,
  EXECUTION_STATUS_LABELS,
  type ExecutionDisplayStatus,
  getBinaryDialogueConclusionLabel,
  isExecutionFinished,
  matchesExecutionStatusFilter,
  normalizeBinaryDialogueConclusion,
  normalizeExecutionDisplayStatus,
  resolveDialogueAssessmentSummary,
} from './dialogue-task-detail-utils';
import type { SecurityScanFinding, SecurityScanTask } from '@/types/entities';

type ScanStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'canceled';

const RUNNING_TASK_REFETCH_INTERVAL_MS = 10_000;

function shouldPollScanTasks(payload: { data?: SecurityScanTask[] | null } | undefined): boolean {
  const tasks = payload?.data || [];
  const now = Date.now();
  const recentPendingMs = 3 * 60 * 1000;
  return tasks.some((task) => {
    if (task.status === 'running') {
      return true;
    }
    if (task.status !== 'pending') {
      return false;
    }
    const createdAt = new Date(task.createdAt).getTime();
    return Number.isFinite(createdAt) && now - createdAt < recentPendingMs;
  });
}

type TechnicalScanTask = {
  id: string;
  name: string;
  asset: string;
  assetCode: string;
  assetVersion?: string | null;
  source: string;
  scanType: string;
  target: string;
  status: ScanStatus;
  progress: number;
  pendingPushCount: number;
  high: number;
  medium: number;
  low: number;
  owner: string;
  createdAt: string;
  passRate?: number;
  passRateThreshold?: number;
  assessmentConclusion?: DialogueAssessmentConclusion;
  assessmentLabel?: string;
  raw: SecurityScanTask;
};

function StatusBadge({ status }: { status: ScanStatus }) {
  const displayStatus = normalizeExecutionDisplayStatus(status);
  return (
    <Badge variant="outline" className={EXECUTION_STATUS_CLASS[displayStatus]}>
      {EXECUTION_STATUS_LABELS[displayStatus]}
    </Badge>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header fixed>
        <Search />
        <div className="ml-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className="grid min-w-0 gap-6 overflow-x-hidden">{children}</Main>
    </>
  );
}

export function TechnicalRiskShell({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}

const binaryConclusionClass: Record<BinaryDialogueConclusion, string> = {
  pass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
  fail: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300',
};

function TaskConclusionBadge({ conclusion }: { conclusion?: DialogueAssessmentConclusion }) {
  const binary = normalizeBinaryDialogueConclusion(conclusion);
  const label = getBinaryDialogueConclusionLabel(conclusion);
  if (!binary || !label) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <Badge variant="outline" className={binaryConclusionClass[binary]}>
      {label}
    </Badge>
  );
}

type ConclusionFilter = 'all' | BinaryDialogueConclusion;

const CONCLUSION_FILTER_OPTIONS: Array<{ value: ConclusionFilter; label: string }> = [
  { value: 'all', label: '全部结论' },
  { value: 'pass', label: '通过' },
  { value: 'fail', label: '不建议通过' },
];

function matchesConclusionFilter(
  conclusion: DialogueAssessmentConclusion | undefined,
  filter: ConclusionFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }
  return normalizeBinaryDialogueConclusion(conclusion) === filter;
}

type TechnicalTaskRowActionsProps = {
  task: TechnicalScanTask;
  pending?: boolean;
  onDetail: (task: TechnicalScanTask) => void;
  onEdit: (task: TechnicalScanTask) => void;
  onRun: (task: TechnicalScanTask) => void;
  onPushRemediation: (task: TechnicalScanTask) => void;
  onWatchRemediation: (task: TechnicalScanTask) => void;
  onCopy: (task: TechnicalScanTask) => void;
  onReport: (task: TechnicalScanTask) => void;
  onStop: (task: TechnicalScanTask) => void;
  onDelete: (task: TechnicalScanTask) => void;
};

function technicalRunLabel(status: ScanStatus): string {
  return status === 'pending' ? '执行' : '重新执行';
}

function canRunTechnicalTask(status: ScanStatus): boolean {
  return status === 'pending' || isExecutionFinished(status);
}

function canReportTechnicalTask(status: ScanStatus): boolean {
  return isExecutionFinished(status);
}

function TechnicalTaskRowActions({
  task,
  pending = false,
  onDetail,
  onEdit,
  onRun,
  onPushRemediation,
  onWatchRemediation,
  onCopy,
  onReport,
  onStop,
  onDelete,
}: TechnicalTaskRowActionsProps) {
  const hasPendingPush = isExecutionFinished(task.status) && task.pendingPushCount > 0;

  return (
    <div className="flex justify-end">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${task.name}操作`} disabled={pending}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>操作</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDetail(task)}>
            <Eye className="h-4 w-4" />
            详情
          </DropdownMenuItem>
          {task.status === 'running' ? (
            <>
              <DropdownMenuItem onClick={() => onDetail(task)}>
                <Gauge className="h-4 w-4" />
                检测 {Math.min(100, task.progress)}%
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={pending}
                onClick={() => onStop(task)}
              >
                <Square className="h-4 w-4" />
                停止
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem disabled={pending} onClick={() => onEdit(task)}>
                <Pencil className="h-4 w-4" />
                编辑
              </DropdownMenuItem>
              {canRunTechnicalTask(task.status) ? (
                <DropdownMenuItem disabled={pending} onClick={() => onRun(task)}>
                  <Play className="h-4 w-4" />
                  {technicalRunLabel(task.status)}
                </DropdownMenuItem>
              ) : null}
              {hasPendingPush ? (
                <DropdownMenuItem disabled={pending} onClick={() => onPushRemediation(task)}>
                  <ClipboardCheck className="h-4 w-4" />
                  推送闭环 {task.pendingPushCount}
                </DropdownMenuItem>
              ) : isExecutionFinished(task.status) ? (
                <DropdownMenuItem onClick={() => onWatchRemediation(task)}>
                  <Gauge className="h-4 w-4" />
                  看整改
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem disabled={pending} onClick={() => onCopy(task)}>
                <Copy className="h-4 w-4" />
                复制
              </DropdownMenuItem>
              {canReportTechnicalTask(task.status) ? (
                <DropdownMenuItem onClick={() => onReport(task)}>
                  <FileText className="h-4 w-4" />
                  报告
                </DropdownMenuItem>
              ) : null}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={pending || task.status === 'running'}
            onClick={() => onDelete(task)}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type TaskStatusFilter = ExecutionDisplayStatus | 'all';

function isTaskStatusFilter(value: string): value is TaskStatusFilter {
  return ['all', 'pending', 'running', 'completed'].includes(value);
}

function TechnicalGovernanceStrip({ active = 1 }: { active?: number }) {
  const steps = ['资产入库', '检测扫描', '安全放行', '风险闭环', '上线观测', '报告审计'];
  return (
    <div className="flex gap-2 overflow-x-auto rounded-lg border bg-muted/30 p-2">
      {steps.map((step, index) => (
        <div key={step} className="flex min-w-fit items-center gap-2">
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs',
              index <= active
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground',
            )}
          >
            {index + 1}
          </span>
          <span
            className={cn(
              'text-xs',
              index === active ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {step}
          </span>
          {index < steps.length - 1 ? <span className="text-muted-foreground">›</span> : null}
        </div>
      ))}
    </div>
  );
}

function TechnicalAssessmentHero() {
  const pillars = [
    {
      title: '① 创建任务',
      desc: '选择目标 Agent · 组件级 / Agent API / 整体检测 · 马上执行或稍后配置',
      tone: 'ingest' as const,
    },
    {
      title: '② 确认方案与场景包',
      desc: '从安全用例库选取检测样本与判断依据 · 执行前检查与推荐场景包',
      tone: 'ack' as const,
    },
    {
      title: '③ Findings 与闭环',
      desc: '复核风险发现 · 推送整改 · 复测验证后进入报告审计',
      tone: 'admit' as const,
    },
  ];

  return (
    <div className="qs-hero">
      <div className="qs-hero-main">
        <div className="qs-kicker">Dialogue Security</div>
        <h2>对话安全评估 — 从这里开始</h2>
        <p className="qs-hero-desc">
          完成<strong>创建任务</strong> → <strong>确认对象与评估方案</strong> →{' '}
          <strong>推荐场景包</strong> → <strong>Findings 复核与整改闭环</strong>
          <span> · 模拟真实、异常与恶意用户对话，面向首次上线、变更、整改复测与周期评估编排。</span>
        </p>
        <div className="qs-pillars">
          {pillars.map((pillar) => (
            <div key={pillar.title} className={`qs-pillar ${pillar.tone}`}>
              <b>{pillar.title}</b>
              <span>{pillar.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TechnicalRiskDetectionPage({
  autoOpenCreate = false,
  initialCreateAssetId,
}: {
  autoOpenCreate?: boolean;
  initialCreateAssetId?: string;
} = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TaskStatusFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [assetFilter, setAssetFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [conclusionFilter, setConclusionFilter] = useState<ConclusionFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [createAssetId, setCreateAssetId] = useState(initialCreateAssetId || '');
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TechnicalScanTask | null>(null);
  const [stopTarget, setStopTarget] = useState<TechnicalScanTask | null>(null);
  const createDeepLinkConsumedRef = useRef(false);

  useEffect(() => {
    if (!autoOpenCreate || createDeepLinkConsumedRef.current) {
      return;
    }
    createDeepLinkConsumedRef.current = true;
    setEditTaskId(null);
    setCreateAssetId(initialCreateAssetId || '');
    setCreateOpen(true);
    void navigate({
      to: '/scan/technical-risks',
      search: {},
      replace: true,
    });
  }, [autoOpenCreate, initialCreateAssetId, navigate]);
  const tasksQuery = useQuery({
    queryKey: ['security-scan-tasks', keyword],
    queryFn: () =>
      detectionScanningApi.listTasks({
        limit: 100,
        search: keyword || undefined,
      }),
    refetchInterval: (query) =>
      shouldPollScanTasks(query.state.data) ? RUNNING_TASK_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
  });
  const findingsQuery = useQuery({
    queryKey: ['security-scan-findings', 'technical-risks'],
    queryFn: () => detectionScanningApi.listFindings({ limit: 100, status: 'open' }),
    refetchInterval: () =>
      shouldPollScanTasks(tasksQuery.data) ? RUNNING_TASK_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
  });
  const runMutation = useMutation({
    mutationFn: (task: TechnicalScanTask) =>
      detectionScanningApi.executeTask(task.id, {
        mode: 'manual',
        generateFindings: true,
      }),
    onMutate: (task) => {
      queryClient.setQueryData<{ data?: SecurityScanTask[] | null }>(
        ['security-scan-tasks', keyword],
        (current) =>
          current
            ? {
                ...current,
                data: (current.data || []).map((item) =>
                  item.id === task.id
                    ? { ...item, status: 'running', progress: Math.max(item.progress || 0, 12) }
                    : item,
                ),
              }
            : current,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['security-remediations'] }),
        queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] }),
      ]);
      toast.success('检测完成，已生成发现项，请确认后推送到风险闭环');
    },
    onError: (error: Error) => toast.error(error.message || '任务执行失败'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
    },
  });
  const pushRemediationMutation = useMutation({
    mutationFn: (task: TechnicalScanTask) =>
      detectionScanningApi.pushTechnicalFindingsToRemediation(task.id),
    onSuccess: async (result, task) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['security-remediations'] }),
        queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] }),
      ]);
      toast.success(`已推送 ${result.pushed} 项技术风险到风险闭环`, {
        action: {
          label: '查看',
          onClick: () =>
            navigate({
              to: '/scan/remediation',
              search: { tab: 'workbench', taskId: task.id, riskId: undefined },
            }),
        },
      });
    },
    onError: (error: Error) => toast.error(error.message || '推送失败'),
  });
  const stopMutation = useMutation({
    mutationFn: (taskId: string) => detectionScanningApi.updateTask(taskId, { status: 'canceled' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
      toast.success('任务已停止');
    },
    onError: (error: Error) => toast.error(error.message || '停止任务失败'),
  });
  const copyMutation = useMutation({
    mutationFn: (task: TechnicalScanTask) =>
      detectionScanningApi.createTask({
        assetId: task.raw.assetId ?? undefined,
        name: `${task.raw.name} 副本`,
        source: task.raw.source,
        scanType: task.raw.scanType,
        targetKind: task.raw.targetKind,
        targetSummary: task.raw.targetSummary ?? undefined,
        ownerName: task.raw.ownerName ?? undefined,
        runConfig: task.raw.runConfig ?? undefined,
        metadata: {
          ...(task.raw.metadata || {}),
          copiedFromTaskId: task.id,
        },
        plans:
          task.raw.plans?.map((plan) => ({
            probeType: plan.probeType,
            strategy: plan.strategy,
            enabled: plan.enabled,
            libIds: plan.libIds,
            caseCount: plan.caseCount,
            targets: plan.targets,
            metadata: plan.metadata,
          })) ?? [],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
      toast.success('任务副本已创建');
    },
    onError: (error: Error) => toast.error(error.message || '复制任务失败'),
  });
  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => detectionScanningApi.deleteTask(taskId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
      setDeleteTarget(null);
      toast.success('任务已删除');
    },
    onError: (error: Error) => toast.error(error.message || '删除任务失败'),
  });
  const taskRows = useMemo<TechnicalScanTask[]>(() => {
    const pendingPushByTask = new Map<string, number>();
    for (const finding of (findingsQuery.data?.data || []) as SecurityScanFinding[]) {
      if (!finding.remediationTaskId) {
        pendingPushByTask.set(finding.taskId, (pendingPushByTask.get(finding.taskId) || 0) + 1);
      }
    }
    return (tasksQuery.data?.data || [])
      .filter(
        (task: SecurityScanTask) =>
          task.scanType === 'agent_api' &&
          task.source !== 'risk_retest' &&
          task.source !== 'capability_audit' &&
          !isPatrolTask(task),
      )
      .map((task: SecurityScanTask) => {
        const statusValue = task.status;
        const taskFindings = ((findingsQuery.data?.data || []) as SecurityScanFinding[]).filter(
          (finding) => finding.taskId === task.id,
        );
        const stats = computeDialogueTaskStats(task, taskFindings, statusValue);
        const assessment =
          task.scanType === 'agent_api'
            ? resolveDialogueAssessmentSummary(task, stats, statusValue)
            : null;
        return {
          id: task.id,
          name: task.name,
          asset: task.assetName || '未关联资产',
          assetCode: task.assetCode || '—',
          assetVersion: task.assetVersion,
          source: task.source,
          scanType: task.scanType,
          target: task.targetSummary || task.targetKind,
          status: statusValue,
          progress: task.progress,
          pendingPushCount: pendingPushByTask.get(task.id) || 0,
          high: task.highCount,
          medium: task.mediumCount,
          low: task.lowCount,
          owner: task.ownerName || '未指派',
          createdAt: task.createdAt,
          passRate: assessment?.passRate,
          passRateThreshold: assessment?.threshold,
          assessmentConclusion: assessment?.conclusion,
          assessmentLabel: assessment?.label,
          raw: task,
        };
      });
  }, [findingsQuery.data, tasksQuery.data]);
  const assetOptions = useMemo(
    () => [...new Set(taskRows.map((task) => task.asset).filter(Boolean))].sort(),
    [taskRows],
  );
  const ownerOptions = useMemo(
    () => [...new Set(taskRows.map((task) => task.owner).filter(Boolean))].sort(),
    [taskRows],
  );
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return taskRows.filter((task) => {
      if (!matchesExecutionStatusFilter(task.status, status)) {
        return false;
      }
      if (assetFilter !== 'all' && task.asset !== assetFilter) {
        return false;
      }
      if (ownerFilter !== 'all' && task.owner !== ownerFilter) {
        return false;
      }
      if (!matchesConclusionFilter(task.assessmentConclusion, conclusionFilter)) {
        return false;
      }
      if (!kw) {
        return true;
      }
      return [
        task.id,
        task.name,
        task.asset,
        task.assetCode,
        task.scanType,
        task.target,
        task.owner,
      ]
        .join(' ')
        .toLowerCase()
        .includes(kw);
    });
  }, [assetFilter, conclusionFilter, keyword, ownerFilter, status, taskRows]);
  const hasTaskRows = taskRows.length > 0;
  const hasActiveFilters =
    keyword.trim() !== '' ||
    status !== 'all' ||
    assetFilter !== 'all' ||
    ownerFilter !== 'all' ||
    conclusionFilter !== 'all';
  const resetFilters = () => {
    setKeyword('');
    setStatus('all');
    setAssetFilter('all');
    setOwnerFilter('all');
    setConclusionFilter('all');
  };
  const rowActionPending =
    runMutation.isPending ||
    pushRemediationMutation.isPending ||
    stopMutation.isPending ||
    copyMutation.isPending ||
    deleteMutation.isPending;
  const openTaskDetail = (task: TechnicalScanTask) => {
    void navigate({
      to: '/scan/technical-risks/$taskId',
      params: { taskId: task.id },
    });
  };
  const openTaskEdit = (task: TechnicalScanTask) => {
    setCreateAssetId('');
    setEditTaskId(task.id);
    setCreateOpen(true);
  };
  const openTaskRemediation = (task: TechnicalScanTask) => {
    navigate({
      to: '/scan/remediation',
      search: { tab: 'workbench', taskId: task.id, riskId: undefined },
    });
  };
  const handleStopTask = (task: TechnicalScanTask) => {
    setStopTarget(task);
  };
  const handleDeleteTask = (task: TechnicalScanTask) => {
    if (task.status === 'running') {
      toast.error('检测中的任务请先停止后再删除');
      return;
    }
    setDeleteTarget(task);
  };

  return (
    <Shell>
      <TechnicalGovernanceStrip active={1} />
      <TechnicalAssessmentHero />
      <Card className="min-w-0 rounded-[20px]">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>对话安全评估任务列表</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                搜索、筛选与管理对话安全评估任务 · 操作：详情 · 重新运行 · 复制 · 推送闭环 · 报告
              </p>
            </div>
            <Button
              onClick={() => {
                setEditTaskId(null);
                setCreateAssetId('');
                setCreateOpen(true);
              }}
            >
              + 创建评估任务
            </Button>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Input
                className="h-9 bg-background sm:col-span-2 xl:col-span-1"
                placeholder="搜索任务名称"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <Select
                value={status}
                onValueChange={(value) => {
                  if (isTaskStatusFilter(value)) {
                    setStatus(value);
                  }
                }}
              >
                <SelectTrigger className="h-9 w-full bg-background">
                  <SelectValue placeholder="执行状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="pending">待执行</SelectItem>
                  <SelectItem value="running">检测中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assetFilter} onValueChange={setAssetFilter}>
                <SelectTrigger className="h-9 w-full bg-background">
                  <SelectValue placeholder="检测对象" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部检测对象</SelectItem>
                  {assetOptions.map((asset) => (
                    <SelectItem key={asset} value={asset}>
                      {asset}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-9 w-full bg-background">
                  <SelectValue placeholder="负责人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部负责人</SelectItem>
                  {ownerOptions.map((owner) => (
                    <SelectItem key={owner} value={owner}>
                      {owner}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={conclusionFilter}
                onValueChange={(value) => {
                  if (value === 'all' || value === 'pass' || value === 'fail') {
                    setConclusionFilter(value);
                  }
                }}
              >
                <SelectTrigger className="h-9 w-full bg-background">
                  <SelectValue placeholder="结论" />
                </SelectTrigger>
                <SelectContent>
                  {CONCLUSION_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'all', label: '全部' },
              { value: 'pending', label: '待执行' },
              { value: 'running', label: '检测中' },
              { value: 'completed', label: '已完成' },
            ].map((chip) => (
              <button
                key={chip.value}
                type="button"
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                  status === chip.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground',
                )}
                onClick={() => {
                  if (isTaskStatusFilter(chip.value)) {
                    setStatus(chip.value);
                  }
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          <Table className="min-w-[1000px] table-fixed">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[14%]" />
              <col className="w-[17%]" />
              <col className="w-[17%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">任务</TableHead>
                <TableHead className="px-4">检测对象</TableHead>
                <TableHead className="px-4">结论</TableHead>
                <TableHead className="px-4">进度</TableHead>
                <TableHead className="px-4">用例命中数量</TableHead>
                <TableHead className="px-4">负责人</TableHead>
                <TableHead className="px-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-4 py-16">
                    <div className="mx-auto flex max-w-md flex-col items-center text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-primary/30 bg-primary/5 text-primary">
                        <ClipboardCheck className="h-7 w-7" />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">
                        {hasTaskRows ? '暂无匹配的评估任务' : '暂无对话安全评估任务'}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {hasTaskRows
                          ? '当前筛选条件下没有任务数据，调整筛选项或清空条件后再查看。'
                          : '创建评估任务后，检测进度、用例命中数量与评估结论会在这里展示。'}
                      </p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        {hasTaskRows && hasActiveFilters ? (
                          <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                            清空筛选
                          </Button>
                        ) : null}
                        {hasTaskRows ? null : (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setEditTaskId(null);
                              setCreateAssetId('');
                              setCreateOpen(true);
                            }}
                          >
                            + 创建评估任务
                          </Button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((task) => {
                  return (
                    <TableRow
                      key={task.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openTaskDetail(task)}
                    >
                      <TableCell className="px-4 align-top">
                        <div className="font-medium break-words whitespace-normal">{task.name}</div>
                      </TableCell>
                      <TableCell className="px-4 align-top">
                        <div className="break-words whitespace-normal">{task.asset}</div>
                      </TableCell>
                      <TableCell className="px-4 align-top whitespace-normal">
                        {task.assessmentConclusion ? (
                          <div className="space-y-1">
                            <TaskConclusionBadge conclusion={task.assessmentConclusion} />
                            {task.passRate != null && task.passRateThreshold != null ? (
                              <div className="text-xs leading-snug text-muted-foreground">
                                通过率 {task.passRate}% / 阈值 {task.passRateThreshold}%
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 align-top whitespace-normal">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <StatusBadge status={task.status} />
                          <span className="text-xs text-muted-foreground">{task.progress}%</span>
                        </div>
                        <Progress value={task.progress} />
                      </TableCell>
                      <TableCell className="px-4 align-top">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="border-orange-200 text-orange-700">
                            高 {task.high}
                          </Badge>
                          <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                            低 {task.low}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 align-top">
                        <div className="break-words whitespace-normal">{task.owner}</div>
                      </TableCell>
                      <TableCell
                        className="px-4 text-right align-top"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <TechnicalTaskRowActions
                          task={task}
                          pending={rowActionPending}
                          onDetail={openTaskDetail}
                          onEdit={openTaskEdit}
                          onRun={(row) => runMutation.mutate(row)}
                          onPushRemediation={(row) => pushRemediationMutation.mutate(row)}
                          onWatchRemediation={openTaskRemediation}
                          onCopy={(row) => copyMutation.mutate(row)}
                          onReport={(row) =>
                            void navigate({
                              to: '/reports/audit-center/$taskId',
                              params: { taskId: row.id },
                              search: { category: 'security' },
                            })
                          }
                          onStop={handleStopTask}
                          onDelete={handleDeleteTask}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <DialogueSecurityWizardDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setEditTaskId(null);
            setCreateAssetId('');
          }
        }}
        initialAssetId={createAssetId || undefined}
        editTaskId={editTaskId}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
          queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] });
          queryClient.invalidateQueries({ queryKey: ['security-remediations'] });
          queryClient.invalidateQueries({ queryKey: ['asset-agents'] });
        }}
      />
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader className="text-start">
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>删除对话安全评估任务？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  将删除任务「
                  <span className="font-medium text-foreground">{deleteTarget?.name}</span>
                  」及相关评估记录，此操作不可恢复。
                </p>
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">
                  若需要保留审计依据，请先进入详情导出报告或原始数据。
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTarget || deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConfirmDialog
        open={Boolean(stopTarget)}
        onOpenChange={(open) => {
          if (!open && !stopMutation.isPending) {
            setStopTarget(null);
          }
        }}
        title="停止检测任务？"
        desc={`确定停止任务「${stopTarget?.name ?? '该任务'}」？`}
        cancelBtnText="取消"
        confirmText={stopMutation.isPending ? '停止中…' : '确认停止'}
        destructive
        isLoading={stopMutation.isPending}
        handleConfirm={() => {
          if (stopTarget) {
            stopMutation.mutate(stopTarget.id, {
              onSettled: () => setStopTarget(null),
            });
          }
        }}
      />
    </Shell>
  );
}

export {
  RemediationCenterPage,
  RiskClosedLoopPage,
} from '@/features/risk-closed-loop/risk-closed-loop-page';
export {
  SecurityCaseLibraryPage,
  TechnicalCaseLibraryPage,
} from '@/features/technical-case-library';
export { CapabilityRiskLibraryPage } from './capability-component-library-page';
