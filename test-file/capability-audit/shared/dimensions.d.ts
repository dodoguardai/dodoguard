/**
 * ClawHub / SAFESKILL 风格 17 维安全维度（与石墨文章对齐）
 */
export declare const CAPABILITY_AUDIT_DIMENSION_IDS: readonly [
  'command_injection',
  'prompt_injection',
  'data_exfiltration',
  'hardcoded_secrets',
  'unauthorized_tool_call',
  'code_obfuscation',
  'social_engineering',
  'resource_abuse',
  'supply_chain_attack',
  'privilege_escalation',
  'malicious_guidance',
  'skill_md_inconsistency',
  'code_quality',
  'bytecode_tampering',
  'trigger_hijacking',
  'unicode_steganography',
  'transitive_trust_abuse',
];
export type CapabilityAuditDimensionId = (typeof CAPABILITY_AUDIT_DIMENSION_IDS)[number];
/** @deprecated 旧 11 维 ID → 新维度 */
export declare const LEGACY_DIMENSION_ALIASES: Record<string, CapabilityAuditDimensionId>;
export declare function isCapabilityAuditDimensionId(
  v: string | undefined,
): v is CapabilityAuditDimensionId;
export declare function normalizeDimensionId(
  v: string | undefined,
): CapabilityAuditDimensionId | undefined;
/** Lucide icon names for dimension cards */
export declare const DIMENSION_ICON: Record<CapabilityAuditDimensionId, string>;
export declare function dimensionLabel(id: CapabilityAuditDimensionId, isZh: boolean): string;
export declare const CAPABILITY_AUDIT_DIMENSION_COUNT: 17;
