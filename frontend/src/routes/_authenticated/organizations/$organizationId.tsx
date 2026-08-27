import { createFileRoute } from '@tanstack/react-router';
import { OrganizationDetail } from '@/features/organizations/components/organization-detail';

export const Route = createFileRoute('/_authenticated/organizations/$organizationId')({
  component: () => {
    const { organizationId } = Route.useParams();
    return <OrganizationDetail organizationId={organizationId} />;
  },
});
