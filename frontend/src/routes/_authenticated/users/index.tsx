import { createFileRoute, Navigate } from '@tanstack/react-router';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';

export const Route = createFileRoute('/_authenticated/users/')({
  component: () => <Navigate to={userRoleManagementTabPath('users')} replace />,
});
