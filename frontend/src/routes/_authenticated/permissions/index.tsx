import { createFileRoute, Navigate } from '@tanstack/react-router';
import { userRoleManagementTabPath } from '@/features/user-role-management/constants';

export const Route = createFileRoute('/_authenticated/permissions/')({
  component: () => <Navigate to={userRoleManagementTabPath('permissions')} replace />,
});
