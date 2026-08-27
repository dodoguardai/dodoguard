import { useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, Info, Play, Plus, Scale, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { COMPLIANCE_DOMAINS, MetricCard, Shell } from '@/features/compliance-case-library/shared';
import '@/features/compliance-detection/compliance-hero.css';

import { ComplianceReportOverlay } from '@/features/compliance-detection/compliance-report-overlay';
import { ComplianceTaskRowActions } from '@/features/compliance-detection/compliance-task-row-actions';
import {
  type ComplianceScanStatus,
  type ComplianceTaskRow,
  complianceScanStatusClass,
  complianceScanStatusText,
  mapComplianceTaskRow,
} from '@/features/compliance-detection/compliance-task-shared';
import { ComplianceTaskTemplateCard } from '@/features/compliance-detection/compliance-task-template-card';
import { ComplianceTaskTemplateDetailDialog } from '@/features/compliance-detection/compliance-task-template-detail-dialog';
import { ComplianceTaskTemplateDialog } from '@/features/compliance-detection/compliance-task-template-dialog';
import { ComplianceTaskWizardDialog } from '@/features/compliance-detection/compliance-task-wizard-dialog';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type { ComplianceDetailPanel } from '@/features/compliance-detection/compliance-task-detail-utils';
import type { ComplianceTaskTemplate, SecurityScanTask } from '@/types/entities';

const COMPLIANCE_SCAN_TYPE = '合规检测';
const RUNNING_TASK_REFETCH_INTERVAL_MS = 10_000;

const taskStatusFilterValues = [
  'all',
  'pending',
  'running',
  'completed',
  'blocked',
  'canceled',
] as const;
type TaskStatusFilter = (typeof taskStatusFilterValues)[number];

function isTaskStatusFilter(value: string): value is TaskStatusFilter {
  return taskStatusFilterValues.includes(value as TaskStatusFilter);
}

function normalizeScanTasks(
  payload: { data?: SecurityScanTask[] | null } | undefined,
): SecurityScanTask[] {
  const raw = payload?.data;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((task): task is SecurityScanTask => Boolean(task?.id));
}

const TASK_TEMPLATE_DOMAINS = ['全部', ...COMPLIANCE_DOMAINS] as const;

function ComplianceGovernanceStrip({ active = 1 }: { active?: number }) {
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

function ComplianceAssessmentHero() {
  const pillars = [
    {
      title: '① 创建任务',
      desc: '选择目标 Agent · 关联金融监管要求、内部制度与已审核话术规则 · 支持模版快速发起',
      tone: 'ingest' as const,
    },
    {
      title: '② 输出内容检查',
      desc: '自动扫描智能体输出 · 识别敏感泄露、错误承诺、误导营销与权益表述不当等问题',
      tone: 'ack' as const,
    },
    {
      title: '③ 风险提示与确认',
      desc: '生成风险提示与建议改写 · 由客户合规或法务人员确认最终结论',
      tone: 'admit' as const,
    },
  ];

  return (
    <div className="qs-hero">
      <div className="qs-hero-main">
        <div className="qs-kicker">Output Compliance</div>
        <h2>输出内容合规评估 — 从这里开始</h2>
        <p className="qs-hero-desc">
          依据<strong>金融监管要求</strong>、<strong>客户内部制度</strong>与
          <strong>已审核话术规则</strong>
          ，对智能体输出内容自动检查，识别敏感信息泄露、错误承诺、误导性营销等问题，并给出风险提示与建议改写
          <span> · 最终合规结论由客户合规或法务人员确认。</span>
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

function StatusBadge({ status }: { status: ComplianceScanStatus }) {
  return (
    <Badge
      variant="outline"
      className={complianceScanStatusClass[status] ?? complianceScanStatusClass.pending}
    >
      {complianceScanStatusText[status] ?? status}
    </Badge>
  );
}

async function buildTaskCopyPayload(task: SecurityScanTask) {
  const metadata = { ...(task.metadata ?? {}) };
  const templateId =
    typeof metadata.templateId === 'string' && metadata.templateId.trim()
      ? metadata.templateId
      : undefined;
  return {
    assetId: task.assetId ?? undefined,
    name: `${task.name} 副本`,
    source: '任务复制',
    scanType: task.scanType,
    targetKind: task.targetKind,
    targetSummary: task.targetSummary ?? undefined,
    ownerName: task.ownerName ?? undefined,
    templateId,
    runConfig: task.runConfig ?? undefined,
    metadata,
    plans:
      task.plans?.map((plan) => ({
        probeType: plan.probeType,
        strategy: plan.strategy,
        enabled: plan.enabled,
        libIds: plan.libIds,
        caseCount: plan.caseCount,
        targets: plan.targets,
      })) ?? [],
  };
}

export function ComplianceDetectionTasksPage({
  initialDetailTaskId = null,
  initialDetailPanel = 'overview',
  autoOpenCreate = false,
  initialCreateAssetId,
}: {
  initialDetailTaskId?: string | null;
  initialDetailPanel?: ComplianceDetailPanel;
  autoOpenCreate?: boolean;
  initialCreateAssetId?: string;
} = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [taskTab, setTaskTab] = useState(0);
  const [status, setStatus] = useState<TaskStatusFilter>('all');
  const [domainFilter, setDomainFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardAssetId, setWizardAssetId] = useState(initialCreateAssetId || '');
  const [wizardTemplateId, setWizardTemplateId] = useState<string | null>(null);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [rowActionTaskId, setRowActionTaskId] = useState<string | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<ComplianceTaskRow | null>(null);
  const [stopTaskTarget, setStopTaskTarget] = useState<ComplianceTaskRow | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateDomain, setTemplateDomain] = useState('全部');
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ComplianceTaskTemplate | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<ComplianceTaskTemplate | null>(
    null,
  );
  const [detailTemplateId, setDetailTemplateId] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(initialDetailTaskId);
  const [detailPanel, setDetailPanel] = useState<ComplianceDetailPanel>(initialDetailPanel);
  const [rerunningTaskId, setRerunningTaskId] = useState<string | null>(null);
  const createDeepLinkConsumedRef = useRef(false);

  useEffect(() => {
    setDetailTaskId(initialDetailTaskId);
    setDetailPanel(initialDetailPanel);
  }, [initialDetailTaskId, initialDetailPanel]);

  useEffect(() => {
    if (!autoOpenCreate || createDeepLinkConsumedRef.current) {
      return;
    }
    createDeepLinkConsumedRef.current = true;
    setWizardTemplateId(null);
    setEditTaskId(null);
    setWizardAssetId(initialCreateAssetId || '');
    setWizardOpen(true);
    void navigate({
      to: '/scan/compliance-tasks',
      search: {},
      replace: true,
    });
  }, [autoOpenCreate, initialCreateAssetId, navigate]);

  const tasksQuery = useQuery({
    queryKey: ['compliance-scan-tasks', status, keyword],
    queryFn: () =>
      detectionScanningApi.listTasks({
        limit: 100,
        scanType: COMPLIANCE_SCAN_TYPE,
        status,
        search: keyword || undefined,
      }),
    refetchInterval: (query) => {
      const list = normalizeScanTasks(query.state.data);
      const now = Date.now();
      const recentPendingMs = 3 * 60 * 1000;
      const hasRunning = list.some((task) => task.status === 'running');
      const hasRecentPending = list.some((task) => {
        if (task.status !== 'pending') {
          return false;
        }
        const created = new Date(task.createdAt).getTime();
        return Number.isFinite(created) && now - created < recentPendingMs;
      });
      const isRerunning = Boolean(rerunningTaskId);
      return hasRunning || hasRecentPending || isRerunning
        ? RUNNING_TASK_REFETCH_INTERVAL_MS
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const librariesQuery = useQuery({
    queryKey: ['compliance-case-libraries', 'task-metrics'],
    queryFn: () => detectionScanningApi.listAllCaseLibraries({ category: 'compliance' }),
  });

  const templatesQuery = useQuery({
    queryKey: ['compliance-task-templates', templateSearch, templateDomain],
    queryFn: () =>
      detectionScanningApi.listComplianceTaskTemplates({
        limit: 100,
        search: templateSearch || undefined,
        domain: templateDomain,
      }),
    enabled: taskTab === 1,
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => detectionScanningApi.deleteComplianceTaskTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-task-templates'] });
      setDeleteTemplateTarget(null);
      toast.success('模版已删除');
    },
    onError: (error: Error) => toast.error(error.message || '删除失败'),
  });

  const runMutation = useMutation({
    mutationFn: (task: ComplianceTaskRow) =>
      detectionScanningApi.executeTask(task.id, {
        mode: 'manual',
        generateFindings: true,
      }),
    onMutate: (task) => {
      setRerunningTaskId(task.id);
      toast.loading('正在重新执行合规评估…', { id: `compliance-rerun-${task.id}` });
      queryClient.setQueryData(
        ['compliance-task', task.id],
        (current: SecurityScanTask | undefined) =>
          current ? { ...current, status: 'running', progress: 10 } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['compliance-task', task.id] });
      void queryClient.invalidateQueries({ queryKey: ['compliance-report-preview', task.id] });
    },
    onSuccess: (_data, task) => {
      queryClient.invalidateQueries({ queryKey: ['compliance-scan-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['security-remediations'] });
      queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-task', task.id] });
      queryClient.invalidateQueries({ queryKey: ['compliance-report-preview', task.id] });
      toast.success('合规评估已完成，可在任务详情中确认后推送到风险闭环', {
        id: `compliance-rerun-${task.id}`,
      });
    },
    onError: (error: Error, task) => {
      toast.error(error.message || '任务执行失败', { id: `compliance-rerun-${task.id}` });
      void queryClient.invalidateQueries({ queryKey: ['compliance-task', task.id] });
      void queryClient.invalidateQueries({ queryKey: ['compliance-report-preview', task.id] });
    },
    onSettled: (_data, _error, task) => {
      setRowActionTaskId(null);
      setRerunningTaskId(null);
      if (task) {
        void queryClient.invalidateQueries({ queryKey: ['compliance-task', task.id] });
        void queryClient.invalidateQueries({ queryKey: ['compliance-report-preview', task.id] });
      }
    },
  });

  const stopMutation = useMutation({
    mutationFn: (taskId: string) => detectionScanningApi.updateTask(taskId, { status: 'canceled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-scan-tasks'] });
      toast.success('任务已停止');
    },
    onError: (error: Error) => toast.error(error.message || '停止任务失败'),
    onSettled: () => setRowActionTaskId(null),
  });

  const copyMutation = useMutation({
    mutationFn: async (task: ComplianceTaskRow) => {
      const source = task.raw.assetId ? task.raw : await detectionScanningApi.getTask(task.id);
      return detectionScanningApi.createTask(await buildTaskCopyPayload(source));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-scan-tasks'] });
      toast.success('任务副本已创建');
    },
    onError: (error: Error) => toast.error(error.message || '复制任务失败'),
    onSettled: () => setRowActionTaskId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => detectionScanningApi.deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-scan-tasks'] });
      setDeleteTaskTarget(null);
      toast.success('任务已删除');
    },
    onError: (error: Error) => toast.error(error.message || '删除任务失败'),
    onSettled: () => setRowActionTaskId(null),
  });

  const rowActionPending =
    runMutation.isPending ||
    stopMutation.isPending ||
    copyMutation.isPending ||
    deleteMutation.isPending;

  const taskRows = useMemo<ComplianceTaskRow[]>(() => {
    return normalizeScanTasks(tasksQuery.data).map(mapComplianceTaskRow);
  }, [tasksQuery.data]);

  const openTaskDetail = (task: ComplianceTaskRow, panel: ComplianceDetailPanel = 'overview') => {
    setDetailTaskId(task.id);
    setDetailPanel(panel);
    void navigate({
      to: '/scan/compliance-tasks/$taskId',
      params: { taskId: task.id },
      search: { panel: panel === 'full' ? 'full' : undefined },
    });
  };

  const handleCloseTaskDetail = () => {
    setDetailTaskId(null);
    setDetailPanel('overview');
    const historyIndex = Number(window.history.state?.idx ?? 0);
    if (historyIndex > 0) {
      window.history.back();
      return;
    }
    void navigate({ to: '/scan/compliance-tasks', search: {} });
  };

  const handleOverlayEdit = (taskId: string) => {
    setWizardTemplateId(null);
    setWizardAssetId('');
    setEditTaskId(taskId);
    setWizardOpen(true);
  };

  const handleOverlayRerun = (taskId: string) => {
    const task = taskRows.find((row) => row.id === taskId);
    if (task) {
      handleRerun(task);
    }
  };

  const handleRerun = (task: ComplianceTaskRow) => {
    setRowActionTaskId(task.id);
    runMutation.mutate(task);
  };

  const handleCopy = (task: ComplianceTaskRow) => {
    setRowActionTaskId(task.id);
    copyMutation.mutate(task);
  };

  const handleStop = (task: ComplianceTaskRow) => {
    setStopTaskTarget(task);
  };

  const handleEdit = (task: ComplianceTaskRow) => {
    setWizardTemplateId(null);
    setWizardAssetId('');
    setEditTaskId(task.id);
    setWizardOpen(true);
  };

  const handleDelete = (task: ComplianceTaskRow) => {
    if (task.status === 'running') {
      toast.error('检测中的任务请先停止后再删除');
      return;
    }
    setDeleteTaskTarget(task);
  };

  const openCreateWizard = () => {
    setWizardTemplateId(null);
    setEditTaskId(null);
    setWizardAssetId('');
    setWizardOpen(true);
  };

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return taskRows.filter((task) => {
      if (status !== 'all' && task.status !== status) {
        return false;
      }
      if (domainFilter !== 'all' && task.domain !== domainFilter) {
        return false;
      }
      if (!kw) {
        return true;
      }
      return [task.id, task.name, task.asset, task.assetCode, task.target, task.domain]
        .join(' ')
        .toLowerCase()
        .includes(kw);
    });
  }, [keyword, status, domainFilter, taskRows]);

  const enabledLibraries = (librariesQuery.data?.data ?? []).filter((item) => item.enabled).length;
  const runningCount = taskRows.filter((item) => item.status === 'running').length;
  const violationCount = taskRows.reduce((sum, item) => sum + item.high + item.medium, 0);
  const templates = templatesQuery.data?.data ?? [];

  const openWizardWithTemplate = (templateId: string) => {
    setEditTaskId(null);
    setWizardAssetId('');
    setWizardTemplateId(templateId);
    setWizardOpen(true);
  };

  const handleDeleteTemplate = (template: ComplianceTaskTemplate) => {
    if (template.isSystem) {
      toast.error('平台预置模版不可删除');
      return;
    }
    setDeleteTemplateTarget(template);
  };

  return (
    <Shell>
      <ComplianceGovernanceStrip active={1} />
      <ComplianceAssessmentHero />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          icon={Scale}
          label="合规任务"
          value={String(taskRows.length)}
          hint="合规检测任务台账"
        />
        <MetricCard
          icon={Play}
          label="执行中"
          value={String(runningCount)}
          hint="扫描与判定进行中"
        />
        <MetricCard
          icon={ShieldAlert}
          label="违规项"
          value={String(violationCount)}
          hint="高/中危合规结论"
        />
        <MetricCard
          icon={CheckCircle2}
          label="启用控制库"
          value={String(enabledLibraries)}
          hint="可纳入评测方案"
        />
      </div>

      <Card className="min-w-0 overflow-hidden rounded-[20px]">
        <CardHeader className="space-y-4">
          <div className="flex w-fit gap-2 rounded-[14px] bg-muted/50 p-1.5">
            <button
              type="button"
              className={cn(
                'rounded-[10px] px-3 py-2 text-sm font-bold transition-colors',
                taskTab === 0 ? 'bg-background shadow-sm' : 'text-muted-foreground',
              )}
              onClick={() => setTaskTab(0)}
            >
              合规任务列表
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 rounded-[10px] px-3 py-2 text-sm font-bold transition-colors',
                taskTab === 1 ? 'bg-background shadow-sm' : 'text-muted-foreground',
              )}
              onClick={() => setTaskTab(1)}
            >
              合规任务模版
              <span title="预置评估方案，可一键创建任务">
                <Info className="h-3.5 w-3.5" aria-label="预置评估方案，可一键创建任务" />
              </span>
            </button>
          </div>

          {taskTab === 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>合规任务列表</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    搜索、筛选与管理评估任务 · 操作：详情 · 重新运行 · 复制 · 编辑 · 报告
                  </p>
                </div>
                <Button onClick={openCreateWizard}>+ 创建合规任务</Button>
              </div>
              <div className="flex flex-col gap-2 lg:flex-row">
                <Input
                  className="w-full lg:w-72"
                  placeholder="搜索任务 / Agent / 领域"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                <Select value={domainFilter} onValueChange={setDomainFilter}>
                  <SelectTrigger className="w-full lg:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部合规域</SelectItem>
                    {COMPLIANCE_DOMAINS.map((domain) => (
                      <SelectItem key={domain} value={domain}>
                        {domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    if (isTaskStatusFilter(value)) {
                      setStatus(value);
                    }
                  }}
                >
                  <SelectTrigger className="w-full lg:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="pending">待执行</SelectItem>
                    <SelectItem value="running">检测中</SelectItem>
                    <SelectItem value="completed">已完成</SelectItem>
                    <SelectItem value="blocked">已阻塞</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: '全部' },
                  { value: 'pending', label: '待执行' },
                  { value: 'running', label: '检测中' },
                  { value: 'completed', label: '已完成' },
                  { value: 'blocked', label: '已阻塞' },
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
            </div>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <CardTitle>合规任务模版</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  预置评估方案，可一键创建任务并进入 6 步向导。
                </p>
              </div>
              <Button
                onClick={() => {
                  setEditingTemplate(null);
                  setTemplateDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                新建模版
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="min-w-0">
          {taskTab === 1 ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <Input
                  className="max-w-md rounded-[12px]"
                  placeholder="搜索模版名称、描述或范围…"
                  value={templateSearch}
                  onChange={(event) => setTemplateSearch(event.target.value)}
                />
                <Select value={templateDomain} onValueChange={setTemplateDomain}>
                  <SelectTrigger className="w-full max-w-[200px] rounded-[12px]">
                    <SelectValue placeholder="合规域" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TEMPLATE_DOMAINS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {templatesQuery.isLoading ? (
                <p className="py-12 text-center text-sm text-muted-foreground">加载模版中…</p>
              ) : templates.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">暂无合规任务模版</p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() => {
                      setEditingTemplate(null);
                      setTemplateDialogOpen(true);
                    }}
                  >
                    新建模版
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {templates.map((template) => (
                    <ComplianceTaskTemplateCard
                      key={template.id}
                      template={template}
                      deletePending={deleteTemplateMutation.isPending}
                      onUse={(item) => openWizardWithTemplate(item.id)}
                      onView={(item) => setDetailTemplateId(item.id)}
                      onEdit={(item) => {
                        setEditingTemplate(item);
                        setTemplateDialogOpen(true);
                      }}
                      onDelete={handleDeleteTemplate}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : rows.length === 0 && !tasksQuery.isLoading ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">暂无合规检测任务</p>
              <p className="mt-1 text-xs text-muted-foreground">
                使用页头或列表上方「创建合规任务」发起评估
              </p>
            </div>
          ) : (
            <Table className="min-w-[1120px] table-fixed">
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[20%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[8%]" />
                <col className="w-[72px]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">任务名称</TableHead>
                  <TableHead className="px-4">Agent</TableHead>
                  <TableHead className="px-4">合规域</TableHead>
                  <TableHead className="px-4">状态</TableHead>
                  <TableHead className="px-4">结果</TableHead>
                  <TableHead className="px-4">负责人</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="px-4">
                      <button
                        type="button"
                        className="block max-w-full truncate text-left font-medium hover:text-primary hover:underline"
                        onClick={() => openTaskDetail(task)}
                        title={task.name}
                      >
                        {task.name}
                      </button>
                    </TableCell>
                    <TableCell className="truncate px-4" title={task.asset}>
                      {task.asset}
                    </TableCell>
                    <TableCell className="px-4">
                      <Badge variant="outline" className="border-violet-200 text-violet-700">
                        {task.domain}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="mb-2 flex items-center gap-2">
                        <StatusBadge status={task.status} />
                        <span className="text-xs text-muted-foreground">{task.progress}%</span>
                      </div>
                      <Progress value={task.progress} />
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="border-orange-200 text-orange-700">
                          高 {task.high}
                        </Badge>
                        <Badge variant="outline" className="border-amber-200 text-amber-700">
                          中 {task.medium}
                        </Badge>
                        <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                          低 {task.low}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="truncate px-4" title={task.owner}>
                      {task.owner}
                    </TableCell>
                    <TableCell className="align-middle">
                      <ComplianceTaskRowActions
                        task={task}
                        pending={rowActionPending && rowActionTaskId === task.id}
                        onDetail={openTaskDetail}
                        onRerun={handleRerun}
                        onCopy={handleCopy}
                        onEdit={handleEdit}
                        onReport={(row) => openTaskDetail(row, 'full')}
                        onWatchScan={openTaskDetail}
                        onStop={handleStop}
                        onDelete={handleDelete}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ComplianceTaskWizardDialog
        open={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) {
            setWizardTemplateId(null);
            setEditTaskId(null);
            setWizardAssetId('');
          }
        }}
        initialAssetId={wizardAssetId || undefined}
        initialTemplateId={wizardTemplateId}
        editTaskId={editTaskId}
      />

      <ComplianceTaskTemplateDialog
        open={templateDialogOpen}
        onOpenChange={(open) => {
          setTemplateDialogOpen(open);
          if (!open) {
            setEditingTemplate(null);
          }
        }}
        template={editingTemplate}
      />

      <ComplianceTaskTemplateDetailDialog
        templateId={detailTemplateId}
        open={Boolean(detailTemplateId)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailTemplateId(null);
          }
        }}
        onUseTemplate={(template) => {
          setDetailTemplateId(null);
          openWizardWithTemplate(template.id);
        }}
      />
      {detailTaskId ? (
        <ComplianceReportOverlay
          taskId={detailTaskId}
          open
          initialPanel={detailPanel}
          onClose={handleCloseTaskDetail}
          onEdit={handleOverlayEdit}
          onRerun={handleOverlayRerun}
          isExecuting={Boolean(
            detailTaskId && (rerunningTaskId === detailTaskId || rowActionTaskId === detailTaskId),
          )}
        />
      ) : null}
      <AlertDialog
        open={Boolean(deleteTaskTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTaskTarget(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader className="text-start">
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>删除输出内容合规评估任务？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  将删除任务「
                  <span className="font-medium text-foreground">{deleteTaskTarget?.name}</span>
                  」及相关合规评估记录，此操作不可恢复。
                </p>
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">
                  若需要留存合规审计依据，请先进入详情导出报告或保存结果。
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTaskTarget || deleteMutation.isPending}
              onClick={() => {
                if (deleteTaskTarget) {
                  setRowActionTaskId(deleteTaskTarget.id);
                  deleteMutation.mutate(deleteTaskTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConfirmDialog
        open={Boolean(stopTaskTarget)}
        onOpenChange={(open) => {
          if (!open && !stopMutation.isPending) {
            setStopTaskTarget(null);
          }
        }}
        title="停止合规检测任务？"
        desc={`确定停止任务「${stopTaskTarget?.name ?? '该任务'}」？`}
        cancelBtnText="取消"
        confirmText={stopMutation.isPending ? '停止中…' : '确认停止'}
        destructive
        isLoading={stopMutation.isPending}
        handleConfirm={() => {
          if (stopTaskTarget) {
            setRowActionTaskId(stopTaskTarget.id);
            stopMutation.mutate(stopTaskTarget.id, {
              onSettled: () => setStopTaskTarget(null),
            });
          }
        }}
      />
      <AlertDialog
        open={Boolean(deleteTemplateTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteTemplateMutation.isPending) {
            setDeleteTemplateTarget(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader className="text-start">
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>删除合规任务模版？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  将删除模版「
                  <span className="font-medium text-foreground">{deleteTemplateTarget?.name}</span>
                  」。已创建的评估任务不会被删除。
                </p>
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">
                  删除后无法再用该模版快速创建新的合规评估任务。
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTemplateMutation.isPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTemplateTarget || deleteTemplateMutation.isPending}
              onClick={() => {
                if (deleteTemplateTarget) {
                  deleteTemplateMutation.mutate(deleteTemplateTarget.id);
                }
              }}
            >
              {deleteTemplateMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
