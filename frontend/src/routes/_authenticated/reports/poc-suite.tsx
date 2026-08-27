import { createFileRoute } from '@tanstack/react-router';
import { PocSuitePage } from '@/features/reports/poc-bundle/poc-suite-page';

export type PocSuiteSearch = {
  taskId?: string;
};

export const Route = createFileRoute('/_authenticated/reports/poc-suite')({
  validateSearch: (search: Record<string, unknown> = {}): PocSuiteSearch => {
    const raw = search.taskId;
    const taskId =
      typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
    return taskId ? { taskId } : {};
  },
  component: PocSuitePage,
});
