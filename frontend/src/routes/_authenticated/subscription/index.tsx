import { createFileRoute } from '@tanstack/react-router';
import { Subscription } from '@/features/subscription';

export const Route = createFileRoute('/_authenticated/subscription/')({
  component: Subscription,
});
