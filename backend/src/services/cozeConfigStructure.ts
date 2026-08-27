/**
 * Coze workflow YAML → structured inventory + slim normalized graph for the config-review Beta sheet
 * (response shape aligned with Dify structure API). Graph uses export edges when mappable; else sequential chain.
 */

import { sanitizeObject } from '../util/sanitizer';
import { assertCozeWorkflowExport, parseCozeExportYaml } from './cozeConfigAuditService';
import type { DifyNodeInventoryItem, DifyStructuredInventory } from './difyConfigStructure';
import {
  DIFY_NORMALIZED_SCHEMA_VERSION,
  type NormalizedEdge,
  type NormalizedNode,
  type NormalizedWorkflow,
  type ParseError,
  type ParseSummary,
} from './difyDsl/normalizeTypes';

const MAX_NODES_IN_STRUCTURE = 100;
const MAX_STRUCTURE_SEARCH_BLOB = 200_000;

/** Distinct from DIFY_STRUCTURE_SCHEMA_VERSION so clients can tell source if needed. */
export const COZE_STRUCTURE_SCHEMA_VERSION = 1;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function buildCozeNodeDetails(
  node: Record<string, unknown>,
  cozeType: string,
): Record<string, unknown> {
  const code = node.code;
  const slim: Record<string, unknown> = {
    kind: cozeType,
    title: node.title,
    description: node.description,
    node_inputs: node.node_inputs,
    parameters: node.parameters,
    datasetList: node.datasetList,
    apiName: node.apiName,
    isPersonalOnly: node.isPersonalOnly,
    topK: node.topK,
    enableChatHistory: node.enableChatHistory,
    has_code: typeof code === 'string' && code.length > 0,
  };
  return sanitizeObject(slim, { context: 'coze-config-structure' }) as Record<string, unknown>;
}

function buildCozeStructuredInventory(root: Record<string, unknown>): {
  inventory: DifyStructuredInventory;
  truncated: boolean;
} {
  const rawNodes = Array.isArray(root.nodes) ? root.nodes : [];
  const edges = Array.isArray(root.edges) ? root.edges : [];

  let truncated = false;
  const nodesSlice =
    rawNodes.length > MAX_NODES_IN_STRUCTURE
      ? ((truncated = true), rawNodes.slice(0, MAX_NODES_IN_STRUCTURE))
      : rawNodes;

  const nodes: DifyNodeInventoryItem[] = nodesSlice.map((node, i) => {
    if (!isRecord(node)) {
      return {
        id: `__invalid_node_${i}`,
        graphType: 'unknown',
        dataType: 'unknown',
        logicalPointer: `/nodes/${i}`,
        details: { kind: 'invalid', index: i },
      };
    }
    const graphIndex = rawNodes.indexOf(node);
    const idx = graphIndex >= 0 ? graphIndex : i;
    const id =
      typeof node.id === 'string'
        ? node.id
        : node.id != null
          ? String(node.id)
          : `__missing_id_${i}`;
    const cozeType = typeof node.type === 'string' ? node.type : 'unknown';
    const title =
      typeof node.title === 'string'
        ? node.title
        : typeof node.name === 'string'
          ? node.name
          : undefined;
    const desc = typeof node.description === 'string' ? node.description : undefined;
    const logicalPointer = `/nodes/${idx}`;
    const details = buildCozeNodeDetails(node, cozeType);

    return {
      id,
      graphType: cozeType,
      dataType: cozeType,
      title,
      desc,
      logicalPointer,
      details,
    };
  });

  const nodesByGroup: Record<string, DifyNodeInventoryItem[]> = {};
  for (const n of nodes) {
    const key = n.dataType !== 'unknown' ? n.dataType : 'unknown';
    if (!nodesByGroup[key]) {
      nodesByGroup[key] = [];
    }
    nodesByGroup[key].push(n);
  }

  const app =
    typeof root.name === 'string' || typeof root.mode === 'string'
      ? {
          name: typeof root.name === 'string' ? root.name : undefined,
          mode: typeof root.mode === 'string' ? root.mode : undefined,
        }
      : null;

  const inventory: DifyStructuredInventory = {
    structureSchemaVersion: COZE_STRUCTURE_SCHEMA_VERSION,
    app,
    version: root.schema_version != null ? String(root.schema_version) : undefined,
    kind: typeof root.mode === 'string' ? root.mode : undefined,
    conversationVariables: null,
    environmentVariables: null,
    dependencies: root.dependencies ?? null,
    nodes,
    nodesByGroup,
    edgeCount: edges.length,
  };

  return { inventory, truncated };
}

