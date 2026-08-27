/**
 * Normalized Dify workflow types — aligned with dify_dsl_parser_spec_v2 (nodes, edges, refs, relations).
 */

export const DIFY_NORMALIZED_SCHEMA_VERSION = 1;

export type NormalizedEdgeKind =
  | 'normal'
  | 'branch_true'
  | 'branch_false'
  | 'branch_custom'
  | 'fail_branch';

export type NormalizedEdge = {
  edge_id: string;
  source: string;
  target: string;
  source_handle: string;
  target_handle: string;
  source_type?: string;
  target_type?: string;
  is_in_loop: boolean;
  is_in_iteration: boolean;
  edge_kind: NormalizedEdgeKind;
};

/** Parsed variable reference (spec 10.2). */
export type RefToken = {
  raw: string;
  root: string;
  path: string[];
  kind: 'node_ref' | 'system_ref' | 'plain';
};

export type NormalizedBranch = {
  handle: string;
  target: string;
  edge_kind: NormalizedEdgeKind;
};

export type NormalizedNode = {
  node_id: string;
  title: string;
  node_type: string;
  graph_type?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  selected: boolean;
  payload: Record<string, unknown>;
  refs_in: RefToken[];
  refs_out: RefToken[];
  produces: string[];
  consumes: string[];
  upstream: string[];
  downstream: string[];
  branches: NormalizedBranch[];
};

export type ParseErrorLevel = 'warning' | 'error';

export type ParseError = {
  level: ParseErrorLevel;
  node_id?: string;
  field?: string;
  message: string;
};

export type ParseSummary = {
  node_count: number;
  edge_count: number;
  node_type_distribution: Record<string, number>;
  branch_count: number;
  fail_branch_count: number;
  ref_count: number;
  unknown_node_type_count: number;
};

export type NormalizedWorkflow = {
  normalizedSchemaVersion: number;
  app: Record<string, unknown>;
  dependencies: unknown[];
  features: Record<string, unknown>;
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  meta: {
    truncated: boolean;
    node_count_total: number;
    edge_count_total: number;
  };
  parse_errors: ParseError[];
};
