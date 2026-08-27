import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { WorkflowConfigAssetDetailPage } from '@/features/workflow-config-assets/workflow-config-asset-detail';

export const Route = createFileRoute('/_authenticated/workflow-config-assets/$assetId')({
  component: () => {
    const { assetId } = Route.useParams();
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    if (pathname.includes('/node-type-detail')) {
      return <Outlet />;
    }
    return <WorkflowConfigAssetDetailPage assetId={assetId} />;
  },
});
