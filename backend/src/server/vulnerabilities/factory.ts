import { VulnerabilityType, VulnerabilityTypeStrategy } from './types';
import { BaseVulnerabilityStrategy } from './strategies/baseStrategy';

const baseStrategy = new BaseVulnerabilityStrategy();

export function getVulnerabilityTypeStrategy(type: VulnerabilityType): VulnerabilityTypeStrategy {
  // For now all types share the same base behavior.
  // This switch is here as an explicit extension point.
  switch (type) {
    case 'agent':
    case 'mcp':
    case 'llm':
    case 'tool':
    case 'platform':
    case 'dify':
    case 'coze':
    case 'fastgpt':
    default:
      return baseStrategy;
  }
}
