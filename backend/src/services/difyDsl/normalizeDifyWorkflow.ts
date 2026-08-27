import { attachRelationsToNodes } from './attachRelations';
import { buildGraphIndexes, normalizeRawEdges } from './buildGraphIndexes';
import { attachRefsToToolPayload, collectRefsFromPayload } from './extractRefs';
import { extractApp, extractDependencies, extractFeatures } from './extractTopLevel';
import { inferProduces, inferRefsOutFromProduces, refsToConsumes } from './inferProducesConsumes';
import {
  DIFY_NORMALIZED_SCHEMA_VERSION,
  type NormalizedNode,
  type NormalizedWorkflow,
  type ParseError,
  type ParseSummary,
} from './normalizeTypes';
import { buildParseSummary } from './parseSummary';
import { extractPayloadForNodeType } from './payloads/index';
import { asNumber, asString, isRecord } from './utils';

const DEFAULT_MAX_NODES = 100;

function rawNodeId(node: Record<string, unknown>, i: number): string {
  const id = asString(node.id);
  return id && id.length > 0 ? id : `__missing_id_${i}`;
}

function extractNodeShell(
  node: Record<string, unknown>,
  index: number,
  parseErrors: ParseError[],
): NormalizedNode | null {
  const node_id = rawNodeId(node, index);
  const data = isRecord(node.data) ? node.data : null;
  const graphType = asString(node.type) ?? 'unknown';
  const node_type =
    data && typeof data.type === 'string' && data.type.trim()
      ? data.type.trim()
      : graphType !== 'unknown'
        ? graphType
        : 'unknown';
  const title = (data && asString(data.title)) || asString(node.title) || node_id;

  const pos = isRecord(node.position) ? node.position : {};
  const x = asNumber(pos.x) ?? 0;
  const y = asNumber(pos.y) ?? 0;

  let width: number | undefined;
  let height: number | undefined;
  if (isRecord(node.size)) {
    width = asNumber(node.size.width);
    height = asNumber(node.size.height);
  } else {
    width = asNumber(node.width);
    height = asNumber(node.height);
  }

  let payload: Record<string, unknown>;
  try {
    payload = extractPayloadForNodeType(node_type, data);
  } catch (e: any) {
    parseErrors.push({
      level: 'warning',
      node_id,
      field: 'payload',
      message: `Payload extract failed: ${e?.message ?? String(e)}`,
    });
    payload = { kind: 'generic', raw_data_keys: data ? Object.keys(data).slice(0, 32) : [] };
  }

  const ntLower = node_type.toLowerCase().replace(/_/g, '-');
  if (ntLower === 'tool' || ntLower === 'custom-tool' || ntLower === 'customtool') {
    attachRefsToToolPayload(payload);
  }

  const shell: NormalizedNode = {
    node_id,
    title,
    node_type,
    graph_type: graphType,
    position: { x, y },
    size:
      width != null && height != null
        ? { width, height }
        : width != null || height != null
          ? { width: width ?? 0, height: height ?? 0 }
          : undefined,
    selected: Boolean(node.selected),
    payload,
    refs_in: [],
    refs_out: [],
    produces: [],
    consumes: [],
    upstream: [],
    downstream: [],
    branches: [],
  };

  shell.refs_in = collectRefsFromPayload(node_type, payload);
  shell.produces = inferProduces(shell);
  shell.consumes = refsToConsumes(shell.refs_in);
  shell.refs_out = inferRefsOutFromProduces(shell.produces);

  return shell;
}

export function normalizeDifyWorkflow(
  root: Record<string, unknown>,
  options?: { maxNodes?: number },
): { workflow: NormalizedWorkflow; parseSummary: ParseSummary } {
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;
  const parse_errors: ParseError[] = [];

  const workflow = root.workflow;
  if (!isRecord(workflow)) {
    const emptySummary: ParseSummary = {
      node_count: 0,
      edge_count: 0,
      node_type_distribution: {},
      branch_count: 0,
      fail_branch_count: 0,
      ref_count: 0,
      unknown_node_type_count: 0,
    };
    return {
      workflow: {
        normalizedSchemaVersion: DIFY_NORMALIZED_SCHEMA_VERSION,
        app: extractApp(root),
        dependencies: extractDependencies(root),
        features: extractFeatures(root),
        nodes: [],
        edges: [],
        meta: {
          truncated: false,
          node_count_total: 0,
          edge_count_total: 0,
        },
        parse_errors: [{ level: 'error', message: 'Missing workflow' }],
      },
      parseSummary: emptySummary,
    };
  }

  const graph = isRecord(workflow.graph) ? workflow.graph : {};
  const rawNodes = Array.isArray(graph.nodes) ? (graph.nodes as unknown[]) : [];
  const rawEdges = Array.isArray(graph.edges) ? (graph.edges as unknown[]) : [];

  const node_count_total = rawNodes.length;
  const edge_count_total = rawEdges.length;

  let truncated = false;
  const nodesSlice =
    rawNodes.length > maxNodes ? ((truncated = true), rawNodes.slice(0, maxNodes)) : rawNodes;

  const allNodeIds = new Set<string>();
  rawNodes.forEach((n, i) => {
    if (isRecord(n)) {
      allNodeIds.add(rawNodeId(n, i));
    }
  });

  const normalizedEdges = normalizeRawEdges(rawEdges, allNodeIds, parse_errors);
  const indexes = buildGraphIndexes(normalizedEdges);

  const nodes: NormalizedNode[] = [];
  nodesSlice.forEach((raw, i) => {
    if (!isRecord(raw)) {
      parse_errors.push({
        level: 'warning',
        field: `nodes[${i}]`,
        message: 'Node is not an object; skipped',
      });
      return;
    }
    const shell = extractNodeShell(raw, i, parse_errors);
    if (shell) {
      nodes.push(shell);
    }
  });

  attachRelationsToNodes(nodes, indexes, parse_errors);

  const parseSummary = buildParseSummary(nodes, normalizedEdges, parse_errors);

  const wf: NormalizedWorkflow = {
    normalizedSchemaVersion: DIFY_NORMALIZED_SCHEMA_VERSION,
    app: extractApp(root),
    dependencies: extractDependencies(root),
    features: extractFeatures(root),
    nodes,
    edges: normalizedEdges,
    meta: {
      truncated,
      node_count_total,
      edge_count_total,
    },
    parse_errors,
  };

  return { workflow: wf, parseSummary };
}
