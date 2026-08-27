import { useCallback, useEffect, useMemo, useState } from 'react';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Play,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import '@/features/compliance-detection/compliance-task-detail.css';

import {
  DEFAULT_REPORT_BRAND_ORGANIZATION,
  normalizeReportBrandConfig,
  REPORT_BRAND_CONFIG_KEY,
} from '@/features/reports/report-brand-config';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import { reportsApi } from '@/services/api/reports';
import { systemConfigApi } from '@/services/api/system-config';
import { buildDialogueReportFileBaseName, buildDialogueReportHtml } from './dialogue-report-export';
import {
  DialogueCaseDrawer,
  DialogueCasesPanel,
  DialogueFindingDrawer,
  DialogueFindingsPanel,
  DialogueFullReportPanel,
  DialogueLibraryStatsPanel,
  DialoguePushPanel,
  DialogueTaskDetailHeroSection,
  DialogueTaskDetailOverviewPanel,
  DialogueTaskDetailStatStrip,
} from './dialogue-task-detail-panels';
import {
  buildDialogueCaseRows,
  collectTaskLibraryIds,
  computeDialogueConclusionMeta,
  computeDialogueScoreMeta,
  computeDialogueTaskStats,
  DIALOGUE_DETAIL_TABS,
  type DialogueCaseRow,
  type DialogueDetailPanel,
  type DialogueDetailTab,
  downloadCsv,
  downloadJson,
  EXECUTION_STATUS_CLASS,
  EXECUTION_STATUS_LABELS,
  formatTaskDuration,
  groupDialogueLibraryStats,
  normalizeExecutionDisplayStatus,
  panelToDialogueTab,
  readPassRateThreshold,
  resolveCaseActualOutputDisplay,
  resolveCasePromptDisplay,
  resolveFindingJudgeModeLabel,
} from './dialogue-task-detail-utils';
import type { DetectionScanStatus, SecurityScanFinding, SecurityScanTask } from '@/types/entities';

const RUNNING_TASK_REFETCH_INTERVAL_MS = 10_000;

function TaskStatusBadge({ status }: { status: DetectionScanStatus }) {
  const displayStatus = normalizeExecutionDisplayStatus(status);
  return (
    <Badge variant="outline" className={EXECUTION_STATUS_CLASS[displayStatus]}>
      {EXECUTION_STATUS_LABELS[displayStatus]}
    </Badge>
  );
}

type DialogueTaskDetailOverlayProps = {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  initialPanel?: DialogueDetailPanel;
  presentation?: 'portal' | 'inline';
};

