import {
  assertCozeWorkflowExport,
  extractCozeSecuritySubset,
  parseCozeExportYaml,
} from '../../backend/src/services/cozeConfigAuditService';

describe('cozeConfigAuditService', () => {
  const minimalCoze = `schema_version: 1.0.0
name: Test
mode: workflow
nodes:
  - id: "1"
    type: start
    title: Start
  - id: "2"
    type: end
    title: End
edges: []
`;

  it('parses valid minimal Coze-like YAML', () => {
    const root = parseCozeExportYaml(minimalCoze);
    expect(root).toBeDefined();
    assertCozeWorkflowExport(root);
    const { subset, truncated } = extractCozeSecuritySubset(root as Record<string, unknown>);
    expect(subset.name).toBe('Test');
    expect(truncated).toBe(false);
  });

  it('rejects Dify app export shape', () => {
    const yaml = `kind: app
workflow:
  graph:
    nodes: []
    edges: []
`;
    const root = parseCozeExportYaml(yaml);
    expect(() => assertCozeWorkflowExport(root)).toThrow(/Dify application export/);
  });

  it('rejects YAML without nodes', () => {
    const yaml = `schema_version: "1"
mode: workflow
`;
    const root = parseCozeExportYaml(yaml);
    expect(() => assertCozeWorkflowExport(root)).toThrow(/Missing nodes/);
  });

  it('rejects invalid YAML', () => {
    expect(() => parseCozeExportYaml('[')).toThrow(/Invalid YAML/);
  });
});
