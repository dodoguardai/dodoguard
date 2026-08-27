import {
  COZE_STRUCTURE_SCHEMA_VERSION,
  parseCozeYamlToStructure,
} from '../../backend/src/services/cozeConfigStructure';

describe('cozeConfigStructure', () => {
  const minimalYaml = `schema_version: "1"
mode: workflow
nodes:
  - id: node_llm_1
    type: llm
    title: Main
  - id: node_plugin_1
    type: plugin
    apiName: test
`;

  it('parseCozeYamlToStructure returns inventory and normalized graph (chain fallback without edges)', () => {
    const { inventory, truncated, normalized, parseSummary, parseErrors } =
      parseCozeYamlToStructure(minimalYaml);
    expect(truncated).toBe(false);
    expect(normalized).toBeDefined();
    expect(normalized!.nodes).toHaveLength(2);
    expect(normalized!.edges).toHaveLength(1);
    expect(normalized!.edges[0].source).toBe('node_llm_1');
    expect(normalized!.edges[0].target).toBe('node_plugin_1');
    expect(parseErrors).toHaveLength(1);
    expect(parseErrors[0].level).toBe('warning');
    expect(parseSummary.node_count).toBe(2);
    expect(parseSummary.node_type_distribution).toMatchObject({ llm: 1, plugin: 1 });
    expect(inventory.structureSchemaVersion).toBe(COZE_STRUCTURE_SCHEMA_VERSION);
    expect(inventory.nodes).toHaveLength(2);
    expect(inventory.nodes[0]).toMatchObject({
      id: 'node_llm_1',
      dataType: 'llm',
      graphType: 'llm',
      title: 'Main',
      logicalPointer: '/nodes/0',
    });
    expect(inventory.nodes[1].logicalPointer).toBe('/nodes/1');
    expect(inventory.nodesByGroup.llm).toHaveLength(1);
    expect(inventory.nodesByGroup.plugin).toHaveLength(1);
    expect(inventory.structureSearchBlob).toContain('coze');
  });
});
