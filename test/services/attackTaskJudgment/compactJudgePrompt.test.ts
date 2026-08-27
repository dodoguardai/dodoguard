import {
  buildCompactConfigTextJudgePrompt,
  buildConfigTextJudgePrompt,
} from '../../../backend/src/services/attackTaskJudgment/runStructuredLlmJudge';

describe('buildCompactConfigTextJudgePrompt', () => {
  const sample = {
    commandName: 'SQL injection config',
    commandContent: 'Check if user input reaches SQL tool',
    expectedSuccess: 'Dynamic SQL in tool parameters',
    nonVulnerability: 'Fixed SQL template only',
    configExcerpt: 'nodes:\n  - type: tool\n    sql: "{{query}}"',
    platform: 'dify' as const,
  };

  it('is much shorter than the full config judge prompt', () => {
    const compact = buildCompactConfigTextJudgePrompt(sample);
    const full = buildConfigTextJudgePrompt(sample);
    expect(compact.length).toBeLessThan(full.length / 5);
    expect(compact).toContain('"vulnerable"');
    expect(compact).toContain(sample.configExcerpt);
  });
});
