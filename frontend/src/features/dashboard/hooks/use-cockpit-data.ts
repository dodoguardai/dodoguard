/**
 * Live data for Security Cockpit overview.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { useOrganizationStore } from '@/stores/organization-store';
import { assetIntakeApi } from '@/services/api/asset-intake';
import { dashboardApi } from '@/services/api/dashboard';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import {
  buildCockpitModel,
  type CockpitModel,
  type CockpitRange,
} from '../lib/cockpit-metrics';

export function useCockpitData(initialRange: CockpitRange = '30d') {
  const organizationId = useOrganizationStore((s) => s.currentOrg?.id);
  const { hasPermission, isLoading: isPermissionsLoading } = usePermissions();
  const [range, setRange] = useState<CockpitRange>(initialRange);
  const canReadDashboard = hasPermission('dashboard', 'read');
  const canManageTasks = hasPermission('task', 'manage');

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats', organizationId, 'cockpit'],
    queryFn: () => dashboardApi.getStats(organizationId!),
    enabled: !!organizationId && !isPermissionsLoading && canReadDashboard,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const assetsQuery = useQuery({
    queryKey: ['assets', 'agents', 'cockpit', organizationId],
    queryFn: () => assetIntakeApi.listAgents({ page: 1, limit: 300 }),
    enabled: !!organizationId && !isPermissionsLoading && canManageTasks,
    staleTime: 60 * 1000,
  });

  const discoveredQuery = useQuery({
    queryKey: ['assets', 'discovered', 'cockpit', organizationId],
    queryFn: () =>
      assetIntakeApi.listDiscovered({ page: 1, limit: 50, claimStatus: 'pending' }),
    enabled: !!organizationId && !isPermissionsLoading && canManageTasks,
    staleTime: 60 * 1000,
  });

  const remediationsQuery = useQuery({
    queryKey: ['scan', 'remediations', 'cockpit', organizationId],
    queryFn: () => detectionScanningApi.listRemediations({ page: 1, limit: 300 }),
    enabled: !!organizationId && !isPermissionsLoading && canManageTasks,
    staleTime: 60 * 1000,
  });

  const findingsQuery = useQuery({
    queryKey: ['scan', 'findings', 'cockpit', organizationId],
    queryFn: () => detectionScanningApi.listFindings({ page: 1, limit: 300, status: 'open' }),
    enabled: !!organizationId && !isPermissionsLoading && canManageTasks,
    staleTime: 60 * 1000,
  });

  const tasksQuery = useQuery({
    queryKey: ['scan', 'tasks', 'cockpit', organizationId],
    queryFn: () => detectionScanningApi.listTasks({ page: 1, limit: 300 }),
    enabled: !!organizationId && !isPermissionsLoading && canManageTasks,
    staleTime: 60 * 1000,
  });

  const isLoading =
    !!organizationId &&
    (isPermissionsLoading ||
      statsQuery.isLoading ||
      assetsQuery.isLoading ||
      remediationsQuery.isLoading ||
      findingsQuery.isLoading ||
      tasksQuery.isLoading);

  const model: CockpitModel = useMemo(
    () =>
      buildCockpitModel({
        range,
        stats: statsQuery.data,
        assets: assetsQuery.data?.data ?? [],
        discoveredPending: discoveredQuery.data?.total ?? 0,
        remediations: remediationsQuery.data?.data ?? [],
        findings: findingsQuery.data?.data ?? [],
        scanTasks: tasksQuery.data?.data ?? [],
      }),
    [
      range,
      statsQuery.data,
      assetsQuery.data?.data,
      discoveredQuery.data?.total,
      remediationsQuery.data?.data,
      findingsQuery.data?.data,
      tasksQuery.data?.data,
    ],
  );

  return {
    range,
    setRange,
    model,
    isLoading,
    organizationId,
    stats: statsQuery.data,
    assets: assetsQuery.data?.data ?? [],
    discovered: discoveredQuery.data?.data ?? [],
    discoveredPending: discoveredQuery.data?.total ?? 0,
    remediations: remediationsQuery.data?.data ?? [],
    findings: findingsQuery.data?.data ?? [],
    scanTasks: tasksQuery.data?.data ?? [],
  };
}
