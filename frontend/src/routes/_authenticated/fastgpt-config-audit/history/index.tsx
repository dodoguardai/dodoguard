import { createFileRoute } from '@tanstack/react-router';
import { FastGptConfigAuditHistoryListPage } from '@/features/fastgpt-config-audit/history-list';

export const Route = createFileRoute('/_authenticated/fastgpt-config-audit/history/')({
  component: FastGptConfigAuditHistoryListPage,
});
