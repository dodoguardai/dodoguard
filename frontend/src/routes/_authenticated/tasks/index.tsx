import { createFileRoute } from '@tanstack/react-router';
import { Tasks } from '@/features/tasks';

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
type StatusFilter = 'all' | 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export const Route = createFileRoute('/_authenticated/tasks/')({
  validateSearch: (search: { surface?: string; status?: string } = {}) => {
    const allowedSurface: Surface[] = [
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
    const allowedStatus: StatusFilter[] = [
      'all',
      'pending',
      'running',
      'completed',
      'failed',
      'canceled',
    ];
    const surface = allowedSurface.includes(search.surface as Surface)
      ? (search.surface as Surface)
      : 'all';
    const status = allowedStatus.includes(search.status as StatusFilter)
      ? (search.status as StatusFilter)
      : 'all';
    return { surface, status };
  },
  component: Tasks,
});
