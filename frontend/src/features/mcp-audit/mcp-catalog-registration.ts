/**
 * Resolve a stable MCP slug for local audit-history linking.
 * Audited MCP inventory is owned by capability component registry (server), not localStorage.
 */

import {
  inferSkillCatalogSlug,
  resolveUniqueSkillSlug,
} from '@/features/skills-md-audit/skills-audit-helpers';
import { reservedMcpSlugsFromExtras } from './mcp-catalog-extras';
import type { McpAuditData } from '@/services/api/mcp-audit';

export function registerUserMcpAfterAudit(params: {
  linkedMcpSlug?: string;
  zipFileName?: string;
  audit: McpAuditData;
}): string {
  if (params.linkedMcpSlug?.trim()) {
    return params.linkedMcpSlug.trim();
  }

  const proposed = inferSkillCatalogSlug({
    zipFileName: params.zipFileName,
    scannedFiles: params.audit.scannedFiles,
  });
  const reserved = reservedMcpSlugsFromExtras();
  return resolveUniqueSkillSlug(proposed, reserved, new Set());
}
