import { createFileRoute } from '@tanstack/react-router';
import { AgentWorkflowConfigAssetsPage } from '@/features/agents/agent-workflow-config-assets-page';

export const Route = createFileRoute('/_authenticated/agents/$agentId/workflow-config-assets')({
  component: () => {
    const { agentId } = Route.useParams();
    return <AgentWorkflowConfigAssetsPage agentId={agentId} />;
  },
});