function buildCozeStructureSearchBlob(inventory: DifyStructuredInventory): {
  text: string;
  truncated: boolean;
} {
  const slim = {
    platform: 'coze' as const,
    structureSchemaVersion: inventory.structureSchemaVersion,
    app: inventory.app,
    nodes: inventory.nodes.map((n) => ({
      id: n.id,
      dataType: n.dataType,
      graphType: n.graphType,
      title: n.title,
      logicalPointer: n.logicalPointer,
      details: n.details,
    })),
  };
  try {
    const json = JSON.stringify(slim);
    if (json.length <= MAX_STRUCTURE_SEARCH_BLOB) {
      return { text: json, truncated: false };
    }
    return {
      text: `${json.slice(0, MAX_STRUCTURE_SEARCH_BLOB)}\n...[truncated]`,
      truncated: true,
    };
  } catch {
    return { text: '{}', truncated: true };
  }
}

function cozeEdgeEndpoints(e: unknown): { source: string; target: string } | null {
  if (!isRecord(e)) {
    return null;
  }
  const pick = (v: unknown): string | undefined => {
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      return String(v);
    }
    return undefined;
  };
  const source = pick(e.source ?? e.source_node_id ?? e.sourceNodeId ?? e.from ?? e.src ?? e.start);
  const target = pick(e.target ?? e.target_node_id ?? e.targetNodeId ?? e.to ?? e.dst ?? e.end);
  if (!source || !target) {
    return null;
  }
  return { source, target };
}

function buildCozeNormalizedWorkflow(
  root: Record<string, unknown>,
  inventory: DifyStructuredInventory,
  truncated: boolean,
): { normalized: NormalizedWorkflow; parseErrors: ParseError[] } {
  const parseErrors: ParseError[] = [];
  const rawAll = Array.isArray(root.nodes) ? root.nodes : [];
  const idSet = new Set(inventory.nodes.map((n) => n.id));

  const normNodes: NormalizedNode[] = inventory.nodes.map((inv) => ({
    node_id: inv.id,
    title: inv.title?.trim() ? inv.title : inv.id,
    node_type: inv.dataType,
    graph_type: inv.graphType,
    position: { x: 0, y: 0 },
    selected: false,
    payload: {},
    refs_in: [],
    refs_out: [],
    produces: [],
    consumes: [],
    upstream: [],
    downstream: [],
    branches: [],
  }));

  const byId = new Map(normNodes.map((n) => [n.node_id, n]));
  const normEdges: NormalizedEdge[] = [];
  const rawEdges = Array.isArray(root.edges) ? root.edges : [];
  let ei = 0;
  for (const e of rawEdges) {
    const ep = cozeEdgeEndpoints(e);
    if (ep && idSet.has(ep.source) && idSet.has(ep.target)) {
      normEdges.push({
        edge_id: `coze_e_${ei++}`,
        source: ep.source,
        target: ep.target,
        source_handle: 'out',
        target_handle: 'in',
        is_in_loop: false,
        is_in_iteration: false,
        edge_kind: 'normal',
      });
    }
  }

  let usedFallbackChain = false;
  if (normEdges.length === 0 && normNodes.length > 1) {
    usedFallbackChain = true;
    for (let i = 0; i < normNodes.length - 1; i++) {
      normEdges.push({
        edge_id: `coze_chain_${i}`,
        source: normNodes[i].node_id,
        target: normNodes[i + 1].node_id,
        source_handle: 'out',
        target_handle: 'in',
        is_in_loop: false,
        is_in_iteration: false,
        edge_kind: 'normal',
      });
    }
  }

  if (usedFallbackChain && rawEdges.length > 0) {
    parseErrors.push({
      level: 'warning',
      message:
        'Coze export contained edges that could not be mapped to node ids; graph shows sequential order as a fallback.',
    });
  } else if (usedFallbackChain) {
    parseErrors.push({
      level: 'warning',
      message:
        'Coze export has no edges array; graph shows nodes in YAML order as a sequential chain (topology is approximate).',
    });
  }

  for (const edge of normEdges) {
    const s = byId.get(edge.source);
    const t = byId.get(edge.target);
    if (s && t) {
      if (!s.downstream.includes(edge.target)) {
        s.downstream.push(edge.target);
      }
      if (!t.upstream.includes(edge.source)) {
        t.upstream.push(edge.source);
      }
    }
  }

  const normalized: NormalizedWorkflow = {
    normalizedSchemaVersion: DIFY_NORMALIZED_SCHEMA_VERSION,
    app:
      typeof root.name === 'string' || typeof root.mode === 'string'
        ? {
            ...(typeof root.name === 'string' ? { name: root.name } : {}),
            ...(typeof root.mode === 'string' ? { mode: root.mode } : {}),
          }
        : {},
    dependencies: [],
    features: { platform: 'coze' },
    nodes: normNodes,
    edges: normEdges,
    meta: {
      truncated,
      node_count_total: rawAll.length,
      edge_count_total: rawEdges.length,
    },
    parse_errors: [],
  };

  return { normalized, parseErrors };
}

