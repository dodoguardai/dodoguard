import { normalizeDifyWorkflow } from '../../backend/src/services/difyDsl/normalizeDifyWorkflow';
import {
  assertDifyAppExport,
  parseDifyExportYaml,
} from '../../backend/src/services/difyConfigAuditService';

describe('normalizeDifyWorkflow', () => {
  const yaml = `kind: app
version: "0.1"
app:
  name: Flow
  mode: workflow
workflow:
  features: {}
  graph:
    nodes:
      - id: n_start
        type: start
        position: { x: 10, y: 20 }
        data:
          type: start
          title: Start
      - id: n_if
        type: custom
        position: { x: 200, y: 20 }
        data:
          type: if-else
          title: Branch
          cases:
            - case_id: "true"
              logical_operator: or
              conditions: []
            - case_id: "false"
              logical_operator: or
              conditions: []
      - id: n_tool
        type: custom
        data:
          type: tool
          title: Tool
          tool_name: demo
          tool_parameters:
            q:
              type: mixed
              value: '{{#n_start.text#}}'
      - id: n_kr
        type: custom
        data:
          type: knowledge-retrieval
          title: KR
          dataset_ids: ["11111111-1111-1111-1111-111111111111"]
          query_variable_selector: []
    edges:
      - id: e0
        source: n_start
        target: n_if
      - id: e1
        source: n_if
        target: n_tool
        sourceHandle: "true"
      - id: e2
        source: n_if
        target: n_kr
        sourceHandle: "false"
      - id: e3
        source: n_tool
        target: n_kr
        sourceHandle: "fail-branch"
`;

  it('classifies edge_kind and builds branches', () => {
    const root = parseDifyExportYaml(yaml);
    assertDifyAppExport(root);
    const { workflow, parseSummary } = normalizeDifyWorkflow(root as Record<string, unknown>);
    expect(workflow.edges).toHaveLength(4);
    const kinds = workflow.edges.map((e) => e.edge_kind);
    expect(kinds).toContain('normal');
    expect(kinds).toContain('branch_true');
    expect(kinds).toContain('branch_false');
    expect(kinds).toContain('fail_branch');
    const ifNode = workflow.nodes.find((n) => n.node_id === 'n_if');
    expect(ifNode?.branches).toHaveLength(2);
    expect(parseSummary.branch_count).toBeGreaterThanOrEqual(3);
    expect(parseSummary.fail_branch_count).toBe(1);
  });

  it('extracts tool parameter refs and knowledge payload', () => {
    const root = parseDifyExportYaml(yaml);
    assertDifyAppExport(root);
    const { workflow } = normalizeDifyWorkflow(root as Record<string, unknown>);
    const tool = workflow.nodes.find((n) => n.node_id === 'n_tool');
    expect(tool?.payload.kind).toBe('tool');
    const tp = tool?.payload.tool_parameters as Record<string, { refs?: string[] }>;
    expect(tp?.q?.refs).toContain('n_start.text');
    const kr = workflow.nodes.find((n) => n.node_id === 'n_kr');
    expect(kr?.payload.kind).toBe('knowledge-retrieval');
    expect(Array.isArray(kr?.payload.dataset_ids)).toBe(true);
  });
});
