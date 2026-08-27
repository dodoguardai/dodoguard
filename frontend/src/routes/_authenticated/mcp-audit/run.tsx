import { createFileRoute } from '@tanstack/react-router';
import { McpAuditRunPage } from '@/features/mcp-audit/run-page';

export const Route = createFileRoute('/_authenticated/mcp-audit/run')({
  validateSearch: (search: { mcpSlug?: string } = {}) => ({
    mcpSlug:
      typeof search.mcpSlug === 'string' && search.mcpSlug.trim() ? search.mcpSlug.trim() : undefined,
  }),
  component: McpAuditRunPage,
});
