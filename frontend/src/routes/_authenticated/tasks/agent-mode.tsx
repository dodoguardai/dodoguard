import { createFileRoute } from '@tanstack/react-router';
import { AgentModePage } from '@/features/agent-mode/agent-mode-page';
import { AGENT_MODE_SURFACES, type AgentModeSurface } from '@/features/agent-mode/agent-mode-layout';

export const Route = createFileRoute('/_authenticated/tasks/agent-mode')({
  validateSearch: (search: Record<string, unknown> = {}) => {
    const raw = search.surface;
    const surface =
      typeof raw === 'string' && AGENT_MODE_SURFACES.includes(raw as AgentModeSurface)
        ? (raw as AgentModeSurface)
        : ('dify' satisfies AgentModeSurface);
    return { surface };
  },
  component: () => {
    const { surface } = Route.useSearch();
    return <AgentModePage surface={surface} />;
  },
});
