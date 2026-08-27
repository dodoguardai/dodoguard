import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/scan/technical-risks/$taskId')({
  component: () => null,
});
