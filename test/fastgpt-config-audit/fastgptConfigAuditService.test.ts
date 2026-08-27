import {
  assertFastGptWorkflowExport,
  extractFastGptSecuritySubset,
  parseFastGptExportJson,
} from '../../backend/src/services/fastgptConfigAuditService';

describe('fastgptConfigAuditService', () => {
  const minimalFastGpt = JSON.stringify({
    nodes: [
      {
        nodeId: 'workflowStartNodeId',
        name: 'Start',
        flowNodeType: 'workflowStart',
        inputs: [],
        outputs: [],
      },
      {
        nodeId: 'chat1',
        name: 'AI',
        flowNodeType: 'chatNode',
        inputs: [{ key: 'model', value: 'gpt-4o-mini' }],
        outputs: [],
      },
    ],
    edges: [
      { source: 'workflowStartNodeId', target: 'chat1', sourceHandle: 'a', targetHandle: 'b' },
    ],
    chatConfig: { welcomeText: 'Hi' },
  });

  it('parses valid minimal FastGPT-like JSON', () => {
    const root = parseFastGptExportJson(minimalFastGpt);
    assertFastGptWorkflowExport(root);
    const { subset, truncated } = extractFastGptSecuritySubset(root as Record<string, unknown>);
    expect(Array.isArray(subset.nodes)).toBe(true);
    expect((subset.nodes as unknown[]).length).toBe(2);
    expect(subset.chatConfig).toBeDefined();
    expect(truncated).toBe(false);
  });

  it('rejects Dify app export shape', () => {
    const raw = JSON.stringify({
      kind: 'app',
      workflow: { graph: { nodes: [], edges: [] } },
      nodes: [{ nodeId: 'x', flowNodeType: 'workflowStart' }],
    });
    const root = parseFastGptExportJson(raw);
    expect(() => assertFastGptWorkflowExport(root)).toThrow(/Dify application export/);
  });

  it('rejects Coze-like export without flowNodeType', () => {
    const raw = JSON.stringify({
      schema_version: '1',
      mode: 'workflow',
      nodes: [{ id: '1', type: 'start', title: 'S' }],
    });
    const root = parseFastGptExportJson(raw);
    expect(() => assertFastGptWorkflowExport(root)).toThrow(/Coze workflow export/);
  });

  it('rejects JSON without nodes', () => {
    const raw = JSON.stringify({ nodes: [] });
    const root = parseFastGptExportJson(raw);
    expect(() => assertFastGptWorkflowExport(root)).toThrow(/Missing nodes/);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseFastGptExportJson('[')).toThrow(/Invalid JSON/);
  });

  it('rejects oversized input', () => {
    const huge = 'x'.repeat(5 * 1024 * 1024 + 1);
    expect(() => parseFastGptExportJson(huge)).toThrow(/exceeds maximum/);
  });
});
