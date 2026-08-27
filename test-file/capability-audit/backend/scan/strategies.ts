import type { EngineAdapter, ScanStrategy } from './types';
import { SKILL_MCP_ENGINE_NAMES } from './skill-mcp-engines';

/** Skill/MCP 标准组合：SkillSpector + Cisco + Snyk Agent Scan */
const STANDARD_SKILL_MCP_ENGINES = ['skillspector', 'cisco_skill_scanner', 'snyk_agent_scan'];
const DEEP_OFFLINE_ENGINES = [...STANDARD_SKILL_MCP_ENGINES, 'llm'];

export const STRATEGY_ENGINES: Record<Exclude<ScanStrategy, 'debug'>, string[]> = {
  llm_only: ['llm'],
  quick: STANDARD_SKILL_MCP_ENGINES,
  standard: STANDARD_SKILL_MCP_ENGINES,
  deep_offline: DEEP_OFFLINE_ENGINES,
  online_enhanced: [...STANDARD_SKILL_MCP_ENGINES, 'llm'],
};

export function enginesForStrategy(strategy: ScanStrategy, requested?: string[]): string[] {
  if (strategy === 'debug') {
    const names = requested?.length ? requested : ['skillspector'];
    return names.filter((n) =>
      SKILL_MCP_ENGINE_NAMES.includes(n as (typeof SKILL_MCP_ENGINE_NAMES)[number]),
    );
  }
  return STRATEGY_ENGINES[strategy] ?? STRATEGY_ENGINES.quick;
}

export function strategyLabel(strategy: ScanStrategy, isZh: boolean): string {
  const map: Record<ScanStrategy, [string, string]> = {
    quick: ['Quick scan', '快速扫描'],
    standard: ['Standard scan', '标准扫描'],
    deep_offline: ['Deep scan', '深度扫描'],
    online_enhanced: ['Online enhanced', '在线增强'],
    debug: ['Debug', '调试模式'],
    llm_only: ['LLM audit only', '仅 LLM 审计'],
  };
  const [en, zh] = map[strategy];
  return isZh ? zh : en;
}

export function pickAdapters(
  strategy: ScanStrategy,
  registry: Map<string, EngineAdapter>,
  requested?: string[],
): EngineAdapter[] {
  return enginesForStrategy(strategy, requested)
    .map((name) => registry.get(name))
    .filter((a): a is EngineAdapter => a !== undefined);
}
