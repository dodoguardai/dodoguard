import { createFileRoute } from '@tanstack/react-router';
import { RiskClosedLoopPage } from '@/features/risk-closed-loop/risk-closed-loop-page';
import type { RiskClosedLoopTab } from '@/features/risk-closed-loop/risk-closed-loop-utils';

export const Route = createFileRoute('/_authenticated/scan/remediation')({
  validateSearch: (search: Record<string, unknown> = {}) => {
    const tab = search.tab;
    const validTabs: RiskClosedLoopTab[] = ['workbench', 'retest', 'closed'];
    return {
      tab: validTabs.includes(tab as RiskClosedLoopTab) ? (tab as RiskClosedLoopTab) : undefined,
      taskId: typeof search.taskId === 'string' && search.taskId.trim() ? search.taskId.trim() : undefined,
      riskId: typeof search.riskId === 'string' && search.riskId.trim() ? search.riskId.trim() : undefined,
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { tab, taskId, riskId } = Route.useSearch();
  return (
    <RiskClosedLoopPage
      initialTab={tab ?? 'workbench'}
      initialTaskId={taskId ?? null}
      initialRiskId={riskId ?? null}
    />
  );
}
