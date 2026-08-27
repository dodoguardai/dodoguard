import { createFileRoute } from '@tanstack/react-router';
import { TaskConfigReviewPage } from '@/features/tasks/components/task-config-review-page';

function parsePositiveInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return Math.floor(v);
  }
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
    const n = Number.parseInt(v.trim(), 10);
    return n > 0 ? n : undefined;
  }
  return undefined;
}

export const Route = createFileRoute('/_authenticated/tasks/config-review/$taskId')({
  validateSearch: (search: Record<string, unknown>) => ({
    vuln: typeof search.vuln === 'string' && search.vuln.trim() ? search.vuln.trim() : undefined,
    /** 1-based YAML line: scroll highlight target (from task detail / finding links). */
    line: parsePositiveInt(search.line),
    ruleId:
      typeof search.ruleId === 'string' && search.ruleId.trim() ? search.ruleId.trim() : undefined,
  }),
  component: TaskConfigReviewRoute,
});

function TaskConfigReviewRoute() {
  const { taskId } = Route.useParams();
  return <TaskConfigReviewPage taskId={taskId} />;
}
