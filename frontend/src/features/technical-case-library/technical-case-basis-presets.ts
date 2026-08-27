export const CUSTOM_CASE_BASIS_VALUE = '__custom__';

export const TECHNICAL_CASE_BASIS_PRESETS = [
  'OWASP ASI01 目标劫持 / Prompt Injection',
  'OWASP ASI02 敏感信息泄露',
  'OWASP ASI04 工具滥用',
  'OWASP ASI07 系统 Prompt 泄露',
  'OWASP ASI09 过度依赖与错误输出',
  'OWASP ASI10 无界消耗',
  'OWASP LLM Top 10 · Prompt Injection',
  'OWASP LLM Top 10 · Sensitive Information Disclosure',
  'OWASP LLM08 向量与嵌入弱点 · RAG 投毒',
  '企业内部智能体安全基线',
  '行业合规检测要求（金融 / 政务）',
  '红队攻击样本库',
] as const;

export function resolveCaseBasisPreset(
  caseBasis: string | undefined,
  fallback?: string,
): { preset: string; custom: string } {
  const value = (caseBasis || fallback || '').trim();
  if (!value) {
    return {
      preset: TECHNICAL_CASE_BASIS_PRESETS[0],
      custom: '',
    };
  }
  if ((TECHNICAL_CASE_BASIS_PRESETS as readonly string[]).includes(value)) {
    return { preset: value, custom: '' };
  }
  return { preset: CUSTOM_CASE_BASIS_VALUE, custom: value };
}

export function buildCaseBasisValue(preset: string, custom: string): string {
  if (preset === CUSTOM_CASE_BASIS_VALUE) {
    return custom.trim();
  }
  return preset.trim();
}
