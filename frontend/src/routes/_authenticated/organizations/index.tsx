import { createFileRoute, Navigate } from '@tanstack/react-router';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';

export const Route = createFileRoute('/_authenticated/organizations/')({
  component: () => <Navigate to={userRoleManagementTabPath('organizations')} replace />,
});
