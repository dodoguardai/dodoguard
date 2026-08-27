import { createFileRoute } from '@tanstack/react-router';
import { TaskEdit } from '@/features/tasks/components/task-edit';

export const Route = createFileRoute('/_authenticated/tasks/$taskId/edit')({
  component: () => {
    const { taskId } = Route.useParams();
    return <TaskEdit taskId={taskId} />;
  },
});
