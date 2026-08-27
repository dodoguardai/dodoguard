import {
  buildDifyStructuredInventory,
  DIFY_STRUCTURE_SCHEMA_VERSION,
  parseDifyYamlToStructure,
} from '../../backend/src/services/difyConfigStructure';
import {
  assertDifyAppExport,
  parseDifyExportYaml,
} from '../../backend/src/services/difyConfigAuditService';

describe('difyConfigStructure', () => {
  const minimalYaml = `kind: app
version: "0.1"
app:
  name: TestApp
  mode: workflow
workflow:
  conversation_variables: []
  environment_variables: []
  features: {}
  graph:
    nodes:
      - id: n1
        type: custom
        data:
          type: llm
          title: Main LLM
          desc: primary
    edges: []
`;

  it('parseDifyYamlToStructure returns inventory and truncated false for small graph', () => {
    const { inventory, truncated, normalized, parseSummary } =
      parseDifyYamlToStructure(minimalYaml);
    expect(truncated).toBe(false);
    expect(normalized.nodes.length).toBeGreaterThanOrEqual(1);
    expect(parseSummary.node_count).toBeGreaterThanOrEqual(1);
    expect(inventory.app).toEqual({ name: 'TestApp', mode: 'workflow' });
    expect(inventory.nodes).toHaveLength(1);
    expect(inventory.nodes[0]).toMatchObject({
      id: 'n1',
      dataType: 'llm',
      title: 'Main LLM',
    });
    expect(inventory.nodesByGroup.llm).toHaveLength(1);
    expect(inventory.edgeCount).toBe(0);
  });

  it('buildDifyStructuredInventory groups by graphType when data.type missing', () => {
    const yaml = `kind: app
workflow:
  graph:
    nodes:
      - id: x
        type: start
    edges: []
`;
    const root = parseDifyExportYaml(yaml);
    assertDifyAppExport(root);
    const { inventory } = buildDifyStructuredInventory(root as Record<string, unknown>);
    expect(inventory.nodes[0].dataType).toBe('start');
    expect(inventory.nodesByGroup.start).toHaveLength(1);
  });

  it('parseDifyYamlToStructure throws for missing workflow', () => {
    const yaml = `kind: app
app:
  name: X
`;
    expect(() => parseDifyYamlToStructure(yaml)).toThrow(/Missing workflow/);
  });

  it('parseDifyYamlToStructure extracts knowledge-retrieval details, logicalPointer, and search blob', () => {
    const yaml = `kind: app
version: "0.1"
app:
  name: KbApp
  mode: workflow
workflow:
  conversation_variables: []
  environment_variables: []
  features: {}
  graph:
    nodes:
      - id: kr-node
        type: custom
        data:
          type: knowledge-retrieval
          title: Retrieve
          dataset_ids:
            - "11111111-1111-1111-1111-111111111111"
          dataset_configs:
            - name: Secret Docs
          query_variable_selector:
            - "sys.query"
          metadata_filtering_mode: tag
          multiple_retrieval_config:
            top_k: 3
            reranking_enable: true
            reranking_model:
              model: rerank-x
              provider: reranker
          top_k: 5
    edges: []
`;
    const { inventory, truncated, normalized } = parseDifyYamlToStructure(yaml);
    expect(truncated).toBe(false);
    expect(inventory.structureSchemaVersion).toBe(DIFY_STRUCTURE_SCHEMA_VERSION);
    expect(inventory.structureSearchBlob).toBeDefined();
    expect(inventory.structureSearchBlob).toContain('knowledge-retrieval');
    expect(inventory.structureSearchBlob).toContain('normalizedDigest');
    const n = inventory.nodes.find((x) => x.id === 'kr-node');
    expect(n?.logicalPointer).toBe('/workflow/graph/nodes/0/data');
    expect(n?.details).toMatchObject({
      kind: 'knowledge-retrieval',
      dataset_names: ['Secret Docs'],
      top_k: 5,
      metadata_filtering_mode: 'tag',
    });
    const d = n?.details as any;
    expect(d.query_variable_selector).toEqual(['sys.query']);
    expect(d.multiple_retrieval_config).toMatchObject({
      top_k: 3,
      reranking_enable: true,
    });
    expect(Array.isArray((n?.details as { dataset_ids?: unknown }).dataset_ids)).toBe(true);
  });
});
