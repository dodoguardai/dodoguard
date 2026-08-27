import { describe, expect, it } from '@jest/globals';
import {
  formatDifyInventoryNodeDetailsBrief,
  formatDifyInventoryNodeLabel,
  formatRuleHitConfigNodeDisplay,
  resolveInventoryNodeForRuleHit,
} from '../../backend/src/services/difyConfigStructure';

describe('formatDifyInventoryNodeDetailsBrief / formatDifyInventoryNodeLabel', () => {
  it('includes provider and model in label', () => {
    const brief = formatDifyInventoryNodeDetailsBrief({
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-7B-Instruct',
    });
    expect(brief).toContain('厂商：siliconflow');
    expect(brief).toContain('模型：');
    const label = formatDifyInventoryNodeLabel({
      id: 'n1',
      graphType: 'llm',
      dataType: 'llm',
      title: 'LLM',
      details: { provider: 'openai', model: 'gpt-4o' },
    });
    expect(label).toContain('LLM（llm） · n1');
    expect(label).toContain('厂商：openai');
    expect(label).toContain('模型：gpt-4o');
  });
});

describe('resolveInventoryNodeForRuleHit / formatRuleHitConfigNodeDisplay', () => {
  const nodes = [
    {
      id: 'start-1',
      graphType: 'start',
      dataType: 'start',
      title: 'User entry',
      logicalPointer: '/workflow/graph/nodes/0/data',
    },
    {
      id: 'llm-2',
      graphType: 'llm',
      dataType: 'llm',
      title: 'Answer',
      logicalPointer: '/workflow/graph/nodes/1/data',
    },
  ];

  it('resolves by /workflow/graph/nodes/{index}', () => {
    const hit = { logicalPath: '/workflow/graph/nodes/1/data/model' };
    const n = resolveInventoryNodeForRuleHit('', nodes, hit);
    expect(n?.id).toBe('llm-2');
    const label = formatDifyInventoryLabel(n!);
    expect(label).toContain('Answer');
    expect(label).toContain('llm-2');
  });

  it('resolves inferred zh suffix node id', () => {
    const hit = { logicalPath: '/workflow/graph/nodes/9（节点 id: start-1）' };
    const n = resolveInventoryNodeForRuleHit('', nodes, hit);
    expect(n?.id).toBe('start-1');
  });

  it('formatRuleHitConfigNodeDisplay returns null when no match', () => {
    expect(formatRuleHitConfigNodeDisplay('x', nodes, { logicalPath: '/other/path' })).toBeNull();
  });

  it('resolves by matchStart offset in yaml', () => {
    const yaml = 'workflow:\n  graph:\n    nodes:\n      - id: llm-2\n        type: llm\n';
    const pos = yaml.indexOf('llm-2');
    expect(pos).toBeGreaterThan(0);
    const label = formatRuleHitConfigNodeDisplay(yaml, nodes, { matchStart: pos });
    expect(label).toContain('Answer');
    expect(label).toContain('llm-2');
  });

  it('resolves structure JSON pointer /nodes/{i}', () => {
    const label = formatRuleHitConfigNodeDisplay('x', nodes, { logicalPath: '/nodes/1/foo' });
    expect(label).toContain('Answer');
    expect(label).toContain('llm-2');
  });

  it('falls back to startLine when offset cannot map (e.g. matchStart 0)', () => {
    const yaml =
      'version: "1"\nworkflow:\n  graph:\n    nodes:\n      - id: start-1\n        x: 1\n';
    const label = formatRuleHitConfigNodeDisplay(yaml, nodes, {
      matchStart: 0,
      startLine: 5,
    });
    expect(label).toContain('User entry');
    expect(label).toContain('start-1');
  });

  it('maps by evidence substring in YAML when startLine is wrong document (e.g. structure JSON line 1)', () => {
    const yaml =
      'workflow:\n  graph:\n    nodes:\n      - id: llm-2\n        provider: siliconflow\n';
    const label = formatRuleHitConfigNodeDisplay(yaml, nodes, {
      matchStart: 0,
      startLine: 1,
      matchScope: 'full_text',
      evidence: 'siliconflow',
    });
    expect(label).toContain('Answer');
    expect(label).toContain('llm-2');
  });

  it('maps by ruleName token when evidence is missing', () => {
    const yaml =
      'workflow:\n  graph:\n    nodes:\n      - id: llm-2\n        model:\n          provider: siliconflow\n';
    const label = formatRuleHitConfigNodeDisplay(yaml, nodes, {
      ruleName: '【LLM Provider】siliconflow used in config (Keyword)',
      startLine: 1,
      matchStart: 0,
    });
    expect(label).toContain('Answer');
    expect(label).toContain('llm-2');
  });

  it('maps by evidence in inventory details when absent from YAML', () => {
    const withDetails = [
      nodes[0],
      {
        ...nodes[1],
        details: { model: { provider: 'siliconflow' } } as Record<string, unknown>,
      },
    ];
    const yaml = 'workflow:\n  graph:\n    nodes:\n      - id: llm-2\n        type: llm\n';
    const label = formatRuleHitConfigNodeDisplay(yaml, withDetails, {
      startLine: 1,
      evidence: 'siliconflow',
    });
    expect(label).toContain('Answer');
  });
});

function formatDifyInventoryLabel(n: (typeof nodes)[0]): string {
  return formatDifyInventoryNodeLabel(n);
}
