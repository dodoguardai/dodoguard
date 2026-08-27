import { createFileRoute, Outlet } from '@tanstack/react-router';

/** Layout for expert toolbox pages (overview + platform config audit). */
export const Route = createFileRoute('/_authenticated/expert-toolbox')({
  component: () => <Outlet />,
});
