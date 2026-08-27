/** 扫描引擎展示名（与 backend engine name 对齐） */
export const SCAN_ENGINE_LABELS: Record<string, { zh: string; en: string }> = {
  builtin_rules: { zh: '内置规则', en: 'Builtin rules' },
  skillspector: { zh: 'SkillSpector', en: 'SkillSpector' },
  cisco_skill_scanner: { zh: 'Cisco Skill Scanner', en: 'Cisco Skill Scanner' },
  snyk_agent_scan: { zh: 'Snyk Agent Scan', en: 'Snyk Agent Scan' },
  ramparts: { zh: 'Ramparts', en: 'Ramparts' },
  llm: { zh: 'LLM 语义审计', en: 'LLM audit' },
  llm_triage: { zh: 'LLM 复审', en: 'LLM triage' },
  archive_parser: { zh: '归档解析', en: 'Archive parser' },
  scan_orchestrator: { zh: '扫描编排', en: 'Scan orchestrator' },
};

export function engineLabel(name: string, isZh: boolean): string {
  const entry = SCAN_ENGINE_LABELS[name];
  if (entry) {
    return isZh ? entry.zh : entry.en;
  }
  return name;
}
