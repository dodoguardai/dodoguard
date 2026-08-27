import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router';
import { DialogueTaskDetailOverlay } from '@/features/detection-scanning/dialogue-task-detail-overlay';
import { TechnicalRiskDetectionPage, TechnicalRiskShell } from '@/features/detection-scanning';

function parseCreateSearch(search: Record<string, unknown> = {}) {
  const create =
    search.create === true || search.create === '1' || search.create === 'true';
  const assetId =
    typeof search.assetId === 'string' && search.assetId.trim()
      ? search.assetId.trim()
      : undefined;
  return {
    ...(create ? { create: true as const } : {}),
    ...(assetId ? { assetId } : {}),
  };
}

export const Route = createFileRoute('/_authenticated/scan/technical-risks')({
  validateSearch: (search: Record<string, unknown> = {}) => parseCreateSearch(search),
  component: RouteComponent,
});

function RouteComponent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { create, assetId } = Route.useSearch();
  const detailMatch = location.pathname.match(/^\/scan\/technical-risks\/([^/]+)$/);
  const taskId = detailMatch?.[1] ? decodeURIComponent(detailMatch[1]) : null;

  if (taskId) {
    return (
      <TechnicalRiskShell>
        <DialogueTaskDetailOverlay
          taskId={taskId}
          open
          presentation="inline"
          onClose={() => {
            void navigate({ to: '/scan/technical-risks' });
          }}
        />
      </TechnicalRiskShell>
    );
  }

  return (
    <TechnicalRiskDetectionPage
      autoOpenCreate={Boolean(create)}
      initialCreateAssetId={assetId}
    />
  );
}
