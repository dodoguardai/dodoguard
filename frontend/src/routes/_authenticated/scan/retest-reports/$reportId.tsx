import { createFileRoute } from '@tanstack/react-router';
import { RiskRetestReportPage } from '@/features/risk-closed-loop/risk-retest-report-page';

export const Route = createFileRoute('/_authenticated/scan/retest-reports/$reportId')({
  validateSearch: (search: Record<string, unknown> = {}) => ({
    taskId: typeof search.taskId === 'string' && search.taskId.trim() ? search.taskId.trim() : '',
    returnTo:
      typeof search.returnTo === 'string' && search.returnTo.trim()
        ? search.returnTo.trim()
        : '/scan/remediation',
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { reportId } = Route.useParams();
  const { taskId, returnTo } = Route.useSearch();
  return <RiskRetestReportPage reportId={reportId} taskId={taskId} returnTo={returnTo} />;
}
