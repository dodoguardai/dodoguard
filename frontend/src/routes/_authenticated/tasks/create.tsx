import { createFileRoute } from '@tanstack/react-router';
import { CreateTaskPage } from '@/features/tasks/create-task-page';

type Surface =
  | 'all'
  | 'dify'
  | 'agent'
  | 'coze'
  | 'fastgpt'
  | 'n8n'
  | 'tencent-adp'
  | 'mcp'
  | 'tool'
  | 'platform'
  | 'llm';

export const Route = createFileRoute('/_authenticated/tasks/create')({
  validateSearch: (search: { surface?: string; agentId?: string } = {}) => {
    const allowed: Surface[] = [
      'all',
      'dify',
      'agent',
      'coze',
      'fastgpt',
      'n8n',
      'tencent-adp',
      'mcp',
      'tool',
      'platform',
      'llm',
    ];
    const resolvedSurface = allowed.includes(search.surface as Surface)
      ? (search.surface as Surface)
      : 'all';
    const surface = resolvedSurface === 'dify' ? 'agent' : resolvedSurface;
    const agentId =
      typeof search.agentId === 'string' && search.agentId.trim()
        ? search.agentId.trim()
        : undefined;
    return { surface, agentId };
  },
  component: CreateTaskPage,
});
