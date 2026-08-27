import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';
import { getAuditModule } from '@/features/audit/audit-registry';
import { reportsApi } from '@/services/api/reports';
import {
  mergeSkillsAuditHistoryRows,
  reportToSkillsAuditHistoryRow,
  type SkillsAuditHistoryRow,
} from './skills-audit-helpers';

function getLocalSkillsAuditHistoryItems(): SkillsAuditHistoryRow[] {
  const mod = getAuditModule('skills-md');
  return (mod?.storage.list() ?? []) as SkillsAuditHistoryRow[];
}

export function useSkillsAuditHistoryItems() {
  const localItems = getLocalSkillsAuditHistoryItems();

  const { data: serverRows = [], isLoading } = useQuery({
    queryKey: ['skills-md-audit-history-reports'],
    queryFn: async () => {
      const page = await reportsApi.list({ limit: 50, offset: 0 });
      return page.data
        .map(reportToSkillsAuditHistoryRow)
        .filter((row): row is SkillsAuditHistoryRow => row !== null);
    },
    retry: false,
    staleTime: 30_000,
  });

  const items = useMemo(
    () => mergeSkillsAuditHistoryRows(localItems, serverRows),
    [localItems, serverRows],
  );

  return { items, isLoading };
}

export function useSkillsAuditHistoryItem(id: string) {
  const localItem = getAuditModule('skills-md')?.storage.getById(id) as SkillsAuditHistoryRow | null;

  const { data: serverItem, isLoading } = useQuery({
    queryKey: ['skills-md-audit-history-report', id],
    queryFn: async () => {
      const report = await reportsApi.get(id);
      const row = reportToSkillsAuditHistoryRow(report);
      if (!row) {
        throw new Error('Not a skills audit report');
      }
      return row;
    },
    enabled: !localItem && Boolean(id),
    retry: false,
  });

  return {
    item: localItem ?? serverItem ?? null,
    isLoading: !localItem && isLoading,
  };
}