export function DialogueTaskDetailOverlay({
  taskId,
  open,
  onClose,
  initialPanel = 'overview',
  presentation = 'inline',
}: DialogueTaskDetailOverlayProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DialogueDetailTab>(() =>
    panelToDialogueTab(initialPanel),
  );
  const [reportMode, setReportMode] = useState(initialPanel === 'full');
  const [pushConfirmOpen, setPushConfirmOpen] = useState(false);
  const [rerunConfirmOpen, setRerunConfirmOpen] = useState(false);
  const [pushFindingIds, setPushFindingIds] = useState<string[] | undefined>(undefined);
  const [pushSuccessCount, setPushSuccessCount] = useState<number | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<SecurityScanFinding | null>(null);
  const [selectedCase, setSelectedCase] = useState<DialogueCaseRow | null>(null);
  const [drawerHost, setDrawerHost] = useState<HTMLElement | null>(null);
  const [caseSearch, setCaseSearch] = useState('');
  const [caseStatusFilter, setCaseStatusFilter] = useState<'' | 'pass' | 'fail'>('');
  const [casePage, setCasePage] = useState(1);
  const casePageSize = 10;
  const [findingPage, setFindingPage] = useState(1);
  const findingPageSize = 10;
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveTab(panelToDialogueTab(initialPanel));
      setReportMode(initialPanel === 'full');
      setSelectedFinding(null);
      setSelectedCase(null);
      setPushSuccessCount(null);
      setCaseSearch('');
      setCaseStatusFilter('');
      setCasePage(1);
      setFindingPage(1);
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

  useEffect(() => {
    const host = document.getElementById('dialogueTdDrawerHost');
    setDrawerHost(host);
  }, [open]);

  const taskQuery = useQuery({
    queryKey: ['dialogue-task', taskId],
    queryFn: () => detectionScanningApi.getTask(taskId!),
    enabled: open && Boolean(taskId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return isExecuting || status === 'pending' || status === 'running'
        ? RUNNING_TASK_REFETCH_INTERVAL_MS
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const findingsQuery = useQuery({
    queryKey: ['dialogue-task-findings', taskId],
    queryFn: () => detectionScanningApi.listFindings({ taskId: taskId!, limit: 200 }),
    enabled: open && Boolean(taskId),
    refetchInterval: () => {
      const status = taskQuery.data?.status;
      return isExecuting || status === 'pending' || status === 'running'
        ? RUNNING_TASK_REFETCH_INTERVAL_MS
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const task = taskQuery.data;
  const allFindings = findingsQuery.data?.data || [];
  const rawTaskStatus = (task?.status || 'pending') as DetectionScanStatus;
  const taskStatus: DetectionScanStatus = isExecuting ? 'running' : rawTaskStatus;
  const taskProgress = task?.progress ?? 0;
  const libraryIds = useMemo(() => collectTaskLibraryIds(task), [task]);

  const testCaseQueries = useQueries({
    queries: libraryIds.map((libraryId) => ({
      queryKey: ['dialogue-task-cases', taskId, libraryId],
      queryFn: () => detectionScanningApi.listTestCases(libraryId),
      enabled: open && Boolean(taskId) && libraryIds.length > 0,
    })),
  });

  const testCases = useMemo(
    () => testCaseQueries.flatMap((query) => query.data || []),
    [testCaseQueries],
  );

  const caseRows = useMemo(
    () => buildDialogueCaseRows(task, testCases, allFindings, taskStatus),
    [task, testCases, allFindings, taskStatus],
  );
  const passRateThreshold = readPassRateThreshold(task);
  const stats = useMemo(
    () => computeDialogueTaskStats(task, allFindings, taskStatus),
    [task, allFindings, taskStatus],
  );
  const libraryGroups = useMemo(
    () => groupDialogueLibraryStats(task, allFindings, testCases),
    [task, allFindings, testCases],
  );
  const conclusion = useMemo(
    () => computeDialogueConclusionMeta(task, stats, taskStatus, taskProgress),
    [task, stats, taskStatus, taskProgress],
  );
  const scoreMeta = useMemo(
    () => computeDialogueScoreMeta(task, stats, taskStatus, taskProgress),
    [task, stats, taskStatus, taskProgress],
  );
  const duration = formatTaskDuration(task?.startedAt, task?.completedAt);
  const pendingPushCount = allFindings.filter((finding) => !finding.remediationTaskId).length;
  const pushedCount = allFindings.filter((finding) => finding.remediationTaskId).length;
  const canRetest = taskStatus === 'completed' && pushedCount > 0;

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['dialogue-task', taskId] });
    void queryClient.invalidateQueries({ queryKey: ['dialogue-task-findings', taskId] });
    void queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] });
    void queryClient.invalidateQueries({ queryKey: ['security-remediations'] });
  }, [queryClient, taskId]);

  const pushMutation = useMutation({
    mutationFn: (findingIds?: string[]) =>
      detectionScanningApi.pushTechnicalFindingsToRemediation(taskId!, {
        findingIds,
      }),
    onSuccess: (result) => {
      setPushSuccessCount(result.pushed);
      toast.success(`已推送 ${result.pushed} 项到风险闭环`);
      setPushConfirmOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '推送失败'),
  });

  const runMutation = useMutation({
    mutationFn: () =>
      detectionScanningApi.executeTask(taskId!, {
        mode: 'manual',
        generateFindings: true,
      }),
    onMutate: () => {
      setIsExecuting(true);
      setPushSuccessCount(null);
      queryClient.setQueryData<SecurityScanTask>(['dialogue-task', taskId], (current) =>
        current
          ? {
              ...current,
              status: 'running',
              progress: 12,
              highCount: 0,
              mediumCount: 0,
              lowCount: 0,
              metadata: {
                ...(current.metadata || {}),
                technicalExecutionResults: [],
              },
            }
          : current,
      );
      queryClient.setQueryData(['dialogue-task-findings', taskId], {
        data: [],
        total: 0,
        limit: 200,
        offset: 0,
      });
    },
    onSuccess: () => {
      toast.success('检测任务已重新运行完成');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '重新运行失败'),
    onSettled: () => {
      setIsExecuting(false);
    },
  });

  const handleRerun = () => {
    if (!task) {
      return;
    }
    setRerunConfirmOpen(true);
  };

  const openPushConfirm = (findingIds?: string[]) => {
    setPushFindingIds(findingIds);
    setPushConfirmOpen(true);
  };

  const pushConfirmCount = pushFindingIds?.length ?? pendingPushCount;

  const statsText = isExecuting
    ? `检测中 ${taskProgress}% · 计划 ${stats.total} 条用例`
    : `计划 ${stats.total}（有效执行 ${stats.pass + stats.fail}：通过 ${stats.pass} · 失败 ${stats.fail}）`;

  const tabCounts = {
    libraries: libraryGroups.length,
    findings: allFindings.length,
    total: caseRows.length || stats.total,
  };

  const handleExportJson = () => {
    if (!task) {
      return;
    }
    downloadJson(`dialogue-task-${task.id}.json`, { task, findings: allFindings, cases: caseRows });
  };

  const handleExportCsv = () => {
    if (!task) {
      return;
    }
    const csvCell = (value: unknown) => String(value ?? '');
    const readRowEvidence = (row: DialogueCaseRow) =>
      row.finding?.evidence && typeof row.finding.evidence === 'object'
        ? (row.finding.evidence as Record<string, unknown>)
        : {};
    const readJudgeReason = (row: DialogueCaseRow) => {
      const evidence = readRowEvidence(row);
      const judgeVerdict =
        row.judgeVerdict ||
        (evidence.judgeVerdict && typeof evidence.judgeVerdict === 'object'
          ? (evidence.judgeVerdict as Record<string, unknown>)
          : undefined);
      return (
        (typeof judgeVerdict?.reason === 'string' && judgeVerdict.reason) ||
        (typeof judgeVerdict?.reasoning === 'string' && judgeVerdict.reasoning) ||
        (typeof judgeVerdict?.analysis === 'string' && judgeVerdict.analysis) ||
        (typeof evidence.judgeReason === 'string' && evidence.judgeReason) ||
        ''
      );
    };
    const rows = [
      [
        'caseId',
        'caseCode',
        'caseName',
        'libraryTitle',
        'sampleType',
        'verdict',
        'riskLevel',
        'duration',
        'prompt',
        'agentOutput',
        'judgeMode',
        'judgeReason',
        'findingTitle',
        'findingDescription',
        'recommendation',
        'remediationTaskId',
      ],
      ...caseRows.map((row) => [
        csvCell(row.caseId),
        csvCell(row.caseCode),
        csvCell(row.caseName),
        csvCell(row.libraryTitle),
        csvCell(row.sampleType),
        csvCell(row.verdict),
        csvCell(row.riskLevel),
        csvCell(row.durationLabel),
        csvCell(resolveCasePromptDisplay(row)),
        csvCell(resolveCaseActualOutputDisplay(row)),
        csvCell(resolveFindingJudgeModeLabel(row.judgeMode ?? readRowEvidence(row).judgeMode)),
        csvCell(readJudgeReason(row)),
        csvCell(row.finding?.title),
        csvCell(row.finding?.description),
        csvCell(row.finding?.recommendation || row.expectedPass),
        csvCell(row.finding?.remediationTaskId),
      ]),
    ];
    downloadCsv(`dialogue-task-${task.id}-cases.csv`, rows);
  };

  const downloadBlob = useCallback((blob: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }, []);

  const buildReportHtmlSnapshot = useCallback(
    (assets?: { coverImageDataUri?: string; logoDataUri?: string; brandOrganization?: string }) => {
      if (!task) {
        throw new Error('任务数据尚未加载');
      }
      return buildDialogueReportHtml({
        task,
        stats,
        conclusion,
        findings: allFindings,
        caseRows,
        libraryGroups,
        passRateThreshold,
        coverImageDataUri: assets?.coverImageDataUri,
        logoDataUri: assets?.logoDataUri,
        brandOrganization: assets?.brandOrganization,
      });
    },
    [allFindings, caseRows, conclusion, libraryGroups, passRateThreshold, stats, task],
  );

  const reportBrandConfigQuery = useQuery({
    queryKey: ['system-config-key', REPORT_BRAND_CONFIG_KEY],
    queryFn: async () => {
      try {
        const row = await systemConfigApi.getByKey(REPORT_BRAND_CONFIG_KEY);
        return normalizeReportBrandConfig(row.value);
      } catch (error) {
        if ((error as { status?: number; code?: string })?.status === 404) {
          return normalizeReportBrandConfig(null);
        }
        throw error;
      }
    },
    enabled: open,
  });

  const loadReportAssets = useCallback(async () => {
    const [coverImageDataUri, logoDataUri] = await Promise.all([
      reportsApi.getAssetDataUri('cover-image').catch(() => undefined),
      reportsApi.getAssetDataUri('logo').catch(() => undefined),
    ]);
    return {
      coverImageDataUri,
      logoDataUri,
      brandOrganization:
        reportBrandConfigQuery.data?.organization || DEFAULT_REPORT_BRAND_ORGANIZATION,
    };
  }, [reportBrandConfigQuery.data?.organization]);

  const exportReportMutation = useMutation({
    mutationFn: async (format: 'pdf' | 'html') => {
      if (!task) {
        throw new Error('任务数据尚未加载');
      }
      const baseName = buildDialogueReportFileBaseName(task);
      const assets = await loadReportAssets();
      const html = buildReportHtmlSnapshot(assets);
      if (format === 'html') {
        return {
          blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
          fileName: `${baseName}.html`,
        };
      }
      const blob = await reportsApi.renderHtmlPdf({ title: baseName, html });
      return { blob, fileName: `${baseName}.pdf` };
    },
    onSuccess: ({ blob, fileName }) => {
      downloadBlob(blob, fileName);
      toast.success('报告已生成并开始下载');
    },
    onError: (error: Error) => toast.error(error.message || '导出失败'),
  });

  const handleExportReport = useCallback(
    (format: 'pdf' | 'html') => {
      exportReportMutation.mutate(format);
    },
    [exportReportMutation],
  );

  const renderTabPanel = () => {
    if (!task) {
      return <div className="cmp-td-loading">加载中…</div>;
    }
    switch (activeTab) {
      case 0:
        return (
          <DialogueTaskDetailOverviewPanel
            task={task}
            taskStatus={taskStatus}
            passRateThreshold={passRateThreshold}
            stats={stats}
            findings={allFindings}
            onOpenFullReport={() => setReportMode(true)}
          />
        );
      case 1:
        return (
          <DialogueLibraryStatsPanel
            groups={libraryGroups}
            taskStatus={taskStatus}
            passRateThreshold={passRateThreshold}
          />
        );
      case 2:
        return (
          <DialogueFindingsPanel
            findings={allFindings}
            taskStatus={taskStatus}
            pendingPushCount={pendingPushCount}
            pushSuccessCount={pushSuccessCount}
            page={findingPage}
            pageSize={findingPageSize}
            onPageChange={setFindingPage}
            libraryGroups={libraryGroups}
            onSelectFinding={(finding) => {
              setSelectedCase(null);
              setSelectedFinding(finding);
            }}
            onPushOne={(findingId) => openPushConfirm([findingId])}
            onPushBatch={() => openPushConfirm()}
            onGoRemediation={() =>
              void navigate({
                to: '/scan/remediation',
                search: { tab: 'workbench', taskId: taskId || undefined, riskId: undefined },
              })
            }
            isPushing={pushMutation.isPending}
          />
        );
      case 3:
        return (
          <DialogueCasesPanel
            items={caseRows}
            taskStatus={taskStatus}
            search={caseSearch}
            statusFilter={caseStatusFilter}
            page={casePage}
            pageSize={casePageSize}
            onSearchChange={(value) => {
              setCaseSearch(value);
              setCasePage(1);
            }}
            onStatusFilterChange={(value) => {
              setCaseStatusFilter(value);
              setCasePage(1);
            }}
            onPageChange={setCasePage}
            onRunTask={handleRerun}
            onRefresh={() => {
              void taskQuery.refetch();
              void findingsQuery.refetch();
            }}
            onSelectCase={(item: DialogueCaseRow) => {
              setSelectedFinding(null);
              setSelectedCase(item);
            }}
          />
        );
      case 4:
        return (
          <DialoguePushPanel
            task={task}
            stats={stats}
            taskStatus={taskStatus}
            findings={allFindings}
            pendingPushCount={pendingPushCount}
            pushedCount={pushedCount}
            pushSuccessCount={pushSuccessCount}
            isPushing={pushMutation.isPending}
            onPushBatch={() => openPushConfirm()}
            onGoRemediation={() =>
              void navigate({
                to: '/scan/remediation',
                search: { tab: 'workbench', taskId: taskId || undefined, riskId: undefined },
              })
            }
          />
        );
      default:
        return null;
    }
  };

  if (!open || !taskId) {
    return null;
  }

  const isMutating = pushMutation.isPending || runMutation.isPending;

  const detailContent = (
    <div
      id="dialogueTaskDetailOverlay"
      role="dialog"
      aria-modal={presentation === 'portal' ? 'true' : undefined}
      aria-label="对话安全评估任务详情"
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
              {taskQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载任务详情中…
                </div>
              ) : (
                <>
                  <h2>
                    {reportMode
                      ? `对话安全评估报告 · ${task?.name || '对话安全评估任务'}`
                      : task?.name || '对话安全评估任务'}
                  </h2>
                  <div className="cmp-td-meta">
                    <TaskStatusBadge status={taskStatus} />
                    <span>{statsText}</span>
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
              disabled={taskQuery.isFetching || findingsQuery.isFetching || isMutating}
              onClick={() => {
                void taskQuery.refetch();
                void findingsQuery.refetch();
              }}
            >
              <RefreshCw
                className={cn(
                  'mr-1 h-4 w-4',
                  (taskQuery.isFetching || findingsQuery.isFetching) && 'animate-spin',
                )}
              />
              刷新
            </Button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!task || exportReportMutation.isPending}
                >
                  <Download className="mr-1 h-4 w-4" />
                  {exportReportMutation.isPending ? '导出中…' : '导出'}
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>报告模板导出</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleExportReport('pdf')}>
                  <FileText className="mr-2 h-4 w-4" />
                  PDF (.pdf)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportReport('html')}>
                  <FileCode2 className="mr-2 h-4 w-4" />
                  HTML (.html)
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canRetest}
                      onClick={() =>
                        void navigate({
                          to: '/scan/remediation',
                          search: {
                            tab: 'workbench',
                            taskId: taskId || undefined,
                            riskId: undefined,
                          },
                        })
                      }
                    >
                      <RotateCcw className="mr-1 h-4 w-4" />
                      发起复测
                    </Button>
                  </span>
                </TooltipTrigger>
                {canRetest ? null : (
                  <TooltipContent>需先推送风险到闭环后才可发起复测</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {taskStatus !== 'running' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isMutating}
                onClick={handleRerun}
              >
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
          {isExecuting ? (
            <div className="mx-0 mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <Loader2 className="h-4 w-4 animate-spin" />
              对话安全检测执行中 · {taskProgress}% · 用例结果将在完成后刷新
            </div>
          ) : null}
          {reportMode && task ? (
            <DialogueFullReportPanel
              task={task}
              stats={stats}
              conclusion={conclusion}
              findings={allFindings}
              libraryGroups={libraryGroups}
              passRateThreshold={passRateThreshold}
              onBack={() => setReportMode(false)}
            />
          ) : (
            <>
              {task ? (
                <>
                  <DialogueTaskDetailHeroSection
                    conclusion={conclusion}
                    score={scoreMeta}
                    stats={stats}
                    onGotoTab={setActiveTab}
                  />
                  <DialogueTaskDetailStatStrip
                    stats={stats}
                    taskStatus={taskStatus}
                    duration={duration}
                    passRateThreshold={passRateThreshold}
                  />
                </>
              ) : null}

              <div className="cmp-td-sticky-tabs">
                <nav className="sd-td-tabs" aria-label="任务详情导航">
                  {DIALOGUE_DETAIL_TABS.map((tabDef, index) => {
                    const count =
                      tabDef.countKey === 'libraries'
                        ? tabCounts.libraries
                        : tabDef.countKey === 'findings'
                          ? tabCounts.findings
                          : tabDef.countKey === 'total'
                            ? tabCounts.total
                            : null;
                    return (
                      <button
                        key={tabDef.label}
                        type="button"
                        className={cn('sd-td-tab', activeTab === index && 'active')}
                        onClick={() => setActiveTab(index as DialogueDetailTab)}
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

      <div id="dialogueTdDrawerHost" />

      <AlertDialog open={pushConfirmOpen} onOpenChange={setPushConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认推送到风险闭环？</AlertDialogTitle>
            <AlertDialogDescription>
              将推送 {pushConfirmCount} 项对话安全风险到风险闭环，系统会为每条风险创建整改任务。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pushMutation.isPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              disabled={pushMutation.isPending || pushConfirmCount <= 0}
              onClick={() => pushMutation.mutate(pushFindingIds)}
            >
              {pushMutation.isPending ? '推送中…' : '确认推送'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConfirmDialog
        open={rerunConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !runMutation.isPending) {
            setRerunConfirmOpen(false);
          }
        }}
        title={taskStatus === 'pending' ? '运行检测任务？' : '重新运行检测任务？'}
        desc={`确定${taskStatus === 'pending' ? '运行' : '重新运行'}任务「${
          task?.name ?? '该任务'
        }」？将清除当前发现项并重新执行全部检测用例。`}
        cancelBtnText="取消"
        confirmText={runMutation.isPending ? '执行中…' : '确认执行'}
        destructive={taskStatus !== 'pending'}
        isLoading={runMutation.isPending}
        handleConfirm={() => {
          runMutation.mutate(undefined, {
            onSettled: () => setRerunConfirmOpen(false),
          });
        }}
      />

      <DialogueFindingDrawer
        finding={selectedFinding}
        open={Boolean(selectedFinding)}
        onClose={() => setSelectedFinding(null)}
        container={drawerHost}
        libraryGroups={libraryGroups}
      />

      <DialogueCaseDrawer
        item={selectedCase}
        open={Boolean(selectedCase)}
        onClose={() => setSelectedCase(null)}
        container={drawerHost}
      />
    </div>
  );

  return detailContent;
}