function buildParseSummary(
  root: Record<string, unknown>,
  nodeCountInInventory: number,
): ParseSummary {
  const rawNodes = Array.isArray(root.nodes) ? root.nodes : [];
  const edges = Array.isArray(root.edges) ? root.edges : [];
  const dist: Record<string, number> = {};
  for (const n of rawNodes) {
    if (!isRecord(n)) {
      continue;
    }
    const t = typeof n.type === 'string' ? n.type : 'unknown';
    dist[t] = (dist[t] ?? 0) + 1;
  }
  return {
    node_count: nodeCountInInventory,
    edge_count: edges.length,
    node_type_distribution: dist,
    branch_count: 0,
    fail_branch_count: 0,
    ref_count: 0,
    unknown_node_type_count: 0,
  };
}

export function parseCozeYamlToStructure(yamlText: string): {
  inventory: DifyStructuredInventory;
  truncated: boolean;
  normalized: NormalizedWorkflow;
  parseSummary: ParseSummary;
  parseErrors: ParseError[];
} {
  const parsed = parseCozeExportYaml(yamlText);
  assertCozeWorkflowExport(parsed);
  const { inventory, truncated } = buildCozeStructuredInventory(parsed);
  const sanitized = sanitizeObject(inventory, {
    context: 'coze-config-structure',
  }) as DifyStructuredInventory;

  const blob = buildCozeStructureSearchBlob(sanitized);
  sanitized.structureSearchBlob = blob.text;
  sanitized.structureSearchBlobTruncated = blob.truncated;

  const { normalized: normalizedRaw, parseErrors: graphWarnings } = buildCozeNormalizedWorkflow(
    parsed,
    sanitized,
    truncated,
  );
  const normalized = sanitizeObject(normalizedRaw, {
    context: 'coze-config-structure',
  }) as NormalizedWorkflow;

  const parseSummary = buildParseSummary(parsed, sanitized.nodes.length);
  const parseErrors: ParseError[] = [...graphWarnings];

  return {
    inventory: sanitized,
    truncated,
    normalized,
    parseSummary,
    parseErrors,
  };
}

/**
 * Try to parse Coze workflow YAML for rule-hit → node display (same inventory shape as Dify API for shared utilities).
 */
export function tryParseCozeStructureForRules(
  yamlText: string,
): ReturnType<typeof parseCozeYamlToStructure> | null {
  const yaml = String(yamlText || '').trim();
  if (!yaml) {
    return null;
  }
  try {
    return parseCozeYamlToStructure(yaml);
  } catch {
    return null;
  }
}
