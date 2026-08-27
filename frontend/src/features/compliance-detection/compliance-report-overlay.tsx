import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  ChevronDown,
  ClipboardCheck,
  Download,
  FileCode2,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  type ComplianceScanStatus,
  complianceScanStatusClass,
  complianceScanStatusText,
  readComplianceScanStatus,
} from '@/features/compliance-detection/compliance-task-shared';
import '@/features/compliance-detection/compliance-task-detail.css';
import '@/features/compliance-detection/compliance-full-report.css';

import {
  ComplianceCaseExecutionDrawer,
  TaskDetailCasesPanel,
  TaskDetailFindingsPanel,
  TaskDetailHeroSection,
  TaskDetailLibraryStatsPanel,
  TaskDetailOverviewPanel,
  TaskDetailPushPanel,
  TaskDetailStatStrip,
} from '@/features/compliance-detection/compliance-task-detail-panels';
import {
  COMPLIANCE_DETAIL_TABS,
  type ComplianceDetailPanel,
  type ComplianceDetailTab,
  computeConclusionMeta,
  computeScoreMeta,
  computeTaskDetailStats,
  formatTaskDuration,
  panelToTab,
  readCompliancePassRateThreshold,
} from '@/features/compliance-detection/compliance-task-detail-utils';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import { reportsApi } from '@/services/api/reports';
import type { SecurityScanTask } from '@/types/entities';

import type { ComplianceCaseExecutionResult } from './compliance-report-types';

const RUNNING_TASK_REFETCH_INTERVAL_MS = 10_000;

const ComplianceFullReportView = lazy(() =>
  import('@/features/compliance-detection/compliance-full-report-view').then((module) => ({
    default: module.ComplianceFullReportView,
  })),
);

type ReportExportFormat = 'pdf' | 'html' | 'docx' | 'md';

export { computeComplianceScore } from '@/features/compliance-detection/compliance-task-detail-utils';
export type { ComplianceDetailPanel } from '@/features/compliance-detection/compliance-task-detail-utils';

type ComplianceReportOverlayProps = {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  initialPanel?: ComplianceDetailPanel;
  onEdit?: (taskId: string) => void;
  onRerun?: (taskId: string) => void;
  isExecuting?: boolean;
  presentation?: 'portal' | 'inline';
};

function TaskStatusBadge({ status }: { status: ComplianceScanStatus }) {
  return (
    <Badge
      variant="outline"
      className={complianceScanStatusClass[status] ?? complianceScanStatusClass.pending}
    >
      {complianceScanStatusText[status] ?? status}
    </Badge>
  );
}

