import { createFileRoute } from '@tanstack/react-router';
import { N8nConfigAuditHistoryDetailPage } from '@/features/n8n-config-audit/history-detail';

export const Route = createFileRoute('/_authenticated/n8n-config-audit/history/$id')({
  component: () => {
    const { id } = Route.useParams();
    return <N8nConfigAuditHistoryDetailPage id={id} />;
  },
});

