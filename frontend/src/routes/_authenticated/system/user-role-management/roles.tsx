import { createFileRoute } from '@tanstack/react-router';
import { UserRoleManagement } from '@/features/user-role-management';

export const Route = createFileRoute('/_authenticated/system/user-role-management/roles')({
  component: UserRoleManagement,
});
