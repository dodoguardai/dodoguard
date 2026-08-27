import { createFileRoute, Outlet } from '@tanstack/react-router';

/** Layout only — leaf routes (general, models, …) render their own page components. */
export const Route = createFileRoute('/_authenticated/settings')({
  component: () => <Outlet />,
});
