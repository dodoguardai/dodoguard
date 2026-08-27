import { describe, expect, it } from '@jest/globals';
import { getVulnerabilityTypeStrategy } from '../../backend/src/server/vulnerabilities/factory';
import {
  CreateVulnerabilityInput,
  VulnerabilityContext,
  VulnerabilityType,
} from '../../backend/src/server/vulnerabilities/types';

const baseInput: CreateVulnerabilityInput = {
  name: 'Test vuln',
  type: 'agent',
  category: 'ai-agent',
  riskLevel: 'high',
  description: 'desc',
  impactScope: 'scope',
};

const baseContext: VulnerabilityContext = {
  userId: 'user-1',
};

describe('VulnerabilityTypeStrategy factory', () => {
  const types: VulnerabilityType[] = [
    'agent',
    'mcp',
    'llm',
    'tool',
    'platform',
    'dify',
    'coze',
    'fastgpt',
  ];

  it('returns a strategy for each vulnerability type', () => {
    for (const type of types) {
      const strategy = getVulnerabilityTypeStrategy(type);
      expect(strategy).toBeDefined();
      const result = strategy.normalizeCreate({ ...baseInput, type }, baseContext);
      expect(result.insertValues.type).toBe(type);
    }
  });

  it('normalizes create payload with defaults', () => {
    const strategy = getVulnerabilityTypeStrategy('agent');
    const result = strategy.normalizeCreate(baseInput, baseContext);

    expect(result.insertValues.name).toBe(baseInput.name);
    expect(result.insertValues.type).toBe(baseInput.type);
    expect(result.insertValues.category).toBe(baseInput.category);
    expect(result.insertValues.riskLevel).toBe(baseInput.riskLevel);
    expect(result.insertValues.status).toBe('discovered');
    expect(typeof result.insertValues.affectedTargets).toBe('string');
    expect(typeof result.insertValues.tags).toBe('string');
    expect(result.insertValues.createdBy).toBe(baseContext.userId);
    expect(result.insertValues.updatedBy).toBe(baseContext.userId);
  });
});
