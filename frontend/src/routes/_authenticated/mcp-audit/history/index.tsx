import { createFileRoute } from '@tanstack/react-router';
import { McpAuditHistoryListPage } from '@/features/mcp-audit/history-list';

export const Route = createFileRoute('/_authenticated/mcp-audit/history/')({
  component: McpAuditHistoryListPage,
});
