'use strict';
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all) __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === 'object') || typeof from === 'function') {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: () => from[key],
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, '__esModule', { value: true }), mod);
var dimensions_exports = {};
__export(dimensions_exports, {
  CAPABILITY_AUDIT_DIMENSION_COUNT: () => CAPABILITY_AUDIT_DIMENSION_COUNT,
  CAPABILITY_AUDIT_DIMENSION_IDS: () => CAPABILITY_AUDIT_DIMENSION_IDS,
  DIMENSION_ICON: () => DIMENSION_ICON,
  LEGACY_DIMENSION_ALIASES: () => LEGACY_DIMENSION_ALIASES,
  dimensionLabel: () => dimensionLabel,
  isCapabilityAuditDimensionId: () => isCapabilityAuditDimensionId,
  normalizeDimensionId: () => normalizeDimensionId,
});
module.exports = __toCommonJS(dimensions_exports);
const CAPABILITY_AUDIT_DIMENSION_IDS = [
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
const LEGACY_DIMENSION_ALIASES = {
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
const DIMENSION_SET = new Set(CAPABILITY_AUDIT_DIMENSION_IDS);
function isCapabilityAuditDimensionId(v) {
  return v !== void 0 && DIMENSION_SET.has(v);
}
function normalizeDimensionId(v) {
  if (!v) {
    return void 0;
  }
  const lower = v.trim().toLowerCase();
  if (isCapabilityAuditDimensionId(lower)) {
    return lower;
  }
  return LEGACY_DIMENSION_ALIASES[lower];
}
const DIMENSION_LABELS_ZH = {
  command_injection: '\u5371\u9669\u547D\u4EE4/\u4EE3\u7801\u6267\u884C',
  prompt_injection: '\u8BF1\u5BFC\u6A21\u578B\u7ED5\u8FC7\u89C4\u5219',
  data_exfiltration: '\u6570\u636E\u5916\u4F20',
  hardcoded_secrets: '\u786C\u7F16\u7801\u5BC6\u94A5',
  unauthorized_tool_call: '\u672A\u7ECF\u8BF4\u660E\u7684\u5DE5\u5177/\u5916\u8FDE',
  code_obfuscation: '\u4EE3\u7801\u88AB\u6545\u610F\u6539\u5F97\u96BE\u8BFB',
  social_engineering: '\u8BDD\u672F\u6B3A\u9A97\u7528\u6237\u64CD\u4F5C',
  resource_abuse: '\u8FC7\u5EA6\u5360\u7528\u8D44\u6E90',
  supply_chain_attack: '\u4F9B\u5E94\u94FE\u653B\u51FB',
  privilege_escalation: '\u6743\u9650\u63D0\u5347',
  malicious_guidance: '\u6559\u6A21\u578B\u505A\u5371\u9669\u4E8B',
  skill_md_inconsistency: 'Skill\u8BF4\u660E\u4E0E\u5B9E\u9645\u4E0D\u7B26',
  code_quality: '\u4EE3\u7801\u8D28\u91CF\u95EE\u9898',
  bytecode_tampering: '\u7F16\u8BD1\u7A0B\u5E8F\u88AB\u6539\u8FC7',
  trigger_hijacking: '\u81EA\u52A8\u89E6\u53D1\u6761\u4EF6\u88AB\u7BE1\u6539',
  unicode_steganography: '\u7528\u9690\u85CF\u5B57\u7B26\u5939\u5E26\u6307\u4EE4',
  transitive_trust_abuse: '\u501F\u53EF\u4FE1\u4F9D\u8D56\u5939\u5E26\u98CE\u9669',
};
const DIMENSION_LABELS_EN = {
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
const DIMENSION_ICON = {
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
function dimensionLabel(id, isZh) {
  return isZh ? DIMENSION_LABELS_ZH[id] : DIMENSION_LABELS_EN[id];
}
const CAPABILITY_AUDIT_DIMENSION_COUNT = CAPABILITY_AUDIT_DIMENSION_IDS.length;
// Annotate the CommonJS export names for ESM import in node:
0 &&
  (module.exports = {
    CAPABILITY_AUDIT_DIMENSION_COUNT,
    CAPABILITY_AUDIT_DIMENSION_IDS,
    DIMENSION_ICON,
    LEGACY_DIMENSION_ALIASES,
    dimensionLabel,
    isCapabilityAuditDimensionId,
    normalizeDimensionId,
  });
