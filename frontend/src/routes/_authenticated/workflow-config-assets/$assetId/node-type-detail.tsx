import { createFileRoute } from '@tanstack/react-router';
import { WorkflowConfigAssetNodeTypeDetailPage } from '@/features/workflow-config-assets/workflow-config-asset-node-type-detail';

export const Route = createFileRoute('/_authenticated/workflow-config-assets/$assetId/node-type-detail')({
  validateSearch: (search: Record<string, unknown>) => ({
    nodeType: typeof search.nodeType === 'string' ? search.nodeType : '',
  }),
  component: () => {
    const { assetId } = Route.useParams();
    const { nodeType } = Route.useSearch();
    return <WorkflowConfigAssetNodeTypeDetailPage assetId={assetId} nodeType={nodeType} />;
  },
});
