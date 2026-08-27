import { createFileRoute } from '@tanstack/react-router';
import { Models } from '@/features/models';

export const Route = createFileRoute('/_authenticated/models/')({
  component: Models,
});
