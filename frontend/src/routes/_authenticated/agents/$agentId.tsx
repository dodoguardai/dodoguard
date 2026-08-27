import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { AgentDetail } from '@/features/agents/components/agent-detail';

type Tab = 'overview' | 'configuration' | 'statistics' | 'history';

export const Route = createFileRoute('/_authenticated/agents/$agentId')({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab; edit?: string } => {
    const t = search.tab;
    const editParam = search.edit;
    const edit = typeof editParam === 'string' ? editParam : undefined;

    let tab: Tab | undefined;
    if (t === 'overview' || t === 'configuration' || t === 'statistics' || t === 'history') {
      tab = t;
    }

    return { tab, edit };
  },
  component: () => {
    const { agentId } = Route.useParams();
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const workflowPath = `/agents/${agentId}/workflow-config-assets`;
    if (pathname === workflowPath || pathname.startsWith(`${workflowPath}/`)) {
      return <Outlet />;
    }
    const { tab, edit } = Route.useSearch();
    return <AgentDetail agentId={agentId} initialTab={tab} edit={edit} />;
  },
});
