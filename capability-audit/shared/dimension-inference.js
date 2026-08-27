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
var dimension_inference_exports = {};
__export(dimension_inference_exports, {
  hasDangerousEvalSignal: () => hasDangerousEvalSignal,
  inferSkillAuditDimension: () => inferSkillAuditDimension,
  isLocalSandboxJsEval: () => isLocalSandboxJsEval,
  isMetaScanFinding: () => isMetaScanFinding,
  isSkillAuditDimensionId: () => isSkillAuditDimensionId,
});
module.exports = __toCommonJS(dimension_inference_exports);
var import_dimensions = require('./dimensions');
function haystack(f) {
  return `${f.issue ?? ''}
${f.evidence ?? ''}
${f.triageNote ?? ''}
${f.location ?? ''}`.toLowerCase();
}
function engineProblemText(f) {
  return `${f.category ?? ''}
${f.issue ?? ''}
${f.evidence ?? ''}
${f.triageNote ?? ''}`.toLowerCase();
}
function isWeakOrGenericDimension(id) {
  return (
    id === void 0 ||
    id === 'skill_md_inconsistency' ||
    id === 'code_quality' ||
    id === 'unauthorized_tool_call'
  );
}
function isLocalSandboxJsEval(f) {
  const h = engineProblemText(f);
  const hasSandbox =
    /mini_?racer|py_mini_racer|\bjs_code\.eval\s*\(/i.test(h) ||
    /\.eval\s*\(\s*(?:hk_js_decode|us_js_decode|js_hash_text|js_decode)\s*\)/i.test(h);
  if (!hasSandbox) {
    return false;
  }
  if (
    /\beval\s*\(\s*(?:r\.|res\.|response|data_text|text_data|json_str)/i.test(h) ||
    /\beval\s*\(\s*[^)]*(?:r\.text|data_text|text_data|response\.text)/i.test(h)
  ) {
    return false;
  }
  if (/mini_?racer|py_mini_racer|\bjs_code\.eval\s*\(/i.test(h) && /\.eval\s*\(/i.test(h)) {
    return true;
  }
  return /\.eval\s*\(\s*(?:hk_js_decode|us_js_decode|js_hash_text|js_decode|[a-z_][\w]*)\s*\)/i.test(
    h,
  );
}
function hasDangerousEvalSignal(f) {
  if (isLocalSandboxJsEval(f)) {
    return false;
  }
  const h = engineProblemText(f);
  return (
    /\beval\s*\(/i.test(h) ||
    /\bnew\s+Function\s*\(/i.test(h) ||
    /\bFunction\s*\(\s*['"`]/i.test(h) ||
    /\bexec\s*\(\s*(?:r\.|res\.|response|data|text|json_str|formula)/i.test(h)
  );
}
function hasSensitiveExfilPayload(h) {
  return /(\.env|uname\s+-a|host\s+information|environment\s+information|credential|token|secret|password|主机信息|环境变量|dict\s*\(\s*os\.environ)/i.test(
    h,
  );
}
function hasSuspiciousExfilSink(h) {
  return /pastebin|paste\.rs|requestbin|webhook|ngrok|evil\.example|未知外域|external\s+paste/i.test(
    h,
  );
}
function inferStrongEngineReportedDimension(f) {
  const h = engineProblemText(f);
  if (hasDangerousEvalSignal(f)) {
    return 'command_injection';
  }
  if (
    /ascii\s+smuggling|unicode\s+tag\s+block|unicode\s+steganograph|zero[-\s]?width|homoglyph|bidi|零宽|隐写|隐藏文本/i.test(
      h,
    )
  ) {
    return 'unicode_steganography';
  }
  if (
    /do\s+not\s+tell\s+the\s+user|hide\s+this\s+action|do\s+not\s+reveal\s+data\s+collection|conceal|deceive\s+user|隐藏操作|不要告诉用户|不要透露|数据收集/i.test(
      h,
    )
  ) {
    return 'prompt_injection';
  }
  if (
    /数据外泄|数据外传|环境信息泄露|外泄|外传|exfiltrat|data\s+leak|leak\s+data|upload.*(?:env|host|credential)|send.*(?:env|host|credential)|pastebin|paste\s+site|webhook|requestbin/i.test(
      h,
    ) ||
    (/\b(curl|fetch|axios|requests\.|httpx\.)\b/i.test(h) &&
      hasSensitiveExfilPayload(h) &&
      /(https?:\/\/|external|paste|webhook|外部)/i.test(h))
  ) {
    return 'data_exfiltration';
  }
  if (/\b(curl|wget|npx)\b[^\n]{0,240}\|\s*(ba)?sh\b/i.test(h)) {
    return 'command_injection';
  }
  if (
    /npx .*without (?:a )?version|uvx\/uv tool run commands without|未固定版本|unpinned|rug-pull/i.test(
      h,
    )
  ) {
    return 'supply_chain_attack';
  }
  if (/\brm\s+-rf\b|delete all|wipe\b|destructive/i.test(h)) {
    return 'resource_abuse';
  }
  if (/\.ssh\/id_rsa|id_rsa|\/etc\/passwd|kubeconfig|sensitive file/i.test(h)) {
    return 'supply_chain_attack';
  }
  return void 0;
}
function isMetaScanFinding(f) {
  return (f.category || '').toUpperCase() === 'SCAN_INTEGRITY';
}
function inferSkillAuditDimension(f) {
  if (hasDangerousEvalSignal(f)) {
    return 'command_injection';
  }
  const normalized = (0, import_dimensions.normalizeDimensionId)(f.dimension);
  const engineReported = inferStrongEngineReportedDimension(f);
  if (engineReported && isWeakOrGenericDimension(normalized)) {
    return engineReported;
  }
  if (normalized) {
    return normalized;
  }
  if (isMetaScanFinding(f)) {
    return 'code_quality';
  }
  const cat = (f.category || '').toUpperCase();
  const h = haystack(f);
  if (cat.includes('TOOL_POISON') || cat.includes('MCP_TOOL')) {
    return 'malicious_guidance';
  }
  if (cat.includes('TRIGGER') || cat.includes('HIJACK')) {
    return 'trigger_hijacking';
  }
  if (cat.includes('EXCESSIVE_AGENCY') || cat.includes('AGENCY')) {
    return 'unauthorized_tool_call';
  }
  if (cat.includes('POLICY_VIOLATION') || cat === 'POLICY_VIOLATION') {
    if (/hidden|conceal|unicode|steganograph/i.test(h)) {
      return 'unicode_steganography';
    }
    if (/binary|bytecode|\.pyc|\.class|unanalyzable/i.test(h)) {
      return 'bytecode_tampering';
    }
    if (/quality|style|lint/i.test(h)) {
      return 'code_quality';
    }
    if (/license|manifest|skill\.md|description/i.test(h)) {
      return 'skill_md_inconsistency';
    }
    return 'supply_chain_attack';
  }
  if (cat.includes('OBFUSCATION') || cat === 'OBFUSCATION') {
    return /unicode|zero-width|homoglyph/i.test(h) ? 'unicode_steganography' : 'code_obfuscation';
  }
  if (cat.includes('SCAN_INTEGRITY') || cat.includes('CISCO_SKILL_SCANNER')) {
    if (/hidden/i.test(h)) {
      return 'unicode_steganography';
    }
    if (/binary|license/i.test(h)) {
      return 'skill_md_inconsistency';
    }
  }
  if (cat.includes('A_SECRET') || cat.includes('SECRET') || cat.includes('CREDENTIAL')) {
    return 'hardcoded_secrets';
  }
  if (cat.includes('E_PROMPT') || cat.includes('PROMPT_INJECT') || cat.includes('JAILBREAK')) {
    return 'prompt_injection';
  }
  if (cat.includes('C_NETWORK') || cat.includes('NETWORK') || cat.includes('SSRF')) {
    return 'data_exfiltration';
  }
  if (cat.includes('D_DATA') || cat.includes('EXPOSURE') || cat.includes('EXFIL')) {
    return 'data_exfiltration';
  }
  if (cat.includes('B_SUPPLY') || cat.includes('SUPPLY_CHAIN')) {
    return 'supply_chain_attack';
  }
  if (cat.includes('F_TOOL') || cat.includes('TOOL_ABUSE') || cat.includes('MCP')) {
    if (/\brm\s+-rf\b|delete all|format disk|wipe\b/i.test(h)) {
      return 'resource_abuse';
    }
    if (/\bsudo\b|chmod\s+4777|privilege|escalat/i.test(h)) {
      return 'privilege_escalation';
    }
    if (
      /\beval\s*\(|\bexec\s*\(|subprocess\.|child_process|\$\(|`|\|\s*sh\b|command injection/i.test(
        h,
      )
    ) {
      return 'command_injection';
    }
    return 'unauthorized_tool_call';
  }
  if (cat.includes('F_WORKFLOW') || cat.includes('WORKFLOW')) {
    return 'prompt_injection';
  }
  if (
    /bash\s+-i\s+>&\s*\/dev\/tcp\/|\/dev\/tcp\/|\/dev\/udp\/|\bnc\s+(-[ecvp]+)+|\bsocat\b.*exec|mkfifo\s+\/tmp\//i.test(
      h,
    )
  ) {
    return 'command_injection';
  }
  if (
    /\beval\s*\(|\bnew\s+Function\s*\(|subprocess\.(?:call|run|Popen|check_call)|child_process|os\.system\s*\(/i.test(
      h,
    )
  ) {
    return 'command_injection';
  }
  if (
    /\b(ignore previous|jailbreak|override system|developer mode|hidden instruction|\bDAN\b)\b/i.test(
      h,
    )
  ) {
    return 'prompt_injection';
  }
  if (/\b(trigger|when user|always run|broad matcher|hook)\b/i.test(h)) {
    return 'trigger_hijacking';
  }
  if (/\b(trust|downstream|delegate|chain of trust)\b/i.test(h)) {
    return 'transitive_trust_abuse';
  }
  if (/\b(phish|social engineer|impersonat|deceive user)\b/i.test(h)) {
    return 'social_engineering';
  }
  if (/\b(intent.?code|divergence|understate|mismatch)\b/i.test(h)) {
    return 'malicious_guidance';
  }
  if (/\b(\.pyc|\.class|bytecode|binary file)\b/i.test(h)) {
    return 'bytecode_tampering';
  }
  if (/\b(unicode|zero-width|homoglyph|bidi|steganograph)\b/i.test(h)) {
    return 'unicode_steganography';
  }
  if (/\b(curl|wget)[^\n]{0,200}\|\s*(ba)?sh\b/i.test(h)) {
    return 'command_injection';
  }
  if (
    /\b(exfiltrat|upload.*to|数据外泄|数据外传)\b/i.test(h) ||
    (/\b(http:\/\/|https:\/\/|fetch\(|axios\.|requests\.|webhook)\b/i.test(h) &&
      (hasSensitiveExfilPayload(h) || hasSuspiciousExfilSink(h)))
  ) {
    return 'data_exfiltration';
  }
  if (/\b(curl|wget|bash\s+-c|pip install|npm install http|invoke-webrequest)\b/i.test(h)) {
    return 'unauthorized_tool_call';
  }
  if (/\b(api[_-]?key|bearer|token|password|\.env|credential|hardcoded)\b/i.test(h)) {
    return 'hardcoded_secrets';
  }
  if (/\b(\.ssh\/|id_rsa|\/etc\/passwd|kubeconfig|\.ds_store)\b/i.test(h)) {
    return 'supply_chain_attack';
  }
  if (/\b(cron|launchd|systemd|cpu|memory|infinite loop|resource)\b/i.test(h)) {
    return 'resource_abuse';
  }
  if (/\b(base64|atob|btoa|fromcharcode|obfuscat|_0x[0-9a-f]+)\b/i.test(h)) {
    return 'code_obfuscation';
  }
  if (/\b(sudo|chmod\s+777|setuid|privilege)\b/i.test(h)) {
    return 'privilege_escalation';
  }
  if (/\$\(|`.*`|\|\s*sh|;\s*rm\b|command injection|subprocess|os\.system/i.test(h)) {
    return 'command_injection';
  }
  if (/\b(todo|fixme|quality|smell|lint)\b/i.test(h)) {
    return 'code_quality';
  }
  if (/\b(skill\.md|readme|manifest|license|description mismatch)\b/i.test(h)) {
    return 'skill_md_inconsistency';
  }
  return 'code_quality';
}
function isSkillAuditDimensionId(v) {
  return (0, import_dimensions.isCapabilityAuditDimensionId)(v);
}
// Annotate the CommonJS export names for ESM import in node:
0 &&
  (module.exports = {
    hasDangerousEvalSignal,
    inferSkillAuditDimension,
    isLocalSandboxJsEval,
    isMetaScanFinding,
    isSkillAuditDimensionId,
  });
