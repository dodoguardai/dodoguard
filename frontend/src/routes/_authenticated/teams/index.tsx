import { createFileRoute, Navigate } from '@tanstack/react-router';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';

export const Route = createFileRoute('/_authenticated/teams/')({
  component: () => <Navigate to={userRoleManagementTabPath('teams')} replace />,
});
