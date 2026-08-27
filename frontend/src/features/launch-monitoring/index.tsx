import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { GovernanceFlowStrip } from '@/features/shared/governance-flow-strip';
import { assetIntakeApi } from '@/services/api/asset-intake';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import {
  buildPatrolAiSuggestions,
  buildPatrolRows,
  computePatrolSummaryMetrics,
} from './patrol-metrics';
import { PatrolPlanEditDialog } from './patrol-plan-edit-dialog';
import { PatrolPlanWizardDialog } from './patrol-plan-wizard-dialog';
import { PatrolAiPanel, PatrolSummaryGrid } from './patrol-summary';
import { PatrolTaskDrawer } from './patrol-task-drawer';
import { PatrolTaskList } from './patrol-task-list';

import type { PatrolRow } from './patrol-utils';

const RUNNING_TASK_REFETCH_INTERVAL_MS = 10_000;

function shouldPollPatrolTasks(
  payload: { data?: Array<{ status?: string; createdAt?: string }> | null } | undefined,
): boolean {
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
    const createdAt = task.createdAt ? new Date(task.createdAt).getTime() : Number.NaN;
    return Number.isFinite(createdAt) && now - createdAt < recentPendingMs;
  });
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
      <Main className="grid gap-6">{children}</Main>
    </>
  );
}

export function LaunchMonitoringPage({
  autoOpenCreate = false,
  initialCreateAssetId,
}: {
  autoOpenCreate?: boolean;
  initialCreateAssetId?: string;
} = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardAssetId, setWizardAssetId] = useState(initialCreateAssetId || '');
  const [editRow, setEditRow] = useState<PatrolRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<PatrolRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const createDeepLinkConsumedRef = useRef(false);

  useEffect(() => {
    if (!autoOpenCreate || createDeepLinkConsumedRef.current) {
      return;
    }
    createDeepLinkConsumedRef.current = true;
    setWizardAssetId(initialCreateAssetId || '');
    setWizardOpen(true);
    void navigate({
      to: '/launch-monitoring',
      search: {},
      replace: true,
    });
  }, [autoOpenCreate, initialCreateAssetId, navigate]);

  const assetsQuery = useQuery({
    queryKey: ['launch-monitoring-assets'],
    queryFn: () => assetIntakeApi.listAgents({ limit: 100 }),
  });
  const tasksQuery = useQuery({
    queryKey: ['launch-monitoring-scan-tasks'],
    queryFn: () => detectionScanningApi.listTasks({ limit: 100, targetKind: 'agent_patrol_plan' }),
    refetchInterval: (query) =>
      shouldPollPatrolTasks(query.state.data) ? RUNNING_TASK_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
  });
  const findingsQuery = useQuery({
    queryKey: ['launch-monitoring-findings'],
    queryFn: () => detectionScanningApi.listFindings({ limit: 100 }),
    refetchInterval: () =>
      shouldPollPatrolTasks(tasksQuery.data) ? RUNNING_TASK_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
  });

  const assets = assetsQuery.data?.data || [];
  const tasks = tasksQuery.data?.data || [];
  const findings = findingsQuery.data?.data || [];

  const patrolRows = useMemo(
    () => buildPatrolRows(tasks, assets, findings),
    [assets, findings, tasks],
  );

  const summaryMetrics = useMemo(() => computePatrolSummaryMetrics(patrolRows), [patrolRows]);
  const aiSuggestions = useMemo(() => buildPatrolAiSuggestions(patrolRows), [patrolRows]);
  const currentSelectedRow = useMemo(
    () =>
      selectedRow
        ? patrolRows.find((row) => row.task.id === selectedRow.task.id) || selectedRow
        : null,
    [patrolRows, selectedRow],
  );

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ['launch-monitoring-scan-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['launch-monitoring-findings'] });
    queryClient.invalidateQueries({ queryKey: ['launch-monitoring-assets'] });
  };

  const handleSelectRow = (row: PatrolRow) => {
    setSelectedRow(row);
    setDrawerOpen(true);
  };

  const handleEditRow = (row: PatrolRow) => {
    setEditRow(row);
    setEditOpen(true);
  };

  return (
    <Shell>
      <GovernanceFlowStrip active={4} />

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">上线观测与周期巡检</h1>
        <p className="text-sm text-muted-foreground">
          安全团队在 Agent 放行后持续检测
          API、Prompt、Skill、MCP、知识库和工具链安全风险；发现有效风险后进入风险闭环。
        </p>
      </div>

      <section className="space-y-3">
        <PatrolSummaryGrid metrics={summaryMetrics} />
      </section>

      <PatrolAiPanel suggestions={aiSuggestions} />

      <PatrolTaskList
        rows={patrolRows}
        selectedTaskId={currentSelectedRow?.task.id}
        onSelectRow={handleSelectRow}
        onEditRow={handleEditRow}
        onCreateClick={() => {
          setWizardAssetId('');
          setWizardOpen(true);
        }}
        onRefresh={refreshData}
      />

      <p className="rounded-2xl border bg-muted/20 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
        上线观测只承载放行后的安全风险持续检测；周期巡检用于长期发现安全风险复发。有效安全风险确认后进入风险闭环。
      </p>

      <PatrolTaskDrawer row={currentSelectedRow} open={drawerOpen} onOpenChange={setDrawerOpen} />

      <PatrolPlanWizardDialog
        open={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) {
            setWizardAssetId('');
          }
        }}
        initialAssetId={wizardAssetId || undefined}
        onCreated={refreshData}
      />

      <PatrolPlanEditDialog
        row={editRow}
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditRow(null);
          }
        }}
        onUpdated={refreshData}
      />
    </Shell>
  );
}
