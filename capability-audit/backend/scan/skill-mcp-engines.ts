/**
 * Skill / MCP 专项引擎白名单（不含 Gitleaks、Semgrep、OSV、Grype 等通用扫描器）。
 */

export const SKILL_MCP_ENGINE_NAMES = [
  'builtin_rules',
  'skillspector',
  'cisco_skill_scanner',
  'snyk_agent_scan',
  'llm',
] as const;

export type SkillMcpEngineName = (typeof SKILL_MCP_ENGINE_NAMES)[number];

export function isSkillMcpEngine(name: string): name is SkillMcpEngineName {
  return (SKILL_MCP_ENGINE_NAMES as readonly string[]).includes(name);
}
