import { createFileRoute } from '@tanstack/react-router';
import { TeamDetail } from '@/features/teams/components/team-detail';

export const Route = createFileRoute('/_authenticated/teams/$teamId')({
  component: () => {
    const { teamId } = Route.useParams();
    return <TeamDetail teamId={teamId} />;
  },
});
