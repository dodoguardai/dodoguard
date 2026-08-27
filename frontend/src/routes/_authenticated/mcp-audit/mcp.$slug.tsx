import { createFileRoute } from '@tanstack/react-router';
import { McpAuditMcpDetailPage } from '@/features/mcp-audit/mcp-detail-page';

export const Route = createFileRoute('/_authenticated/mcp-audit/mcp/$slug')({
  component: McpAuditMcpDetailPage,
});
