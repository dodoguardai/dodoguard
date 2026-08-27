import { createFileRoute } from '@tanstack/react-router';
import { SystemAgentsMgmtPage } from '@/features/system-mgmt/system-agents-mgmt-page';

export const Route = createFileRoute('/_authenticated/system/agents-mgmt')({
  component: SystemAgentsMgmtPage,
});
