import { createFileRoute } from '@tanstack/react-router';
import { Reports } from '@/features/reports';

export type ReportsSearch = {
  taskId?: string;
};

export const Route = createFileRoute('/_authenticated/reports/')({
  validateSearch: (search: Record<string, unknown> = {}): ReportsSearch => {
    const raw = search.taskId;
    const taskId =
      typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
    return taskId ? { taskId } : {};
  },
  component: Reports,
});
