import { createFileRoute, redirect } from '@tanstack/react-router';

/** Legacy path — keep URL working, switch in-place on the dashboard. */
export const Route = createFileRoute('/_authenticated/quick-start')({
  beforeLoad: () => {
    throw redirect({ to: '/', search: { tab: 'quickstart' } });
  },
});
