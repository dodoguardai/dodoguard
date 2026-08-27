/**
 * FastGPT workflow JSON (or YAML-wrapped JSON) → structured inventory aligned with
 * `DifyStructuredInventory` for rule evaluation, Beta explorer, and structure API.
 */

import yaml from 'js-yaml';
import { sanitizeObject } from '../util/sanitizer';
import { assertFastGptWorkflowExport, parseFastGptExportJson } from './fastgptConfigAuditService';
import type { DifyNodeInventoryItem, DifyStructuredInventory } from './difyConfigStructure';
import {
  DIFY_NORMALIZED_SCHEMA_VERSION,
  type NormalizedEdge,
  type NormalizedNode,
  type NormalizedWorkflow,
  type ParseError,
  type ParseSummary,
} from './difyDsl/normalizeTypes';

export const FASTGPT_STRUCTURE_SCHEMA_VERSION = 1;

const MAX_NODES_IN_STRUCTURE = 100;
const MAX_STRUCTURE_SEARCH_BLOB = 200_000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse task `configAudit.json` payload: raw JSON export or YAML document containing the same object.
 */
export function parseFastGptConfigExportText(text: string): Record<string, unknown> {
  const raw = String(text || '').trim();
  if (!raw) {
    throw new Error('Empty FastGPT export text');
  }
  let root: unknown;
  try {
    root = parseFastGptExportJson(raw);
  } catch {
    try {
      root = yaml.load(raw);
    } catch (e) {
      throw new Error(
        `Could not parse as JSON or YAML: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  if (!isRecord(root)) {
    throw new Error('FastGPT export root must be an object');
  }
  assertFastGptWorkflowExport(root);
  return root;
}

function buildFastGptNodeDetails(
  node: Record<string, unknown>,
  flowType: string,
): Record<string, unknown> {
  const slim: Record<string, unknown> = {
    kind: flowType,
    name: node.name,
    version: node.version,
    inputs: node.inputs,
    outputs: node.outputs,
  };
  return sanitizeObject(slim, { context: 'fastgpt-config-structure' }) as Record<string, unknown>;
}

function buildFastGptStructuredInventory(root: Record<string, unknown>): {
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
    const idRaw = node.nodeId ?? node.id;
    const id =
      typeof idRaw === 'string' ? idRaw : idRaw != null ? String(idRaw) : `__missing_id_${i}`;
    const flowType = typeof node.flowNodeType === 'string' ? node.flowNodeType : 'unknown';
    const title =
      typeof node.name === 'string'
        ? node.name
        : typeof node.intro === 'string'
          ? node.intro
          : undefined;
    const logicalPointer = `/nodes/${idx}`;
    const details = buildFastGptNodeDetails(node, flowType);

    return {
      id,
      graphType: flowType,
      dataType: flowType,
      title,
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
    typeof root.name === 'string' || typeof root.type === 'string'
      ? {
          name: typeof root.name === 'string' ? root.name : undefined,
          mode: typeof root.type === 'string' ? root.type : undefined,
        }
      : null;

  const inventory: DifyStructuredInventory = {
    structureSchemaVersion: FASTGPT_STRUCTURE_SCHEMA_VERSION,
    app,
    version: root.version != null ? String(root.version) : undefined,
    kind: 'fastgpt-workflow',
    conversationVariables: null,
    environmentVariables: null,
    dependencies: null,
    nodes,
    nodesByGroup,
    edgeCount: edges.length,
  };

  return { inventory, truncated };
}

function buildFastGptStructureSearchBlob(inventory: DifyStructuredInventory): {
  text: string;
  truncated: boolean;
} {
  const slim = {
    platform: 'fastgpt' as const,
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

function fastgptEdgeEndpoints(e: unknown): { source: string; target: string } | null {
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
  const source = pick(e.source ?? e.sourceNodeId ?? e.sourceHandle ?? e.from ?? e.src ?? e.start);
  const target = pick(e.target ?? e.targetNodeId ?? e.targetHandle ?? e.to ?? e.dst ?? e.end);
  if (!source || !target) {
    return null;
  }
  return { source, target };
}

function buildFastGptNormalizedWorkflow(
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
    const ep = fastgptEdgeEndpoints(e);
    if (ep && idSet.has(ep.source) && idSet.has(ep.target)) {
      normEdges.push({
        edge_id: `fastgpt_e_${ei++}`,
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
        edge_id: `fastgpt_chain_${i}`,
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
        'FastGPT export contained edges that could not be mapped to node ids; graph shows sequential order as a fallback.',
    });
  } else if (usedFallbackChain) {
    parseErrors.push({
      level: 'warning',
      message:
        'FastGPT export has no usable edges; graph shows nodes in export order as a sequential chain (topology is approximate).',
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
      typeof root.name === 'string'
        ? { name: root.name }
        : typeof root.type === 'string'
          ? { mode: root.type }
          : {},
    dependencies: [],
    features: { platform: 'fastgpt' },
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
    const t = typeof n.flowNodeType === 'string' ? n.flowNodeType : 'unknown';
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

export function parseFastGptTextToStructure(text: string): {
  inventory: DifyStructuredInventory;
  truncated: boolean;
  normalized: NormalizedWorkflow;
  parseSummary: ParseSummary;
  parseErrors: ParseError[];
} {
  const parsed = parseFastGptConfigExportText(text);
  const { inventory, truncated } = buildFastGptStructuredInventory(parsed);
  const sanitized = sanitizeObject(inventory, {
    context: 'fastgpt-config-structure',
  }) as DifyStructuredInventory;

  const blob = buildFastGptStructureSearchBlob(sanitized);
  sanitized.structureSearchBlob = blob.text;
  sanitized.structureSearchBlobTruncated = blob.truncated;

  const { normalized: normalizedRaw, parseErrors: graphWarnings } = buildFastGptNormalizedWorkflow(
    parsed,
    sanitized,
    truncated,
  );
  const normalized = sanitizeObject(normalizedRaw, {
    context: 'fastgpt-config-structure',
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
 * Try to parse FastGPT export text for rule evaluation; returns null on failure.
 */
export function tryParseFastGptStructureForRules(
  text: string,
): ReturnType<typeof parseFastGptTextToStructure> | null {
  const t = String(text || '').trim();
  if (!t) {
    return null;
  }
  try {
    return parseFastGptTextToStructure(t);
  } catch {
    return null;
  }
}
