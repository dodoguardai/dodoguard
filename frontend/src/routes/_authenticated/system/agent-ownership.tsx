import { createFileRoute } from '@tanstack/react-router';
import { AgentOwnershipMgmtPage } from '@/features/agent-governance/agent-ownership-mgmt-page';

export const Route = createFileRoute('/_authenticated/system/agent-ownership')({
  component: AgentOwnershipMgmtPage,
});
