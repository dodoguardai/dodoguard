import { createFileRoute } from '@tanstack/react-router';
import { FastGptConfigAuditHistoryDetailPage } from '@/features/fastgpt-config-audit/history-detail';

export const Route = createFileRoute('/_authenticated/fastgpt-config-audit/history/$id')({
  component: FastGptConfigAuditHistoryDetailPageRoute,
});

function FastGptConfigAuditHistoryDetailPageRoute() {
  const { id } = Route.useParams();
  return <FastGptConfigAuditHistoryDetailPage id={id} />;
}
