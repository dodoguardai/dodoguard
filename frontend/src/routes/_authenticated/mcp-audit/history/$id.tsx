import { createFileRoute } from '@tanstack/react-router';
import { McpAuditHistoryDetailPage } from '@/features/mcp-audit/history-detail';

export const Route = createFileRoute('/_authenticated/mcp-audit/history/$id')({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <McpAuditHistoryDetailPage id={id} />;
}
