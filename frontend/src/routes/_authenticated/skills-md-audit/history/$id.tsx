import { createFileRoute } from '@tanstack/react-router';
import { SkillsMdAuditHistoryDetailPage } from '@/features/skills-md-audit/history-detail';

export const Route = createFileRoute('/_authenticated/skills-md-audit/history/$id')({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <SkillsMdAuditHistoryDetailPage id={id} />;
}
