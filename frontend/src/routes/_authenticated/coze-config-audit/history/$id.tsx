import { createFileRoute } from '@tanstack/react-router';
import { CozeConfigAuditHistoryDetailPage } from '@/features/coze-config-audit/history-detail';

export const Route = createFileRoute('/_authenticated/coze-config-audit/history/$id')({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <CozeConfigAuditHistoryDetailPage id={id} />;
}
