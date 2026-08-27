import { createFileRoute } from '@tanstack/react-router';
import { WorkflowConfigAssetsListPage } from '@/features/workflow-config-assets/workflow-config-assets-list';

export const Route = createFileRoute('/_authenticated/workflow-config-assets/')({
  component: WorkflowConfigAssetsListPage,
});
