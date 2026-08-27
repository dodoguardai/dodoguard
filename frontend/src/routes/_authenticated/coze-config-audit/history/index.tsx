import { createFileRoute } from '@tanstack/react-router';
import { CozeConfigAuditHistoryListPage } from '@/features/coze-config-audit/history-list';

export const Route = createFileRoute('/_authenticated/coze-config-audit/history/')({
  component: CozeConfigAuditHistoryListPage,
});
