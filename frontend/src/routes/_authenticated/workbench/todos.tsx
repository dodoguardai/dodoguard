import { createFileRoute } from '@tanstack/react-router';
import { SecurityTodosPage } from '@/features/workbench/security-todos-page';

export const Route = createFileRoute('/_authenticated/workbench/todos')({
  component: SecurityTodosPage,
});
