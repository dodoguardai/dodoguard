import { createFileRoute } from '@tanstack/react-router';
import { TaskDetail } from '@/features/tasks/components/task-detail';

export const Route = createFileRoute('/_authenticated/tasks/$taskId')({
  component: () => {
    const { taskId } = Route.useParams();
    return <TaskDetail taskId={taskId} />;
  },
});
