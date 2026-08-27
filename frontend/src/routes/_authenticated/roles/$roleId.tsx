/**
 * Role Detail Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { RoleDetail } from '@/features/roles/components/role-detail';

const roleDetailSearchSchema = z.object({
  edit: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/roles/$roleId')({
  component: RoleDetailPage,
  validateSearch: roleDetailSearchSchema,
});

function RoleDetailPage() {
  const { roleId } = Route.useParams();
  const search = Route.useSearch();
  return <RoleDetail roleId={roleId} edit={search.edit} />;
}
