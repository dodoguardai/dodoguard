/**
 * ClawHub / SAFESKILL 风格 17 维安全维度（与石墨文章对齐）
 */

export const CAPABILITY_AUDIT_DIMENSION_IDS = [
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
] as const;

export type CapabilityAuditDimensionId = (typeof CAPABILITY_AUDIT_DIMENSION_IDS)[number];

/** @deprecated 旧 11 维 ID → 新维度 */
export const LEGACY_DIMENSION_ALIASES: Record<string, CapabilityAuditDimensionId> = {
  remote_execution: 'unauthorized_tool_call',
  data_leakage: 'data_exfiltration',
  credential_access: 'hardcoded_secrets',
  persistence: 'resource_abuse',
  destructive: 'resource_abuse',
  obfuscation: 'code_obfuscation',
  sensitive_file_access: 'supply_chain_attack',
  network_abuse: 'data_exfiltration',
  command_injection: 'command_injection',
  privilege_escalation: 'privilege_escalation',
  prompt_injection: 'prompt_injection',
};

const DIMENSION_SET = new Set<string>(CAPABILITY_AUDIT_DIMENSION_IDS);

export function isCapabilityAuditDimensionId(
  v: string | undefined,
): v is CapabilityAuditDimensionId {
  return v !== undefined && DIMENSION_SET.has(v);
}

export function normalizeDimensionId(
  v: string | undefined,
): CapabilityAuditDimensionId | undefined {
  if (!v) {
    return undefined;
  }
  const lower = v.trim().toLowerCase();
  if (isCapabilityAuditDimensionId(lower)) {
    return lower;
  }
  return LEGACY_DIMENSION_ALIASES[lower];
}

const DIMENSION_LABELS_ZH: Record<CapabilityAuditDimensionId, string> = {
  command_injection: '危险命令/代码执行',
  prompt_injection: '诱导模型绕过规则',
  data_exfiltration: '数据外传',
  hardcoded_secrets: '硬编码密钥',
  unauthorized_tool_call: '未经说明的工具/外连',
  code_obfuscation: '代码被故意改得难读',
  social_engineering: '话术欺骗用户操作',
  resource_abuse: '过度占用资源',
  supply_chain_attack: '供应链攻击',
  privilege_escalation: '权限提升',
  malicious_guidance: '教模型做危险事',
  skill_md_inconsistency: 'Skill说明与实际不符',
  code_quality: '代码质量问题',
  bytecode_tampering: '编译程序被改过',
  trigger_hijacking: '自动触发条件被篡改',
  unicode_steganography: '用隐藏字符夹带指令',
  transitive_trust_abuse: '借可信依赖夹带风险',
};

const DIMENSION_LABELS_EN: Record<CapabilityAuditDimensionId, string> = {
  command_injection: 'Dangerous command / code execution',
  prompt_injection: 'Trick model into bypassing rules',
  data_exfiltration: 'Data exfiltration',
  hardcoded_secrets: 'Hardcoded secrets',
  unauthorized_tool_call: 'Undeclared tool / outbound call',
  code_obfuscation: 'Deliberately hard-to-read code',
  social_engineering: 'Trick the user into unsafe actions',
  resource_abuse: 'Excessive resource use',
  supply_chain_attack: 'Supply chain attack',
  privilege_escalation: 'Privilege escalation',
  malicious_guidance: 'Instructs the model to do harm',
  skill_md_inconsistency: 'SKILL.md does not match behavior',
  code_quality: 'Code quality issue',
  bytecode_tampering: 'Compiled bytecode was altered',
  trigger_hijacking: 'Auto-trigger conditions tampered',
  unicode_steganography: 'Hidden characters carry instructions',
  transitive_trust_abuse: 'Risk via a trusted dependency',
};

/** Lucide icon names for dimension cards */
export const DIMENSION_ICON: Record<CapabilityAuditDimensionId, string> = {
  command_injection: 'syringe',
  prompt_injection: 'brain',
  data_exfiltration: 'upload',
  hardcoded_secrets: 'key-round',
  unauthorized_tool_call: 'wrench',
  code_obfuscation: 'shuffle',
  social_engineering: 'shield-alert',
  resource_abuse: 'hard-drive',
  supply_chain_attack: 'link-2',
  privilege_escalation: 'arrow-up-from-line',
  malicious_guidance: 'magnet',
  skill_md_inconsistency: 'file-text',
  code_quality: 'search',
  bytecode_tampering: 'cog',
  trigger_hijacking: 'target',
  unicode_steganography: 'eye',
  transitive_trust_abuse: 'link',
};

export function dimensionLabel(id: CapabilityAuditDimensionId, isZh: boolean): string {
  return isZh ? DIMENSION_LABELS_ZH[id] : DIMENSION_LABELS_EN[id];
}

export const CAPABILITY_AUDIT_DIMENSION_COUNT = CAPABILITY_AUDIT_DIMENSION_IDS.length;
