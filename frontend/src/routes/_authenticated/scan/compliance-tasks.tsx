import { createFileRoute } from '@tanstack/react-router';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Shell } from '@/features/compliance-case-library/shared';
import { ComplianceReportOverlay } from '@/features/compliance-detection/compliance-report-overlay';
import { ComplianceDetectionTasksPage } from '@/features/compliance-detection/compliance-tasks-page';

export const Route = createFileRoute('/_authenticated/scan/compliance-tasks')({
  validateSearch: (search: Record<string, unknown> = {}) => {
    const panel = search.panel === 'full' ? 'full' : undefined;
    const returnTo =
      typeof search.returnTo === 'string' && search.returnTo.startsWith('/')
        ? search.returnTo
        : undefined;
    const create =
      search.create === true || search.create === '1' || search.create === 'true';
    const assetId =
      typeof search.assetId === 'string' && search.assetId.trim()
        ? search.assetId.trim()
        : undefined;
    return {
      ...(panel ? { panel } : {}),
      ...(returnTo ? { returnTo } : {}),
      ...(create ? { create: true as const } : {}),
      ...(assetId ? { assetId } : {}),
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { panel, returnTo, create, assetId } = Route.useSearch();
  const detailMatch = location.pathname.match(/^\/scan\/compliance-tasks\/([^/]+)$/);
  const taskId = detailMatch?.[1] ? decodeURIComponent(detailMatch[1]) : null;
  const closeTaskDetail = () => {
    if (returnTo) {
      void navigate({ to: returnTo });
      return;
    }
    const historyIndex = Number(window.history.state?.idx ?? 0);
    if (historyIndex > 0) {
      window.history.back();
      return;
    }
    void navigate({ to: '/scan/compliance-tasks', search: {} });
  };

  if (taskId) {
    return (
      <Shell>
        <ComplianceReportOverlay
          taskId={taskId}
          open
          initialPanel={panel === 'full' ? 'full' : 'overview'}
          presentation="inline"
          onClose={closeTaskDetail}
        />
      </Shell>
    );
  }

  return (
    <ComplianceDetectionTasksPage
      initialDetailTaskId={null}
      initialDetailPanel="overview"
      autoOpenCreate={Boolean(create)}
      initialCreateAssetId={assetId}
    />
  );
}
