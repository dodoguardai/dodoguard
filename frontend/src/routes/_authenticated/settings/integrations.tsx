import { createFileRoute, redirect } from '@tanstack/react-router';

/** Legacy Integrations LLM UI moved to Settings → Models. */
export const Route = createFileRoute('/_authenticated/settings/integrations')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/models' });
  },
  component: () => null,
});
