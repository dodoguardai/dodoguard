import { createFileRoute } from '@tanstack/react-router';
import { McpAuditIndexPage } from '@/features/mcp-audit/index-page';

export const Route = createFileRoute('/_authenticated/mcp-audit/')({
  component: McpAuditIndexPage,
});
