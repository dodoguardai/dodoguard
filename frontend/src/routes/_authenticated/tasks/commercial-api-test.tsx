import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { CommercialApiTestListPage } from '@/features/tasks/commercial-api-test-list-page';

export const Route = createFileRoute('/_authenticated/tasks/commercial-api-test')({
  component: CommercialApiTestLayout,
});

function CommercialApiTestLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.endsWith('/create')) {
    return <Outlet />;
  }
  return <CommercialApiTestListPage />;
}
