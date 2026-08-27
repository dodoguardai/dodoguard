/**
 * Shared scan strategy types.
 */

export type ScanStrategy =
  | 'quick'
  | 'standard'
  | 'deep_offline'
  | 'online_enhanced'
  | 'debug'
  | 'llm_only';
export type ScanArtifactKind = 'skills' | 'mcp' | 'tool';

/** 仅 Skill/MCP 专项引擎（不含 Gitleaks / Semgrep / OSV / Grype） */
export const SKILL_MCP_ENGINE_NAMES = [
  'builtin_rules',
  'skillspector',
  'cisco_skill_scanner',
  'snyk_agent_scan',
  'llm',
] as const;

export const SCAN_STRATEGY_META: Record<
  ScanStrategy,
  { labelZh: string; labelEn: string; hintZh: string; hintEn: string }
> = {
  quick: {
    labelZh: '快速扫描',
    labelEn: 'Quick',
    hintZh: 'SkillSpector + Cisco + Snyk Agent Scan（无 LLM）',
    hintEn: 'SkillSpector + Cisco + Snyk Agent Scan, no LLM',
  },
  standard: {
    labelZh: '标准扫描',
    labelEn: 'Standard',
    hintZh: 'SkillSpector + Cisco + Snyk Agent Scan + 大模型复审（降噪、定级、合并）',
    hintEn: 'SkillSpector + Cisco + Snyk Agent Scan + LLM triage',
  },
  deep_offline: {
    labelZh: '深度扫描',
    labelEn: 'Deep',
    hintZh: 'SkillSpector + Cisco + Snyk Agent Scan + 大模型语义复审（新增发现）',
    hintEn: 'SkillSpector + Cisco + Snyk Agent Scan + full LLM semantic audit',
  },
  online_enhanced: {
    labelZh: '在线增强',
    labelEn: 'Online enhanced',
    hintZh: '标准扫描 + LLM（已合并到深度扫描）',
    hintEn: 'Standard + LLM (legacy)',
  },
  debug: {
    labelZh: '调试模式',
    labelEn: 'Debug',
    hintZh: '手动指定引擎组合',
    hintEn: 'Run selected engines only',
  },
  llm_only: {
    labelZh: '仅 LLM 审计',
    labelEn: 'LLM only',
    hintZh: '兼容旧版单引擎接口',
    hintEn: 'Legacy LLM-only audit',
  },
};

/** 主界面下拉：3 种常用模式 */
export const SCAN_STRATEGIES_UI: ScanStrategy[] = ['quick', 'standard', 'deep_offline'];

/** 高级设置里可选 */
export const SCAN_STRATEGIES_ADVANCED: ScanStrategy[] = ['debug'];

/** @deprecated 使用 SCAN_STRATEGY_META + SCAN_STRATEGIES_UI */
export const SCAN_STRATEGIES = (Object.keys(SCAN_STRATEGY_META) as ScanStrategy[]).map((id) => ({
  id,
  ...SCAN_STRATEGY_META[id],
}));

export function getScanStrategyMeta(id: ScanStrategy) {
  return SCAN_STRATEGY_META[id];
}
