/**
 * Capability audit variant definitions.
 */

export type CapabilityAuditVariantId = 'skills' | 'mcp' | 'tool';

export type CapabilityAuditVariant = {
  id: CapabilityAuditVariantId;
  auditType: string;
  labelZh: string;
  labelEn: string;
  icon: string;
  historyDetailPath: (id: string) => string;
};

export const CAPABILITY_AUDIT_VARIANTS: CapabilityAuditVariant[] = [
  {
    id: 'tool',
    auditType: 'tool-source',
    labelZh: '工具安全评估',
    labelEn: 'Tool Security Audit',
    icon: '⚙',
    historyDetailPath: (id) => `/capability-audit?view=run&historyId=${id}&auditType=tool-source`,
  },
  {
    id: 'skills',
    auditType: 'skills-md',
    labelZh: 'SKILLS 审计',
    labelEn: 'SKILLS Audit',
    icon: '◆',
    historyDetailPath: (id) => `/skills-md-audit/history/${id}`,
  },
  {
    id: 'mcp',
    auditType: 'mcp-source',
    labelZh: 'MCP 源码审计',
    labelEn: 'MCP Source Audit',
    icon: '▣',
    historyDetailPath: (id) => `/mcp-audit/history/${id}`,
  },
];

export function getCapabilityVariant(id: CapabilityAuditVariantId): CapabilityAuditVariant {
  const found = CAPABILITY_AUDIT_VARIANTS.find((v) => v.id === id);
  if (!found) {
    throw new Error(`Unknown capability audit variant: ${id}`);
  }
  return found;
}
