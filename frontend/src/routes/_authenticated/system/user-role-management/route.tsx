import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/system/user-role-management')({
  component: () => <Outlet />,
});
