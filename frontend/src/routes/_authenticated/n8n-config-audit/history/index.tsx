import { createFileRoute } from '@tanstack/react-router';
import { N8nConfigAuditHistoryListPage } from '@/features/n8n-config-audit/history-list';

export const Route = createFileRoute('/_authenticated/n8n-config-audit/history/')({
  component: N8nConfigAuditHistoryListPage,
});

