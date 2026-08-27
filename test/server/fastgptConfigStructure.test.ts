import { tryParseFastGptStructureForRules } from '../../backend/src/services/fastgptConfigStructure';

describe('tryParseFastGptStructureForRules', () => {
  it('parses minimal FastGPT export JSON', () => {
    const json = JSON.stringify({
      nodes: [
        {
          nodeId: 'n1',
          flowNodeType: 'workflowStart',
          name: 'Start',
        },
        {
          nodeId: 'n2',
          flowNodeType: 'chatNode',
          name: 'Chat',
        },
      ],
      edges: [{ source: 'n1', target: 'n2' }],
    });
    const parsed = tryParseFastGptStructureForRules(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.inventory.nodes).toHaveLength(2);
    expect(parsed!.inventory.nodes[0].dataType).toBe('workflowStart');
    expect(parsed!.inventory.structureSearchBlob).toContain('fastgpt');
  });

  it('returns null for Dify-shaped export', () => {
    const yamlLike = JSON.stringify({
      kind: 'app',
      workflow: { nodes: [] },
    });
    expect(tryParseFastGptStructureForRules(yamlLike)).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(tryParseFastGptStructureForRules('')).toBeNull();
    expect(tryParseFastGptStructureForRules('   ')).toBeNull();
  });
});
