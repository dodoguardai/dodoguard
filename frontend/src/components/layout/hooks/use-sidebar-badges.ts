/**
 * Sidebar orange count badges — live counts from assets / remediations / patrol / scans.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrganizationStore } from '@/stores/organization-store';
import { dashboardApi } from '@/services/api/dashboard';
import { assetIntakeApi } from '@/services/api/asset-intake';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import {
  buildPatrolRows,
  computePatrolSummaryMetrics,
} from '@/features/launch-monitoring/patrol-metrics';
import {
  enrichRemediationRows,
  filterClosedLoopProductionRows,
  isClosedDisplayStatus,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import type { SidebarBadgeKey } from '@/components/layout/types';

export type SidebarBadgeCounts = Partial<Record<SidebarBadgeKey, number>>;

export function useSidebarBadges(): SidebarBadgeCounts {
  const organizationId = useOrganizationStore((s) => s.currentOrg?.id);

  const { data: stats } = useQuery({
    queryKey: ['dashboard', 'stats', organizationId, 'sidebar-badges'],
    queryFn: () => dashboardApi.getStats(organizationId!),
    enabled: !!organizationId,
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
  });

  const { data: agentsPage } = useQuery({
    queryKey: ['assets', 'agents', 'sidebar-count', organizationId],
    queryFn: () => assetIntakeApi.listAgents({ page: 1, limit: 100 }),
    enabled: !!organizationId,
    staleTime: 60 * 1000,
  });

  const { data: discoveredPage } = useQuery({
    queryKey: ['assets', 'discovered', 'sidebar-count', organizationId],
    queryFn: () => assetIntakeApi.listDiscovered({ page: 1, limit: 1, claimStatus: 'pending' }),
    enabled: !!organizationId,
    staleTime: 60 * 1000,
  });

  const { data: remediationsPage } = useQuery({
    queryKey: ['scan', 'remediations', 'sidebar-count', organizationId],
    queryFn: () => detectionScanningApi.listRemediations({ page: 1, limit: 200 }),
    enabled: !!organizationId,
    staleTime: 60 * 1000,
  });

  const { data: findingsPage } = useQuery({
    queryKey: ['scan', 'findings', 'sidebar-count', organizationId],
    queryFn: () => detectionScanningApi.listFindings({ page: 1, limit: 100, status: 'open' }),
    enabled: !!organizationId,
    staleTime: 60 * 1000,
  });

  const { data: tasksPage } = useQuery({
    queryKey: ['scan', 'tasks', 'sidebar-count', organizationId],
    queryFn: () => detectionScanningApi.listTasks({ page: 1, limit: 100 }),
    enabled: !!organizationId,
    staleTime: 60 * 1000,
  });

  return useMemo(() => {
    const managedAgents = agentsPage?.total ?? stats?.activeAgents ?? 0;
    const inboxPending = discoveredPage?.total ?? 0;
    const assets = inboxPending > 0 ? inboxPending : managedAgents;

    // Same production filter as Risk Closed-loop / Security Cockpit.
    const productionRows = filterClosedLoopProductionRows(
      enrichRemediationRows(
        remediationsPage?.data ?? [],
        findingsPage?.data ?? [],
        tasksPage?.data ?? [],
      ),
    );
    const risk = productionRows.filter((r) => !isClosedDisplayStatus(r.displayStatus)).length;

    const patrol = computePatrolSummaryMetrics(
      buildPatrolRows(tasksPage?.data ?? [], agentsPage?.data ?? [], findingsPage?.data ?? []),
    );
    const launch = patrol.dueToday + patrol.failedPlans;

    const reports =
      tasksPage?.data?.filter(
        (t) => t.status === 'completed' && (t.highCount > 0 || t.mediumCount > 0),
      ).length ?? 0;
    const detection = stats?.runningTasks ?? 0;

    // Same actionable formula as Security Cockpit (intake + open rem + patrol due + pending admission).
    const pendingAdmission =
      agentsPage?.data?.filter(
        (a) => !['passed', 'conditional_passed'].includes(a.admissionStatus),
      ).length ?? 0;
    const todos =
      inboxPending +
      risk +
      patrol.dueToday +
      pendingAdmission;

    const counts: SidebarBadgeCounts = {};
    if (assets > 0) counts.assets = assets;
    if (detection > 0) counts.detection = detection;
    if (risk > 0) counts.risk = risk;
    if (launch > 0) counts.launch = launch;
    if (reports > 0) counts.reports = reports;
    if (todos > 0) counts.todos = todos;
    return counts;
  }, [
    agentsPage?.data,
    agentsPage?.total,
    discoveredPage?.total,
    findingsPage?.data,
    remediationsPage?.data,
    stats,
    tasksPage?.data,
  ]);
}
