import { createFileRoute } from '@tanstack/react-router';
import { DifyConfigAuditHistoryDetailPage } from '@/features/dify-config-audit/history-detail';

export const Route = createFileRoute('/_authenticated/dify-config-audit/history/$id')({
  component: () => {
    const { id } = Route.useParams();
    return <DifyConfigAuditHistoryDetailPage id={id} />;
  },
});
