import { createFileRoute } from '@tanstack/react-router';
import { DifyConfigAuditHistoryListPage } from '@/features/dify-config-audit/history-list';

export const Route = createFileRoute('/_authenticated/dify-config-audit/history/')({
  component: DifyConfigAuditHistoryListPage,
});
