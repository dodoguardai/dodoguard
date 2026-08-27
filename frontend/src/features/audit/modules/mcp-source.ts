/**
 * MCP source audit module — registered for factory/registry.
 */

import { createAuditModule } from '../audit-factory';
import { registerAuditModule } from '../audit-registry';
import { mcpAuditApi } from '@/services/api/mcp-audit';
import type { AnalyzeMcpArchiveRequest, McpAuditData } from '@/services/api/mcp-audit';

const module = createAuditModule<AnalyzeMcpArchiveRequest, McpAuditData>({
  type: 'mcp-source',
  label: 'MCP Source Audit',
  historyLabel: 'MCP Source Audit History',
  routePath: 'mcp-audit',
  analyze: async (input) => mcpAuditApi.analyzeArchive(input),
  storage: { maxItems: 50 },
});

registerAuditModule(module);

export { module as mcpSourceAuditModule };
