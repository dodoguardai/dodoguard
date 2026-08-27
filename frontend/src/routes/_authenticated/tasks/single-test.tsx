import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/tasks/single-test')({
  beforeLoad: ({ location }) => {
    const path = location.pathname.replace(/\/$/, '');
    if (path === '/tasks/single-test') {
      throw redirect({
        to: '/expert-toolbox/dynamic-probe',
        search: { mode: 'list' },
      });
    }
  },
  component: SingleTestLayout,
});

function SingleTestLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.includes('/multi-round')) {
    return <Outlet />;
  }
  return null;
}