export function ComplianceReportOverlay({
  taskId,
  open,
  onClose,
  initialPanel = 'overview',
  onEdit,
  onRerun,
  isExecuting = false,
  presentation = 'portal',
}: ComplianceReportOverlayProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ComplianceDetailTab>(() => panelToTab(initialPanel));
  const [reportMode, setReportMode] = useState(initialPanel === 'full');
  const [pushConfirmOpen, setPushConfirmOpen] = useState(false);
  const [pushCaseIds, setPushCaseIds] = useState<string[] | undefined>(undefined);
  const [pushSuccessCount, setPushSuccessCount] = useState<number | null>(null);
  const [caseSearch, setCaseSearch] = useState('');
  const [caseStatusFilter, setCaseStatusFilter] = useState<'' | 'pass' | 'fail'>('');
  const [casePage, setCasePage] = useState(1);
  const [selectedCase, setSelectedCase] = useState<ComplianceCaseExecutionResult | null>(null);

  useEffect(() => {
    if (open) {
      setActiveTab(panelToTab(initialPanel));
      setReportMode(initialPanel === 'full');
      setCaseSearch('');
      setCaseStatusFilter('');
      setCasePage(1);
      setSelectedCase(null);
    }
  }, [open, initialPanel, taskId]);

  useEffect(() => {
    if (open && presentation === 'portal') {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.classList.add('cmp-task-detail-open');
      return () => {
        document.body.style.overflow = previousOverflow;
        document.body.classList.remove('cmp-task-detail-open');
      };
    }
  }, [open, presentation]);

  const taskQuery = useQuery({
    queryKey: ['compliance-task', taskId],
    queryFn: () => detectionScanningApi.getTask(taskId!),
    enabled: open && Boolean(taskId),
    refetchInterval: (query) => {
      const task = query.state.data;
      const status = task ? readComplianceScanStatus(task) : null;
      if (isExecuting || status === 'pending' || status === 'running') {
        return RUNNING_TASK_REFETCH_INTERVAL_MS;
      }
      return false;
    },
    refetchIntervalInBackground: true,
  });

  const reportQuery = useQuery({
    queryKey: ['compliance-report-preview', taskId],
    queryFn: () => detectionScanningApi.getComplianceReportPreview(taskId!),
    enabled: open && Boolean(taskId),
    refetchInterval: () => {
      const cachedTask = queryClient.getQueryData<SecurityScanTask>(['compliance-task', taskId]);
      const status = cachedTask ? readComplianceScanStatus(cachedTask) : null;
      if (isExecuting || status === 'pending' || status === 'running') {
        return RUNNING_TASK_REFETCH_INTERVAL_MS;
      }
      return false;
    },
    refetchIntervalInBackground: true,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['compliance-report-preview', taskId] });
    void queryClient.invalidateQueries({ queryKey: ['compliance-scan-tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['compliance-task', taskId] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
  }, [queryClient, taskId]);

  const finalizeMutation = useMutation({
    mutationFn: () => detectionScanningApi.finalizeComplianceReport(taskId!),
    onSuccess: () => {
      toast.success('报告已定稿并写入报告中心');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '定稿失败'),
  });

  const overrideMutation = useMutation({
    mutationFn: ({ caseId, passed }: { caseId: string; passed: boolean }) =>
      detectionScanningApi.overrideComplianceReportItem(taskId!, caseId, {
        passed,
      }),
    onSuccess: () => {
      toast.success('用例覆核结果已更新');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '覆核失败'),
  });

  const pushMutation = useMutation({
    mutationFn: (caseIds?: string[]) =>
      detectionScanningApi.pushComplianceViolationsToRemediation(taskId!, {
        caseIds,
      }),
    onSuccess: (result) => {
      const pushedTaskId = taskId;
      toast.success(`已推送 ${result.pushed} 项违规到风险闭环`);
      setPushSuccessCount(result.pushed);
      setPushConfirmOpen(false);
      setPushCaseIds(undefined);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['security-remediations'] });
      void queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] });
      onClose();
      if (pushedTaskId) {
        void navigate({
          to: '/scan/remediation',
          search: { tab: 'workbench', taskId: pushedTaskId, riskId: undefined },
        });
      }
    },
    onError: (error: Error) => toast.error(error.message || '推送失败'),
  });

  const downloadBlob = useCallback(
    (blob: Blob, options: { format: ReportExportFormat; reportId: string }) => {
      const currentReport = reportQuery.data;
      const baseName =
        (currentReport?.reportNo || currentReport?.taskName || taskId || options.reportId)
          .replace(/[/\\?%*:|"<>]/g, '_')
          .replace(/\s+/g, ' ')
          .trim() || `report-${options.reportId}`;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${baseName}.${options.format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    },
    [reportQuery.data, taskId],
  );

  const exportReportMutation = useMutation({
    mutationFn: async (format: ReportExportFormat) => {
      const currentReport = reportQuery.data;
      if (!taskId || !currentReport) {
        throw new Error('报告数据尚未加载');
      }
      if (!currentReport.canFinalize && !currentReport.finalizedReportId) {
        throw new Error('当前报告尚不可定稿导出，请先完成合规检测');
      }
      const finalized = await detectionScanningApi.finalizeComplianceReport(taskId);
      const reportId = finalized.reportId;
      const blob = await reportsApi.download({ reportId, format });
      return { blob, format, reportId };
    },
    onSuccess: ({ blob, format, reportId }) => {
      downloadBlob(blob, { format, reportId });
      toast.success('报告已生成并开始下载');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '导出失败'),
  });

  const handleExportReport = useCallback(
    (format: ReportExportFormat) => {
      exportReportMutation.mutate(format);
    },
    [exportReportMutation],
  );

  const handleExportPdf = useCallback(() => {
    handleExportReport('pdf');
  }, [handleExportReport]);

  const handleExportHtml = useCallback(() => {
    handleExportReport('html');
  }, [handleExportReport]);

  const handleExportDocx = useCallback(() => {
    handleExportReport('docx');
  }, [handleExportReport]);

  const handleExportMarkdown = useCallback(() => {
    handleExportReport('md');
  }, [handleExportReport]);

  const handleExportJson = useCallback(() => {
    const report = reportQuery.data;
    if (!report) {
      return;
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${report.reportNo || taskId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [reportQuery.data, taskId]);

  const handleExportCsv = useCallback(() => {
    const report = reportQuery.data;
    if (!report) {
      return;
    }
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const evidenceText = (item: ComplianceCaseExecutionResult) =>
      item.evidenceChain?.length
        ? item.evidenceChain.map((entry) => `${entry.label}：${entry.value}`).join('\n')
        : '';
    const rows = [
      [
        'caseId',
        'caseCode',
        'caseName',
        'libraryTitle',
        'sampleType',
        'passed',
        'riskLevel',
        'regClause',
        'controlItem',
        'prompt',
        'expectedPass',
        'expectedFail',
        'agentOutput',
        'violationSnippet',
        'judgeMode',
        'judgmentRule',
        'judgeConfidence',
        'judgeScore',
        'recommendation',
        'executionStatus',
        'violationNo',
        'pushStatus',
        'findingId',
        'remediationId',
        'evidenceChain',
      ],
      ...report.items.map((item) => [
        item.caseId,
        item.caseCode,
        item.caseName,
        item.libraryTitle || '',
        item.sampleType || '',
        item.passed ? '合规' : '违规',
        item.riskLevel || '',
        item.regClause || '',
        item.controlItem || '',
        item.prompt || item.inputSummary || '',
        item.expectedPass || '',
        item.expectedFail || '',
        item.outputSnippet || '',
        item.violationSnippet || '',
        item.judgeMode || '',
        item.judgmentRule || '',
        item.judgeConfidence ?? '',
        item.judgeScore ?? '',
        item.recommendation || '',
        item.executionStatus || '',
        item.violationNo || '',
        item.pushStatus || '',
        item.findingId || '',
        item.remediationId || '',
        evidenceText(item),
      ]),
    ];
    const content = rows.map((row) => row.map(escape).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${report.reportNo || taskId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [reportQuery.data, taskId]);

  const report = reportQuery.data;
  const task = taskQuery.data;
  const taskStatus: ComplianceScanStatus = task
    ? readComplianceScanStatus(task)
    : readComplianceScanStatus({
        status: (report?.taskStatus as ComplianceScanStatus | undefined) ?? 'pending',
      } as Parameters<typeof readComplianceScanStatus>[0]);
  const stats = computeTaskDetailStats(report, taskStatus);
  const conclusion = computeConclusionMeta(report, stats, taskStatus, task?.progress ?? 0);
  const scoreMeta = computeScoreMeta(report, stats, taskStatus, task?.progress ?? 0);
  const passRateThreshold = readCompliancePassRateThreshold(report);
  const violationItems = report?.items.filter((item) => !item.passed) ?? [];
  const pendingPushItems = violationItems.filter((item) => item.pushStatus !== 'pushed');
  const pendingPushCount = pendingPushItems.length;
  const pushConfirmCount = pushCaseIds?.length ?? pendingPushCount;

  const openPushConfirm = useCallback(
    (caseIds?: string[]) => {
      const count = caseIds?.length ?? pendingPushCount;
      if (count <= 0) {
        toast.error('暂无可推送的违规项');
        return;
      }
      setPushCaseIds(caseIds);
      setPushConfirmOpen(true);
    },
    [pendingPushCount],
  );

  const isMutating =
    finalizeMutation.isPending ||
    overrideMutation.isPending ||
    pushMutation.isPending ||
    exportReportMutation.isPending;
  const duration = formatTaskDuration(task?.startedAt, task?.completedAt);
  const statsText = report
    ? `总条数 ${stats.total}（合规 ${stats.pass} · 违规 ${stats.fail}${stats.pending ? ` · 待执行 ${stats.pending}` : ''}）`
    : task
      ? `${task.assetName || '未关联 Agent'} · 进度 ${task.progress ?? 0}%`
      : '';
  const tabCounts = {
    libraries: report?.libraries.length ?? 0,
    violations: violationItems.length,
    total: stats.total,
  };

  if (!open || !taskId) {
    return null;
  }

  const renderTabPanel = () => {
    if (!report && activeTab !== 0) {
      return (
        <div className="cmp-td-empty">
          <b>任务尚未产生报告数据</b>
          <p>请先运行合规评估</p>
          {onRerun && taskStatus !== 'running' ? (
            <Button className="mt-4" size="sm" onClick={() => onRerun(taskId)}>
              <Play className="mr-1 h-4 w-4" />
              立即运行
            </Button>
          ) : null}
        </div>
      );
    }

    switch (activeTab) {
      case 0:
        return report ? (
          <TaskDetailOverviewPanel
            report={report}
            task={task}
            stats={stats}
            taskStatus={taskStatus}
            onOpenFullReport={() => setReportMode(true)}
          />
        ) : (
          <div className="cmp-td-empty">
            <b>任务尚未产生报告数据</b>
            <p>请先运行合规评估</p>
          </div>
        );
      case 1:
        return (
          <TaskDetailLibraryStatsPanel report={report} stats={stats} taskStatus={taskStatus} />
        );
      case 2:
        return (
          <TaskDetailFindingsPanel
            items={violationItems}
            taskStatus={taskStatus}
            pendingPushCount={pendingPushCount}
            pushSuccessCount={pushSuccessCount}
            isPushing={pushMutation.isPending}
            onPushOne={(caseId) => openPushConfirm([caseId])}
            onPushBatch={() => openPushConfirm()}
            onGoRemediation={() =>
              void navigate({
                to: '/scan/remediation',
                search: { tab: undefined, taskId: taskId || undefined, riskId: undefined },
              })
            }
          />
        );
      case 3:
        return (
          <TaskDetailCasesPanel
            items={report?.items ?? []}
            taskStatus={taskStatus}
            search={caseSearch}
            statusFilter={caseStatusFilter}
            page={casePage}
            pageSize={10}
            onSearchChange={(value) => {
              setCaseSearch(value);
              setCasePage(1);
            }}
            onStatusFilterChange={(value) => {
              setCaseStatusFilter(value);
              setCasePage(1);
            }}
            onPageChange={setCasePage}
            onResetFilters={() => {
              setCaseSearch('');
              setCaseStatusFilter('');
              setCasePage(1);
            }}
            onRunTask={onRerun ? () => onRerun(taskId) : undefined}
            onRefresh={() => void reportQuery.refetch()}
            onSelectCase={setSelectedCase}
          />
        );
      case 4:
        return (
          <TaskDetailPushPanel
            report={report}
            task={task}
            stats={stats}
            taskStatus={taskStatus}
            violationItems={violationItems}
            pendingPushCount={pendingPushCount}
            pushSuccessCount={pushSuccessCount}
            isPushing={pushMutation.isPending}
            onPushBatch={() => openPushConfirm()}
            onGoRemediation={() =>
              void navigate({
                to: '/scan/remediation',
                search: { tab: undefined, taskId: taskId || undefined, riskId: undefined },
              })
            }
          />
        );
      default:
        return null;
    }
  };

  const detailContent = (
    <div
      id="cmpTaskDetailOverlay"
      role="dialog"
      aria-modal={presentation === 'portal' ? 'true' : undefined}
      aria-label="合规评估任务详情"
      className={cn(
        'cmp-task-fullscreen flex flex-col bg-background print:relative print:inset-auto',
        presentation === 'portal'
          ? 'fixed inset-0 z-[9999] shadow-2xl'
          : 'min-h-[calc(100svh-8rem)] overflow-hidden rounded-lg border shadow-sm',
      )}
    >
      <div className="cmp-task-fullscreen-inner">
        <div className="cmp-td-head">
          <div className="cmp-td-head-left">
            <button type="button" className="cmp-td-back" aria-label="返回" onClick={onClose}>
              ←
            </button>
            <div className="cmp-td-title-wrap">
              {reportQuery.isLoading && taskQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载任务详情中…
                </div>
              ) : (
                <>
                  <h2>
                    {reportMode
                      ? `合规评估报告 · ${report?.taskName || task?.name || '合规评估任务'}`
                      : report?.taskName || task?.name || '合规评估任务'}
                  </h2>
                  <div className="cmp-td-meta">
                    <TaskStatusBadge status={taskStatus} />
                    {report?.reportNo ? (
                      <code>{report.reportNo}</code>
                    ) : task ? (
                      <code>{task.id}</code>
                    ) : null}
                    <span>{statsText}</span>
                    {report?.status === 'finalized' ? <Badge>已定稿</Badge> : null}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="cmp-td-head-right print:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={reportQuery.isFetching || isMutating}
              onClick={() => void reportQuery.refetch()}
            >
              <RefreshCw className={cn('mr-1 h-4 w-4', reportQuery.isFetching && 'animate-spin')} />
              刷新
            </Button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!report || exportReportMutation.isPending}
                >
                  <Download className="mr-1 h-4 w-4" />
                  {exportReportMutation.isPending ? '导出中…' : '导出'}
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>报告模板导出</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleExportPdf}>
                  <FileText className="mr-2 h-4 w-4" />
                  PDF (.pdf)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportDocx}>
                  <FileText className="mr-2 h-4 w-4" />
                  Word (.docx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportHtml}>
                  <FileCode2 className="mr-2 h-4 w-4" />
                  HTML (.html)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportMarkdown}>
                  <FileCode2 className="mr-2 h-4 w-4" />
                  Markdown (.md)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>原始数据导出</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleExportJson}>
                  <FileJson className="mr-2 h-4 w-4" />
                  导出 JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCsv}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  导出 CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                isMutating ||
                pendingPushCount === 0 ||
                taskStatus === 'running' ||
                taskStatus === 'pending'
              }
              onClick={() => openPushConfirm()}
            >
              <ClipboardCheck className="mr-1 h-4 w-4" />
              推送到风险闭环
              {pendingPushCount > 0 ? ` (${pendingPushCount})` : ''}
            </Button>
            {onEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(taskId);
                }}
              >
                <Pencil className="mr-1 h-4 w-4" />
                编辑任务
              </Button>
            ) : null}
            {onRerun && taskStatus !== 'running' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onRerun(taskId)}>
                <Play className="mr-1 h-4 w-4" />
                {taskStatus === 'pending' ? '运行' : '重新运行'}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={reportMode ? 'default' : 'secondary'}
              onClick={() => setReportMode((value) => !value)}
            >
              完整报告
            </Button>
          </div>
        </div>

        <div className="cmp-td-body">
          {reportMode && report ? (
            <Suspense fallback={<div className="cmp-td-loading">正在加载完整报告…</div>}>
              <ComplianceFullReportView
                report={report}
                task={task}
                taskStatus={taskStatus}
                stats={stats}
                onBack={() => setReportMode(false)}
                onFinalize={report.canFinalize ? () => finalizeMutation.mutate() : undefined}
                canFinalize={report.canFinalize}
                isFinalizing={finalizeMutation.isPending}
                onGoRemediation={() =>
                  void navigate({
                    to: '/scan/remediation',
                    search: { tab: undefined, taskId: taskId || undefined, riskId: undefined },
                  })
                }
                onSelectCase={setSelectedCase}
              />
            </Suspense>
          ) : (
            <>
              {report ? (
                <>
                  <TaskDetailHeroSection
                    conclusion={conclusion}
                    score={scoreMeta}
                    stats={stats}
                    onGotoTab={setActiveTab}
                  />
                  <TaskDetailStatStrip
                    stats={stats}
                    taskStatus={taskStatus}
                    duration={duration}
                    passRateThreshold={passRateThreshold}
                  />
                </>
              ) : null}

              <div className="cmp-td-sticky-tabs">
                <nav className="sd-td-tabs" aria-label="任务详情导航">
                  {COMPLIANCE_DETAIL_TABS.map((tabDef, index) => {
                    const count =
                      tabDef.countKey === 'libraries'
                        ? tabCounts.libraries
                        : tabDef.countKey === 'violations'
                          ? tabCounts.violations
                          : tabDef.countKey === 'total'
                            ? tabCounts.total
                            : null;
                    return (
                      <button
                        key={tabDef.label}
                        type="button"
                        className={cn('sd-td-tab', activeTab === index && 'active')}
                        onClick={() => setActiveTab(index as ComplianceDetailTab)}
                      >
                        {tabDef.label}
                        {count != null && count > 0 ? <span className="count">{count}</span> : null}
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="cmp-td-panel">{renderTabPanel()}</div>
            </>
          )}
        </div>
      </div>

      <AlertDialog open={pushConfirmOpen} onOpenChange={setPushConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认推送到风险闭环？</AlertDialogTitle>
            <AlertDialogDescription>
              将推送 {pushConfirmCount} 项违规到风险闭环，系统会为每条违规创建风险发现与整改任务。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pushMutation.isPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              disabled={pushMutation.isPending || pushConfirmCount <= 0}
              onClick={() => pushMutation.mutate(pushCaseIds)}
            >
              {pushMutation.isPending ? '推送中…' : '确认推送'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ComplianceCaseExecutionDrawer
        item={selectedCase}
        open={Boolean(selectedCase)}
        onClose={() => setSelectedCase(null)}
        container={
          typeof document !== 'undefined' ? document.getElementById('cmpTaskDetailOverlay') : null
        }
      />
    </div>
  );

  if (presentation === 'inline') {
    return detailContent;
  }

  return createPortal(detailContent, document.body);
}
