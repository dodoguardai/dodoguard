import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Loader2,
  ScanSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MetricCard, PageHead, RiskBadge, Shell } from '@/features/compliance-case-library/shared';
import { RiskDetailDrawer } from '@/features/risk-closed-loop/risk-detail-drawer';
import { RiskRetestLogDrawer } from '@/features/risk-closed-loop/risk-retest-log-drawer';
import {
  RiskRetestResultDialog,
  type RetestResultItem,
} from '@/features/risk-closed-loop/risk-retest-result-dialog';
import {
  DialogueScanExecutionModal,
  type DialogueScanExecutionContext,
} from '@/features/detection-scanning/dialogue-scan-execution-modal';
import {
  RiskRetestWizardDialog,
  type RetestWizardSubmitPayload,
} from '@/features/risk-closed-loop/risk-retest-wizard-dialog';
import { RetestExecutionProgress } from '@/features/risk-closed-loop/retest-execution-progress';
import { RiskTaskTableView } from '@/features/risk-closed-loop/risk-task-table-view';
import {
  applyLiveRetestBatch,
  buildRetestTaskRunConfig,
  collectFailedCaseKeysFromTask,
  appendRetestHistoryEntry,
  collectRetestReports,
  computeRiskKpis,
  DISPLAY_STATUS_CLASS,
  DISPLAY_STATUS_LABEL,
  enrichRemediationRows,
  filterClosedLoopProductionRows,
  formatRemediationListTitle,
  formatTaskDisplayLabel,
  indexRetestExecutions,
  isRiskStillFailingAfterRetest,
  readTechnicalExecutionsFromTask,
  resolveRetestExecutionForRow,
  resolveRetestCapabilityTargets,
  resolveRiskRowLibraryLabel,
  filterRiskRows,
  GOVERNANCE_STEPS,
  groupByAgent,
  groupByDepartment,
  groupByOwner,
  groupByTask,
  isClosedDisplayStatus,
  isRetestActivelyRunning,
  isRetestAwaitingConfirm,
  LIST_MODE_LABELS,
  resolveRetestProgress,
  resolveRetestSelectedCaseIds,
  serializeRetestExecutionSnapshot,
  toRetestReportId,
  type ClosedSubTab,
  type EnrichedRiskRow,
  type LiveRetestProgress,
  type RiskClosedLoopTab,
  type RiskListMode,
  type RiskViewMode,
  type TaskRiskGroup,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type { SecurityRetestRun } from '@/services/api/detection-scanning';
import type { SecurityScanTask } from '@/types/entities';
import '@/features/risk-closed-loop/risk-closed-loop.css';

function GovernanceStrip({ active = 3 }: { active?: number }) {
  return (
    <div className="rrc-governance">
      {GOVERNANCE_STEPS.map((step, index) => (
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
          {index < GOVERNANCE_STEPS.length - 1 ? (
            <span className="text-muted-foreground">›</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ row }: { row: EnrichedRiskRow }) {
  return (
    <Badge variant="outline" className={DISPLAY_STATUS_CLASS[row.displayStatus]}>
      {DISPLAY_STATUS_LABEL[row.displayStatus]}
    </Badge>
  );
}

function RiskRowActions({
  row,
  busy,
  onSelect,
  onConfirm,
  onRetest,
}: {
  row: EnrichedRiskRow;
  busy?: boolean;
  onSelect: (row: EnrichedRiskRow) => void;
  onConfirm: (row: EnrichedRiskRow) => void;
  onRetest: (row: EnrichedRiskRow) => void;
}) {
  return (
    <div className="rrc-risk-row-actions">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => onSelect(row)}
      >
        详情
      </Button>
      {row.displayStatus === 'pending_confirm' ? (
        <Button type="button" size="sm" disabled={busy} onClick={() => onConfirm(row)}>
          确认
        </Button>
      ) : null}
      {row.displayStatus === 'pending_retest' || row.displayStatus === 'retest_failed' ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => onRetest(row)}
        >
          复测
        </Button>
      ) : null}
    </div>
  );
}

function FlatRiskTable({
  rows,
  selectedId,
  busy,
  onSelect,
  onConfirm,
  onRetest,
}: {
  rows: EnrichedRiskRow[];
  selectedId?: string | null;
  busy?: boolean;
  onSelect: (row: EnrichedRiskRow) => void;
  onConfirm: (row: EnrichedRiskRow) => void;
  onRetest: (row: EnrichedRiskRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        暂无匹配风险项。评估任务执行或合规推送后将在此出现。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="rrc-flat-risk-table">
        <div className="rrc-risk-row rrc-risk-row-head text-muted-foreground">
          <div>评估任务 / 风险标题</div>
          <div>场景库 / Agent</div>
          <div>责任人</div>
          <div>状态</div>
          <div className="text-right">操作</div>
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            className={cn('rrc-risk-row cursor-pointer', selectedId === row.id && 'active')}
            onClick={() => onSelect(row)}
          >
            <div className="min-w-0">
              <div className="font-medium leading-snug">
                {formatRemediationListTitle(row.title)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatTaskDisplayLabel(row.taskId, row.scanTask?.name || row.taskId)}
              </div>
            </div>
            <div className="min-w-0 text-xs">
              <div>{resolveRiskRowLibraryLabel(row)}</div>
              <div className="mt-1 text-muted-foreground">{row.agentName}</div>
            </div>
            <div className="text-xs">
              <div>{row.ownerName || '未指派'}</div>
              <div className="mt-1">
                <RiskBadge level={row.riskLevel} />
              </div>
            </div>
            <div>
              <StatusBadge row={row} />
            </div>
            <div className="rrc-risk-row-actions" onClick={(e) => e.stopPropagation()}>
              <RiskRowActions
                row={row}
                busy={busy}
                onSelect={onSelect}
                onConfirm={onConfirm}
                onRetest={onRetest}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RiskClosedLoopPage({
  initialTab = 'workbench',
  initialTaskId = null,
  initialRiskId = null,
}: {
  initialTab?: RiskClosedLoopTab;
  initialTaskId?: string | null;
  initialRiskId?: string | null;
} = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [sectionTab, setSectionTab] = useState<RiskClosedLoopTab>(initialTab);
  const [listMode, setListMode] = useState<RiskListMode>(initialTaskId ? 'task' : 'flat');
  const [viewMode, setViewMode] = useState<RiskViewMode>('list');
  const [search, setSearch] = useState(initialTaskId || initialRiskId || '');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [selectedRow, setSelectedRow] = useState<EnrichedRiskRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [retestWizardOpen, setRetestWizardOpen] = useState(false);
  const [retestWizardTaskId, setRetestWizardTaskId] = useState<string | null>(null);
  const [retestWizardRiskIds, setRetestWizardRiskIds] = useState<string[] | undefined>();
  const [retestLogGroup, setRetestLogGroup] = useState<TaskRiskGroup | null>(null);
  const [retestResultOpen, setRetestResultOpen] = useState(false);
  const [pendingRetestRows, setPendingRetestRows] = useState<EnrichedRiskRow[]>([]);
  const [pendingRetestPlanId, setPendingRetestPlanId] = useState('');
  const [pendingRetestTask, setPendingRetestTask] = useState<SecurityScanTask | null>(null);
  const [stopTaskTarget, setStopTaskTarget] = useState<{
    taskId: string;
    isRetest: boolean;
  } | null>(null);
  const [deleteTaskGroupTarget, setDeleteTaskGroupTarget] = useState<TaskRiskGroup | null>(null);
  const [retestRunningBatch, setRetestRunningBatch] = useState<{
    planId: string;
    taskId: string;
    retestTaskId?: string;
    rows: EnrichedRiskRow[];
    progress: number;
  } | null>(null);
  const [closedSubTab, setClosedSubTab] = useState<ClosedSubTab>('closed');
  const [retestExecutionContext, setRetestExecutionContext] =
    useState<DialogueScanExecutionContext | null>(null);

  // Prevent repeatedly "healing" stale retest-running rows on every re-render.
  const staleRetestCleanupDoneRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setSectionTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (initialTaskId) {
      setListMode('task');
      setSearch(initialTaskId);
      setExpandedTasks(new Set([initialTaskId]));
    }
  }, [initialTaskId]);

  useEffect(() => {
    if (initialRiskId) {
      setSearch(initialRiskId);
    }
  }, [initialRiskId]);

  const remediationsQuery = useQuery({
    queryKey: ['security-remediations', 'risk-closed-loop', initialTaskId],
    queryFn: () =>
      detectionScanningApi.listRemediations({
        limit: initialTaskId ? 100 : 200,
        taskId: initialTaskId || undefined,
      }),
  });
  const findingsQuery = useQuery({
    queryKey: ['security-scan-findings', 'risk-closed-loop', initialTaskId],
    queryFn: () =>
      detectionScanningApi.listFindings({
        limit: initialTaskId ? 100 : 200,
        taskId: initialTaskId || undefined,
      }),
  });
  const tasksQuery = useQuery({
    queryKey: ['security-scan-tasks', 'risk-closed-loop'],
    queryFn: () => detectionScanningApi.listTasks({ limit: 200 }),
  });

  const missingTaskIds = useMemo(() => {
    const remediations = remediationsQuery.data?.data || [];
    const known = new Set((tasksQuery.data?.data || []).map((task) => task.id));
    return [...new Set(remediations.map((row) => row.taskId).filter((id) => id && !known.has(id)))];
  }, [remediationsQuery.data?.data, tasksQuery.data?.data]);

  const missingTaskQueries = useQueries({
    queries: missingTaskIds.map((taskId) => ({
      queryKey: ['security-scan-task', taskId, 'risk-closed-loop-enrich'],
      queryFn: () => detectionScanningApi.getTask(taskId),
      staleTime: 60_000,
    })),
  });

  const mergedScanTasks = useMemo(() => {
    const base = (tasksQuery.data?.data || []).filter((task) => task.source !== 'risk_retest');
    const extras = missingTaskQueries
      .map((query) => query.data)
      .filter((task): task is NonNullable<typeof task> =>
        Boolean(task && task.source !== 'risk_retest'),
      );
    const byId = new Map<string, (typeof base)[number]>();
    for (const task of [...base, ...extras]) {
      byId.set(task.id, task);
    }
    return [...byId.values()];
  }, [missingTaskQueries, tasksQuery.data?.data]);

  const allEnrichedRows = useMemo(
    () =>
      enrichRemediationRows(
        remediationsQuery.data?.data || [],
        findingsQuery.data?.data || [],
        mergedScanTasks,
      ),
    [remediationsQuery.data?.data, findingsQuery.data?.data, mergedScanTasks],
  );

  const enrichedRows = useMemo(() => {
    const productionRows = filterClosedLoopProductionRows(allEnrichedRows);
    if (!initialTaskId && !initialRiskId) {
      return productionRows;
    }
    const scopedRows = allEnrichedRows.filter(
      (row) =>
        (initialTaskId && row.taskId === initialTaskId) ||
        (initialRiskId &&
          (row.id === initialRiskId ||
            row.findingId === initialRiskId ||
            row.violationNo === initialRiskId)),
    );
    const byId = new Map<string, EnrichedRiskRow>();
    for (const row of [...productionRows, ...scopedRows]) {
      byId.set(row.id, row);
    }
    return [...byId.values()];
  }, [allEnrichedRows, initialRiskId, initialTaskId]);

  useEffect(() => {
    if (!initialRiskId || enrichedRows.length === 0) {
      return;
    }
    const hit = enrichedRows.find(
      (row) =>
        row.id === initialRiskId ||
        row.findingId === initialRiskId ||
        row.violationNo === initialRiskId,
    );
    if (hit) {
      setSelectedRow(hit);
      setDrawerOpen(true);
    }
  }, [initialRiskId, enrichedRows]);

  const loopRows = useMemo(
    () =>
      applyLiveRetestBatch(
        enrichedRows,
        retestRunningBatch
          ? {
              planId: retestRunningBatch.planId,
              taskId: retestRunningBatch.taskId,
              progress: retestRunningBatch.progress,
              riskIds: retestRunningBatch.rows.map((row) => row.id),
            }
          : null,
      ),
    [enrichedRows, retestRunningBatch],
  );

  const kpis = useMemo(() => computeRiskKpis(loopRows), [loopRows]);

  const workbenchRows = useMemo(
    () => filterRiskRows(loopRows, { search, includeClosed: false }),
    [loopRows, search],
  );

  const boardPendingRetest = useMemo(
    () => filterRiskRows(enrichedRows, { boardColumn: 'pending_retest', search }),
    [enrichedRows, search],
  );
  const boardRetestFailed = useMemo(
    () => filterRiskRows(enrichedRows, { boardColumn: 'retest_failed', search }),
    [enrichedRows, search],
  );
  const boardClosed = useMemo(
    () => filterRiskRows(enrichedRows, { boardColumn: 'closed', search }),
    [enrichedRows, search],
  );

  const taskGroups = useMemo(() => groupByTask(workbenchRows), [workbenchRows]);
  const agentGroups = useMemo(() => groupByAgent(workbenchRows), [workbenchRows]);
  const deptGroups = useMemo(() => groupByDepartment(workbenchRows), [workbenchRows]);
  const ownerGroups = useMemo(() => groupByOwner(workbenchRows), [workbenchRows]);

  const retestSourceTaskIds = useMemo(
    () => [...new Set(loopRows.map((row) => row.taskId).filter(Boolean))],
    [loopRows],
  );

  const retestRunsQueries = useQueries({
    queries: retestSourceTaskIds.map((taskId) => ({
      queryKey: ['security-retest-runs', taskId],
      queryFn: () => detectionScanningApi.listRetestRuns(taskId),
      staleTime: 30_000,
    })),
  });

  const retestRunsByTaskId = useMemo(() => {
    const map = new Map<string, SecurityRetestRun[]>();
    retestSourceTaskIds.forEach((taskId, index) => {
      map.set(taskId, retestRunsQueries[index]?.data ?? []);
    });
    return map;
  }, [retestRunsQueries, retestSourceTaskIds]);

  const allRetestRuns = useMemo(
    () => [...retestRunsByTaskId.values()].flat(),
    [retestRunsByTaskId],
  );

  const retestReports = useMemo(
    () => collectRetestReports(enrichedRows, allRetestRuns),
    [enrichedRows, allRetestRuns],
  );

  const retestQueueRows = useMemo(() => {
    const active = loopRows.filter(isRetestActivelyRunning);
    if (!retestRunningBatch) {
      return active;
    }
    const known = new Set(active.map((row) => row.id));
    const extras = retestRunningBatch.rows.filter((row) => !known.has(row.id));
    return [...active, ...extras];
  }, [loopRows, retestRunningBatch]);

  const pendingRetestConfirmRows = useMemo(
    () => enrichedRows.filter((row) => isRetestAwaitingConfirm(row)),
    [enrichedRows],
  );

  const liveRetestProgress: LiveRetestProgress | null = retestRunningBatch
    ? {
        planId: retestRunningBatch.planId,
        taskId: retestRunningBatch.taskId,
        retestTaskId: retestRunningBatch.retestTaskId,
        progress: retestRunningBatch.progress,
        riskIds: retestRunningBatch.rows.map((row) => row.id),
      }
    : null;

  const closedRows = useMemo(
    () => enrichedRows.filter((row) => isClosedDisplayStatus(row.displayStatus)),
    [enrichedRows],
  );
  const acceptedRows = useMemo(
    () => enrichedRows.filter((row) => row.displayStatus === 'risk_accepted'),
    [enrichedRows],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['security-remediations'] });
    void queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] });
    void queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['security-remediation-detail'] });
    void queryClient.invalidateQueries({ queryKey: ['security-retest-runs'] });
    void queryClient.invalidateQueries({ queryKey: ['audit-center-remediations'] });
    void queryClient.invalidateQueries({ queryKey: ['audit-center-findings'] });
  }, [queryClient]);

  const patchRemediation = useCallback(
    async (
      row: EnrichedRiskRow,
      payload: Parameters<typeof detectionScanningApi.updateRemediation>[1],
    ) => {
      const currentMeta =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {};
      const mergedMeta =
        payload.metadata && typeof payload.metadata === 'object'
          ? { ...currentMeta, ...payload.metadata }
          : payload.metadata;
      return detectionScanningApi.updateRemediation(row.id, {
        ...payload,
        metadata: mergedMeta,
      });
    },
    [],
  );

  const openRetestResultConfirm = useCallback(async (rows: EnrichedRiskRow[], planId: string) => {
    const firstMeta =
      rows[0]?.metadata && typeof rows[0].metadata === 'object'
        ? (rows[0].metadata as Record<string, unknown>)
        : {};
    const retestScanTaskId =
      (typeof firstMeta.retestScanTaskId === 'string' && firstMeta.retestScanTaskId) ||
      (typeof firstMeta.retestTaskId === 'string' && firstMeta.retestTaskId) ||
      '';
    let retestTask: SecurityScanTask | null = null;
    if (/^[0-9a-f-]{36}$/i.test(retestScanTaskId)) {
      try {
        retestTask = await detectionScanningApi.getTask(retestScanTaskId);
      } catch {
        retestTask = null;
      }
    }
    setPendingRetestRows(rows);
    setPendingRetestPlanId(planId);
    setPendingRetestTask(retestTask);
    setRetestResultOpen(true);
  }, []);

  useEffect(() => {
    // Some older/failed retest attempts may leave rows stuck in "running" phase.
    // When the UI sees `retestExecutionPhase=running` for too long without progress,
    // we treat it as stale and move it to "awaiting_confirm" so the task is no longer marked as retesting.
    const THRESHOLD_MS = 90_000;
    const now = Date.now();

    const activeRiskIds = new Set(retestRunningBatch?.rows.map((r) => r.id) ?? []);

    const candidates = enrichedRows.filter((row) => {
      if (activeRiskIds.has(row.id)) {
        return false;
      }
      const meta =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {};
      const isRunning = meta.retestExecutionPhase === 'running';
      const isAwaiting = meta.pendingRetestConfirm === true;
      if (!isRunning || isAwaiting) {
        return false;
      }
      const progress = meta.retestProgress;
      const hasNoProgress = progress == null || progress === 0;
      if (!hasNoProgress) {
        return false;
      }
      const updatedAtMs = row.updatedAt ? new Date(row.updatedAt).getTime() : NaN;
      if (!Number.isFinite(updatedAtMs)) {
        return false;
      }
      return now - updatedAtMs > THRESHOLD_MS;
    });

    if (candidates.length === 0) {
      return;
    }

    for (const row of candidates) {
      if (staleRetestCleanupDoneRef.current.has(row.id)) {
        continue;
      }
      staleRetestCleanupDoneRef.current.add(row.id);
      const currentMeta =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {};
      void patchRemediation(row, {
        status: 'reopened',
        retestStatus: 'pending',
        metadata: {
          ...currentMeta,
          retestExecutionPhase: 'awaiting_confirm',
          retestProgress: 100,
          pendingRetestConfirm: true,
        },
      }).catch(() => undefined);
    }
  }, [enrichedRows, patchRemediation, retestRunningBatch]);

  const busy = remediationsQuery.isFetching || findingsQuery.isFetching || tasksQuery.isFetching;

  const confirmMutation = useMutation({
    mutationFn: (row: EnrichedRiskRow) =>
      patchRemediation(row, {
        status: 'assigned',
        metadata: { needsConfirmation: false, confirmedAt: new Date().toISOString() },
      }),
    onSuccess: () => {
      invalidate();
      toast.success('风险已确认，进入整改流程');
    },
    onError: (error: Error) => toast.error(error.message || '确认失败'),
  });

  const acceptMutation = useMutation({
    mutationFn: (row: EnrichedRiskRow) =>
      patchRemediation(row, {
        status: 'risk_accepted',
        finalDecision: 'risk_accepted',
        acceptedReason: '业务连续性要求，临时风险接受，纳入上线观测。',
      }),
    onSuccess: () => {
      invalidate();
      setDrawerOpen(false);
      toast.success('已记录风险接受');
    },
    onError: (error: Error) => toast.error(error.message || '操作失败'),
  });

  const executeRetestMutation = useMutation({
    onMutate: (payload) => {
      const selectedRows = enrichedRows.filter((row) => payload.riskIds.includes(row.id));
      setRetestRunningBatch({
        planId: payload.planId,
        taskId: payload.taskId,
        retestTaskId: undefined,
        rows: selectedRows,
        progress: 0,
      });
      setRetestExecutionContext(null);
      // Close the "create retest task" wizard immediately when execution starts.
      setRetestWizardOpen(false);
    },
    mutationFn: async (payload: RetestWizardSubmitPayload) => {
      const selectedRows = enrichedRows.filter((r) => payload.riskIds.includes(r.id));
      if (selectedRows.length === 0) {
        throw new Error('未找到待复测风险项，请刷新后重试');
      }
      const reportId = toRetestReportId(payload.planId);
      const sourceTask = await detectionScanningApi.getTask(payload.taskId);
      const selectedCaseIds = resolveRetestSelectedCaseIds(selectedRows, payload.caseKeys);
      const selectedCapabilityTargets = payload.scopes.includes('component')
        ? resolveRetestCapabilityTargets(selectedRows)
        : [];
      const retestRunConfig = buildRetestTaskRunConfig(
        sourceTask,
        selectedCaseIds,
        selectedCapabilityTargets,
      );
      const retestPlanTargets = selectedCapabilityTargets.length
        ? [
            ...(sourceTask.plans?.flatMap((plan) =>
              (plan.targets || []).filter((target) => target.kind === 'agent'),
            ) || []),
            ...selectedCapabilityTargets,
          ]
        : undefined;

      for (const row of selectedRows) {
        const currentMeta =
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : {};
        await patchRemediation(row, {
          status: 'retesting',
          retestStatus: 'pending',
          metadata: {
            ...currentMeta,
            needsConfirmation: false,
            confirmedAt:
              typeof currentMeta.confirmedAt === 'string'
                ? currentMeta.confirmedAt
                : new Date().toISOString(),
            retestBatchId: payload.planId,
            retestReportId: reportId,
            retestTaskId: payload.planId,
            retestConclusion: payload.planTitle,
            retestExecutionPhase: 'running',
            retestProgress: 0,
            pendingRetestConfirm: false,
            retestScopes: payload.scopes,
            retestCaseKeys: payload.caseKeys,
            retestSelectedCaseIds: selectedCaseIds,
            retestCapabilityTargets: selectedCapabilityTargets,
          },
        });
      }

      const retestTask = await detectionScanningApi.createTask({
        name: `${sourceTask.name} · 复测 ${payload.planId}`,
        assetId: sourceTask.assetId,
        scanType: sourceTask.scanType,
        targetKind: sourceTask.targetKind,
        source: 'risk_retest',
        targetSummary: sourceTask.targetSummary,
        runConfig: retestRunConfig,
        metadata: {
          ...(sourceTask.metadata || {}),
          selectedCaseIds,
          retestCapabilityTargets: selectedCapabilityTargets,
          retestOfTaskId: payload.taskId,
          retestPlanId: payload.planId,
          retestRemediationIds: payload.riskIds,
          retestCaseKeys: payload.caseKeys,
        },
        plans:
          sourceTask.plans && sourceTask.plans.length > 0
            ? sourceTask.plans.map((plan) => ({
                probeType: plan.probeType,
                strategy: plan.strategy,
                enabled: plan.enabled,
                libIds: plan.libIds,
                caseCount: plan.caseCount,
                ...(retestPlanTargets ? { targets: retestPlanTargets } : {}),
              }))
            : [
                {
                  probeType: 'retest',
                  strategy: sourceTask.scanType || '风险复测',
                  enabled: true,
                  libIds: [],
                  caseCount: selectedCaseIds.length + selectedCapabilityTargets.length,
                  ...(retestPlanTargets ? { targets: retestPlanTargets } : {}),
                },
              ],
      });

      // Ensure remediation rows have the real retest scan task id.
      // This is important for "stop retest" and for consistent log rendering.
      for (const row of selectedRows) {
        const currentMeta =
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : {};
        await patchRemediation(row, {
          metadata: {
            ...currentMeta,
            retestTaskId: retestTask.id,
            retestScanTaskId: retestTask.id,
          },
        });
      }

      setRetestRunningBatch((prev) =>
        prev
          ? {
              ...prev,
              retestTaskId: retestTask.id,
              progress: 5,
            }
          : null,
      );

      // Show the dynamic "execution" modal (same UX as dialogue security scan).
      setRetestExecutionContext({
        taskId: retestTask.id,
        taskName: retestTask.name,
        agentName: payload.agentName,
        libraryTitles: [],
        totalCases: selectedCaseIds.length + selectedCapabilityTargets.length,
        executeNow: false, // execution is already started in this mutation
      });

      let progressPollTimer: number | undefined;
      progressPollTimer = window.setInterval(() => {
        void detectionScanningApi
          .getTask(retestTask.id)
          .then((task) => {
            const nextProgress = Math.max(5, Math.min(99, task.progress || 0));
            setRetestRunningBatch((prev) => (prev ? { ...prev, progress: nextProgress } : null));
          })
          .catch(() => undefined);
      }, 1500);

      let executedTask: Awaited<ReturnType<typeof detectionScanningApi.executeTask>>;
      try {
        executedTask = await detectionScanningApi.executeTask(retestTask.id, {
          mode: 'manual',
          generateFindings: true,
        });
      } finally {
        if (progressPollTimer != null) {
          window.clearInterval(progressPollTimer);
        }
      }

      const failedCaseKeys = collectFailedCaseKeysFromTask(executedTask);
      const executionIndex = indexRetestExecutions(readTechnicalExecutionsFromTask(executedTask));
      const updatedRows: EnrichedRiskRow[] = [];
      for (const row of selectedRows) {
        const currentMeta =
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : {};
        const execution = resolveRetestExecutionForRow(row, executionIndex);
        const stillFailed = isRiskStillFailingAfterRetest(row, failedCaseKeys);
        const historyEntry = {
          planId: payload.planId,
          reportId,
          retestScanTaskId: retestTask.id,
          executedAt: new Date().toISOString(),
          result: stillFailed ? ('failed' as const) : ('pending' as const),
          snapshot: serializeRetestExecutionSnapshot(execution) ?? undefined,
        };
        const nextMetadata = appendRetestHistoryEntry(
          {
            ...currentMeta,
            retestBatchId: payload.planId,
            retestReportId: reportId,
            retestTaskId: retestTask.id,
            retestScanTaskId: retestTask.id,
            retestConclusion: payload.planTitle,
            retestExecutionPhase: 'awaiting_confirm',
            retestProgress: 100,
            pendingRetestConfirm: true,
            retestScopes: payload.scopes,
            retestCaseKeys: payload.caseKeys,
            retestStillFailed: stillFailed,
            retestExecutionSnapshot: serializeRetestExecutionSnapshot(execution),
          },
          historyEntry,
        );
        await patchRemediation(row, {
          status: stillFailed ? 'reopened' : 'evidence_submitted',
          retestStatus: 'pending',
          metadata: nextMetadata,
        });
        updatedRows.push({
          ...row,
          metadata: nextMetadata,
        });
      }

      return {
        payload,
        selectedRows: updatedRows,
        retestTaskId: retestTask.id,
        retestTask: executedTask,
      };
    },
    onSuccess: (data) => {
      setRetestRunningBatch(null);
      setRetestExecutionContext(null);
      invalidate();
      setRetestWizardOpen(false);
      setPendingRetestRows(data.selectedRows);
      setPendingRetestPlanId(data.payload.planId);
      setPendingRetestTask(data.retestTask);
      setRetestResultOpen(true);
      toast.success('复测执行完成，请确认结果');
    },
    onError: (error: Error) => {
      setRetestRunningBatch(null);
      setRetestExecutionContext(null);
      // Let user retry by reopening the wizard.
      setRetestWizardOpen(true);
      toast.error(error.message || '复测执行失败');
    },
  });

  const confirmRetestResultsMutation = useMutation({
    mutationFn: async ({
      items,
      conclusion,
      planId,
    }: {
      items: RetestResultItem[];
      conclusion: string;
      planId: string;
    }) => {
      for (const item of items) {
        const row = enrichedRows.find((r) => r.id === item.riskId);
        if (!row) {
          continue;
        }
        const currentMeta =
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : {};
        const retestScanTaskId =
          (typeof currentMeta.retestScanTaskId === 'string' && currentMeta.retestScanTaskId) ||
          (typeof currentMeta.retestTaskId === 'string' && currentMeta.retestTaskId) ||
          null;
        const reportId = toRetestReportId(planId);
        await detectionScanningApi.runRetest(item.riskId, {
          result: item.result,
          conclusion: `${conclusion}\n\n复测批次：${planId}`,
          retestTaskId: retestScanTaskId,
          evidence: {
            source: 'risk_retest_wizard',
            retestReportId: reportId,
            retestBatchId: planId,
            retestScanTaskId,
          },
        });
        await patchRemediation(row, {
          metadata: {
            ...appendRetestHistoryEntry(currentMeta, {
              planId,
              reportId,
              retestScanTaskId: retestScanTaskId || '',
              executedAt: new Date().toISOString(),
              result: item.result,
            }),
            pendingRetestConfirm: false,
            retestConclusion: conclusion,
            retestExecutionPhase: 'confirmed',
            retestProgress: 100,
          },
        });
      }
    },
    onSuccess: () => {
      invalidate();
      setRetestResultOpen(false);
      setPendingRetestRows([]);
      toast.success('复测结果已确认并更新风险状态');
    },
    onError: (error: Error) => toast.error(error.message || '确认失败'),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => detectionScanningApi.deleteTask(taskId),
    onSuccess: () => {
      invalidate();
      toast.success('任务已删除');
    },
    onError: (error: Error) => toast.error(error.message || '删除任务失败'),
  });

  const stopTaskMutation = useMutation({
    mutationFn: (taskId: string) => detectionScanningApi.updateTask(taskId, { status: 'canceled' }),
  });

  const handleStopTask = useCallback(
    (taskId: string) => {
      const isRetest = taskId === retestRunningBatch?.retestTaskId;
      setStopTaskTarget({ taskId, isRetest });
    },
    [retestRunningBatch?.retestTaskId],
  );

  const copyTaskMutation = useMutation({
    mutationFn: async (group: TaskRiskGroup) => {
      const source = await detectionScanningApi.getTask(group.taskId);
      return detectionScanningApi.createTask({
        name: `${source.name} · 副本`,
        assetId: source.assetId,
        scanType: source.scanType,
        targetKind: source.targetKind,
        source: source.source,
        targetSummary: source.targetSummary,
        metadata: {
          ...(source.metadata || {}),
          copiedFromTaskId: group.taskId,
        },
        plans: source.plans?.map((plan) => ({
          probeType: plan.probeType,
          strategy: plan.strategy,
          enabled: plan.enabled,
          libIds: plan.libIds,
          caseCount: plan.caseCount,
        })),
      });
    },
    onSuccess: (task) => {
      invalidate();
      toast.success(`已复制评估任务：${task.name}`);
    },
    onError: (error: Error) => toast.error(error.message || '复制失败'),
  });

  const openRow = useCallback((row: EnrichedRiskRow) => {
    setSelectedRow(row);
    setDrawerOpen(true);
  }, []);

  const openRetestWizard = useCallback((options?: { taskId?: string; riskIds?: string[] }) => {
    setRetestWizardTaskId(options?.taskId ?? null);
    setRetestWizardRiskIds(options?.riskIds);
    setRetestWizardOpen(true);
  }, []);

  const openRetestReport = useCallback(
    (reportId: string, taskId: string) => {
      void navigate({
        to: '/scan/retest-reports/$reportId',
        params: { reportId },
        search: { taskId, returnTo: '/scan/remediation' },
      });
    },
    [navigate],
  );

  const handleDeleteTaskGroup = useCallback((group: TaskRiskGroup) => {
    const taskStatus = group.rows[0]?.scanTask?.status;
    if (taskStatus === 'running') {
      toast.error('检测中的任务请先停止后再删除');
      return;
    }
    if (group.rows.some(isRetestActivelyRunning)) {
      toast.error('存在进行中的复测，请先等待复测结束后再删除');
      return;
    }
    setDeleteTaskGroupTarget(group);
  }, []);

  const taskTableActions = useMemo(
    () => ({
      onRetest: (group: TaskRiskGroup) => openRetestWizard({ taskId: group.taskId }),
      onStop: (taskId: string) => handleStopTask(taskId),
      onCopy: (group: TaskRiskGroup) => copyTaskMutation.mutate(group),
      onDelete: handleDeleteTaskGroup,
      onRetestLog: (group: TaskRiskGroup) => setRetestLogGroup(group),
      onSelectRisk: openRow,
    }),
    [copyTaskMutation, handleDeleteTaskGroup, handleStopTask, openRetestWizard, openRow],
  );

  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isLoading = remediationsQuery.isLoading || findingsQuery.isLoading;

  const panelTitle =
    listMode === 'task'
      ? '评估任务与风险'
      : listMode === 'agent'
        ? '按 Agent 汇总'
        : listMode === 'dept'
          ? '按部门汇总'
          : listMode === 'owner'
            ? '按人员汇总'
            : '风险清单';

  const panelHint =
    listMode === 'task'
      ? '一个评估任务可产生多个风险发现项，每个风险发现项生成或关联整改任务'
      : listMode === 'flat'
        ? '点击风险行查看详情 · 用例名称与组件与检测任务对齐'
        : listMode === 'agent'
          ? '按智能体聚合未关闭风险 · 展示部门与负责人'
          : listMode === 'dept'
            ? '按部门聚合 Agent 与风险分布'
            : '按安全/整改负责人聚合责任范围';

  const renderGroupedList = () => {
    const groups =
      listMode === 'agent' ? agentGroups : listMode === 'dept' ? deptGroups : ownerGroups;
    if (groups.length === 0) {
      return <div className="py-10 text-center text-sm text-muted-foreground">暂无分组数据</div>;
    }
    return (
      <div className="space-y-3">
        {groups.map((group) => {
          const groupKey = `${listMode}:${group.key}`;
          const expanded = expandedGroups.has(groupKey);
          return (
            <div key={groupKey} className="rrc-task-group">
              <div className="rrc-group-head" onClick={() => toggleGroup(groupKey)}>
                <div className="flex items-center gap-2">
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <div>
                    <div className="font-medium">{group.label}</div>
                    {group.sublabel ? (
                      <div className="text-xs text-muted-foreground">{group.sublabel}</div>
                    ) : null}
                  </div>
                </div>
                <Badge variant="secondary">{group.openCount} 未关闭</Badge>
              </div>
              {expanded ? (
                <FlatRiskTable
                  rows={group.rows}
                  selectedId={selectedRow?.id}
                  busy={busy || confirmMutation.isPending}
                  onSelect={openRow}
                  onConfirm={(row) => confirmMutation.mutate(row)}
                  onRetest={(row) => openRetestWizard({ riskIds: [row.id] })}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const renderTaskView = () => (
    <RiskTaskTableView
      groups={taskGroups}
      expandedTasks={expandedTasks}
      selectedId={selectedRow?.id}
      retestRunsByTaskId={retestRunsByTaskId}
      busy={
        busy ||
        confirmMutation.isPending ||
        copyTaskMutation.isPending ||
        deleteTaskMutation.isPending ||
        stopTaskMutation.isPending
      }
      liveRetestProgress={liveRetestProgress}
      onToggleTask={toggleTask}
      actions={taskTableActions}
    />
  );

  const renderBoard = () => (
    <div className={cn('rrc-board', viewMode === 'board' && 'show')}>
      {(
        [
          ['待复测', boardPendingRetest],
          ['复测失败', boardRetestFailed],
          ['已关闭', boardClosed],
        ] as const
      ).map(([title, items]) => (
        <div key={title} className="rrc-board-column">
          <h4>
            <span>{title}</span>
            <Badge variant="secondary">{items.length}</Badge>
          </h4>
          <div className="rrc-board-column-body">
            {items.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">暂无风险</div>
            ) : (
              items.slice(0, 8).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={cn('rrc-risk-card', selectedRow?.id === row.id && 'active')}
                  onClick={() => openRow(row)}
                >
                  <strong>{row.title}</strong>
                  <p>
                    {row.agentName} · {resolveRiskRowLibraryLabel(row)}
                  </p>
                  <div className="rrc-risk-card-meta">
                    <Badge variant="outline" className={DISPLAY_STATUS_CLASS[row.displayStatus]}>
                      {DISPLAY_STATUS_LABEL[row.displayStatus]}
                    </Badge>
                    <RiskBadge level={row.riskLevel} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Shell>
      <div className="rrc-page space-y-6">
        <PageHead
          title="风险闭环"
          desc="承接评估任务推送的风险发现项，由安全人员统一确认、通知、跟进、创建复测任务并关闭。"
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate({ to: '/scan/technical-risks' })}
              >
                <ScanSearch className="mr-2 h-4 w-4" />
                技术检测
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate({ to: '/scan/compliance-tasks' })}
              >
                合规检测
              </Button>
            </div>
          }
        />

        <GovernanceStrip active={3} />

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            icon={ClipboardCheck}
            label="整改任务"
            value={String(kpis.total)}
            hint="含已关闭项"
          />
          <MetricCard
            icon={AlertTriangle}
            label="未关闭"
            value={String(kpis.open)}
            hint={`待确认 ${kpis.pendingConfirm}`}
          />
          <MetricCard
            icon={FileText}
            label="待复测"
            value={String(kpis.pendingRetest)}
            hint="已提交证据待验证"
          />
          <MetricCard
            icon={CheckCircle2}
            label="已关闭"
            value={String(kpis.closed + kpis.accepted)}
            hint="关闭或风险接受"
          />
        </div>

        <div className="rrc-section-tabs">
          {(
            [
              ['workbench', '进行中处置'],
              ['retest', '复测确认'],
              ['closed', '关闭归档'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn('rrc-section-tab', sectionTab === id && 'active')}
              onClick={() => setSectionTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {sectionTab === 'workbench' ? (
          <Card>
            <CardHeader className="space-y-4">
              <div className="rrc-toolbar">
                <div className="rrc-list-modes">
                  {LIST_MODE_LABELS.map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={cn('rrc-list-mode', listMode === mode && 'active')}
                      onClick={() => setListMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Input
                  className="max-w-sm"
                  placeholder="搜索风险编号 / Agent / 任务 / 人员"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="rrc-panel-head">
                <div>
                  <h2>{panelTitle}</h2>
                  <p className="rrc-hint">{panelHint}</p>
                </div>
                <div className="rrc-view-switch">
                  <button
                    type="button"
                    className={viewMode === 'list' ? 'active' : ''}
                    onClick={() => setViewMode('list')}
                  >
                    清单
                  </button>
                  <button
                    type="button"
                    className={viewMode === 'board' ? 'active' : ''}
                    onClick={() => setViewMode('board')}
                  >
                    看板
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载风险闭环数据…
                </div>
              ) : viewMode === 'board' ? (
                renderBoard()
              ) : listMode === 'task' ? (
                renderTaskView()
              ) : listMode === 'flat' ? (
                <FlatRiskTable
                  rows={workbenchRows}
                  selectedId={selectedRow?.id}
                  busy={busy || confirmMutation.isPending}
                  onSelect={openRow}
                  onConfirm={(row) => confirmMutation.mutate(row)}
                  onRetest={(row) => openRetestWizard({ riskIds: [row.id] })}
                />
              ) : (
                renderGroupedList()
              )}
            </CardContent>
          </Card>
        ) : null}

        {sectionTab === 'retest' ? (
          <Card>
            <CardHeader className="space-y-4">
              <div>
                <CardTitle>复测确认</CardTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  复测执行完成后在此确认结果并关闭风险 ·
                  发起复测请在工作台评估任务行使用「批量复测」
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <MetricCard
                  icon={FileText}
                  label="待复测风险"
                  value={String(kpis.pendingRetest)}
                  hint="需安全确认"
                />
                <MetricCard
                  icon={Loader2}
                  label="执行中"
                  value={String(kpis.retesting)}
                  hint="复测运行中"
                />
                <MetricCard
                  icon={CheckCircle2}
                  label="近 7 天关闭"
                  value={String(kpis.closed)}
                  hint="复测通过"
                />
                <MetricCard
                  icon={ClipboardCheck}
                  label="复测报告"
                  value={String(kpis.retestReports)}
                  hint="已归档"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-8">
              <section className="rrc-retest-section">
                <div className="rrc-panel-head">
                  <div>
                    <h3>执行中</h3>
                    <p className="rrc-hint">复测任务运行进度 · 完成后进入待确认</p>
                  </div>
                  <Badge variant="secondary">{retestQueueRows.length}</Badge>
                </div>
                <div className="rrc-retest-table-wrap">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>复测批次</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>关联风险</TableHead>
                        <TableHead style={{ minWidth: 160 }}>进度</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {retestQueueRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                            暂无执行中的复测任务
                          </TableCell>
                        </TableRow>
                      ) : (
                        retestQueueRows.map((row) => {
                          const meta =
                            row.metadata && typeof row.metadata === 'object'
                              ? (row.metadata as Record<string, unknown>)
                              : {};
                          const planId =
                            (typeof meta.retestBatchId === 'string' && meta.retestBatchId) ||
                            retestRunningBatch?.planId ||
                            '';
                          const progress =
                            liveRetestProgress &&
                            (liveRetestProgress.riskIds.includes(row.id) ||
                              liveRetestProgress.planId === planId)
                              ? liveRetestProgress.progress
                              : resolveRetestProgress(row);
                          return (
                            <TableRow key={row.id}>
                              <TableCell className="font-mono text-xs">
                                {planId || row.id.slice(0, 8)}
                              </TableCell>
                              <TableCell>{row.agentName}</TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="link"
                                  className="h-auto px-0"
                                  onClick={() => openRow(row)}
                                >
                                  {row.title}
                                </Button>
                              </TableCell>
                              <TableCell>
                                <RetestExecutionProgress progress={progress} compact />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <section className="rrc-retest-section">
                <div className="rrc-panel-head">
                  <div>
                    <h3>待确认复测</h3>
                    <p className="rrc-hint">逐项确认通过/未通过后批量更新风险状态</p>
                  </div>
                  <Badge variant="secondary">{pendingRetestConfirmRows.length}</Badge>
                </div>
                <div className="rrc-retest-table-wrap">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>复测批次</TableHead>
                        <TableHead>风险项</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRetestConfirmRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            暂无待确认项
                          </TableCell>
                        </TableRow>
                      ) : (
                        pendingRetestConfirmRows.map((row) => {
                          const meta =
                            row.metadata && typeof row.metadata === 'object'
                              ? (row.metadata as Record<string, unknown>)
                              : {};
                          const retestTaskId =
                            (typeof meta.retestBatchId === 'string' && meta.retestBatchId) ||
                            (typeof meta.retestTaskId === 'string' && meta.retestTaskId) ||
                            '—';
                          return (
                            <TableRow key={row.id}>
                              <TableCell className="font-mono text-xs">{retestTaskId}</TableCell>
                              <TableCell className="max-w-xs">
                                <div className="font-medium">{row.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {row.violationNo || row.id.slice(0, 12)}
                                </div>
                              </TableCell>
                              <TableCell>{row.agentName}</TableCell>
                              <TableCell>
                                <StatusBadge row={row} />
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openRow(row)}
                                >
                                  详情
                                </Button>
                                {isRetestAwaitingConfirm(row) ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="ml-2"
                                    onClick={() => {
                                      void openRetestResultConfirm(
                                        [row],
                                        (typeof meta.retestBatchId === 'string' &&
                                          meta.retestBatchId) ||
                                          'RT-PENDING',
                                      );
                                    }}
                                  >
                                    确认结果
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="ml-2"
                                    onClick={() => openRetestWizard({ riskIds: [row.id] })}
                                  >
                                    重新发起
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </CardContent>
          </Card>
        ) : null}

        {sectionTab === 'closed' ? (
          <Card>
            <CardHeader>
              <CardTitle>关闭归档</CardTitle>
              <p className="text-sm text-muted-foreground">已处置风险与复测报告 · 支撑审计追溯</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rrc-closed-subtabs">
                {(
                  [
                    ['closed', `已关闭 (${closedRows.length})`],
                    ['accepted', `风险接受 (${acceptedRows.length})`],
                    ['retest_reports', `复测报告 (${retestReports.length})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={cn('rrc-closed-subtab', closedSubTab === id && 'active')}
                    onClick={() => setClosedSubTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {closedSubTab === 'closed' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>编号</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          暂无已关闭项
                        </TableCell>
                      </TableRow>
                    ) : (
                      closedRows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          onClick={() => openRow(row)}
                        >
                          <TableCell className="font-mono text-xs">
                            {row.violationNo || row.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>{row.title}</TableCell>
                          <TableCell>{row.agentName}</TableCell>
                          <TableCell>
                            <StatusBadge row={row} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              ) : null}

              {closedSubTab === 'accepted' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>编号</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>等级</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acceptedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          暂无风险接受记录
                        </TableCell>
                      </TableRow>
                    ) : (
                      acceptedRows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          onClick={() => openRow(row)}
                        >
                          <TableCell className="font-mono text-xs">
                            {row.violationNo || row.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>{row.title}</TableCell>
                          <TableCell>{row.agentName}</TableCell>
                          <TableCell>
                            <RiskBadge level={row.riskLevel} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              ) : null}

              {closedSubTab === 'retest_reports' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>报告 ID</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>生成时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retestReports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          暂无复测报告
                        </TableCell>
                      </TableRow>
                    ) : (
                      retestReports.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell className="font-mono text-xs">{report.id}</TableCell>
                          <TableCell>{report.title}</TableCell>
                          <TableCell>{report.agentName}</TableCell>
                          <TableCell>{new Date(report.createdAt).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {report.status === 'archived' ? '已归档' : '草稿'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openRetestReport(report.id, report.taskId)}
                            >
                              查看
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <RiskDetailDrawer
        row={selectedRow}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        busy={confirmMutation.isPending || acceptMutation.isPending}
        onConfirm={(row) => confirmMutation.mutate(row)}
        onAcceptRisk={(row) => acceptMutation.mutate(row)}
        onGoTask={(taskId) => {
          const task = selectedRow?.scanTask;
          if (task?.scanType === '合规检测') {
            void navigate({
              to: '/scan/compliance-tasks/$taskId',
              params: { taskId },
              search: { returnTo: `${window.location.pathname}${window.location.search}` },
            });
          } else {
            void navigate({ to: '/scan/technical-risks' });
          }
        }}
      />

      <RiskRetestWizardDialog
        open={retestWizardOpen}
        onOpenChange={setRetestWizardOpen}
        rows={enrichedRows}
        initialTaskId={retestWizardTaskId}
        initialRiskIds={retestWizardRiskIds}
        busy={executeRetestMutation.isPending}
        onSubmit={(payload) => executeRetestMutation.mutate(payload)}
      />

      <DialogueScanExecutionModal
        context={retestExecutionContext}
        onClose={() => setRetestExecutionContext(null)}
        onComplete={() => {
          // When modal detects task completion, refresh scan-tasks so the UI can update.
          void queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] });
          void queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] });
        }}
      />

      <RiskRetestResultDialog
        open={retestResultOpen}
        onOpenChange={(open) => {
          setRetestResultOpen(open);
          if (!open) {
            setPendingRetestTask(null);
          }
        }}
        rows={pendingRetestRows}
        planId={pendingRetestPlanId}
        retestTask={pendingRetestTask}
        busy={confirmRetestResultsMutation.isPending}
        onSubmit={(items, conclusion) =>
          confirmRetestResultsMutation.mutate({
            items,
            conclusion,
            planId: pendingRetestPlanId,
          })
        }
      />

      <RiskRetestLogDrawer
        group={retestLogGroup}
        allRows={loopRows}
        retestRuns={retestLogGroup ? (retestRunsByTaskId.get(retestLogGroup.taskId) ?? []) : []}
        open={Boolean(retestLogGroup)}
        onClose={() => setRetestLogGroup(null)}
        liveRetestProgress={liveRetestProgress}
        onRunRetest={(taskId) => {
          setRetestLogGroup(null);
          openRetestWizard({ taskId });
        }}
        onOpenReport={(reportId, taskId) => {
          setRetestLogGroup(null);
          openRetestReport(reportId, taskId);
        }}
      />

      <ConfirmDialog
        open={Boolean(stopTaskTarget)}
        onOpenChange={(open) => {
          if (!open && !stopTaskMutation.isPending) {
            setStopTaskTarget(null);
          }
        }}
        title={`停止${stopTaskTarget?.isRetest ? '复测任务' : '评估任务'}？`}
        desc={`确定停止${stopTaskTarget?.isRetest ? '复测任务' : '评估任务'}？`}
        cancelBtnText="取消"
        confirmText={stopTaskMutation.isPending ? '停止中…' : '确认停止'}
        destructive
        isLoading={stopTaskMutation.isPending}
        handleConfirm={() => {
          if (!stopTaskTarget) {
            return;
          }
          const { taskId, isRetest } = stopTaskTarget;
          stopTaskMutation.mutate(taskId, {
            onSuccess: () => {
              if (isRetest) {
                setRetestRunningBatch(null);
              }
              invalidate();
              toast.success(isRetest ? '复测任务已停止' : '任务已停止');
            },
            onError: (error: Error) =>
              toast.error(error.message || (isRetest ? '停止复测任务失败' : '停止任务失败')),
            onSettled: () => setStopTaskTarget(null),
          });
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteTaskGroupTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteTaskMutation.isPending) {
            setDeleteTaskGroupTarget(null);
          }
        }}
        title="删除任务及整改记录？"
        desc={`确定删除任务「${deleteTaskGroupTarget?.taskName ?? '该任务'}」及其 ${
          deleteTaskGroupTarget?.rows.length ?? 0
        } 条整改记录？此操作不可恢复。`}
        cancelBtnText="取消"
        confirmText={deleteTaskMutation.isPending ? '删除中…' : '确认删除'}
        destructive
        isLoading={deleteTaskMutation.isPending}
        handleConfirm={() => {
          if (deleteTaskGroupTarget) {
            deleteTaskMutation.mutate(deleteTaskGroupTarget.taskId, {
              onSettled: () => setDeleteTaskGroupTarget(null),
            });
          }
        }}
      />
    </Shell>
  );
}

/** @deprecated Use RiskClosedLoopPage */
export function RemediationCenterPage() {
  return <RiskClosedLoopPage />;
}
