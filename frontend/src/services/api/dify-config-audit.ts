/**
 * Dify Config gray-box scanning API — static YAML security review.
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

export type DifyConfigAuditFinding = {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  location: string;
  issue: string;
  evidence: string;
  recommendation: string;
  dimension?: string;
  sourceFile?: string;
  /** 产出该发现的扫描引擎（多引擎去重合并后可能多个） */
  sourceEngines?: string[];
  riskType?: string;
  suggestedAction?: string;
};

export type DifyConfigAuditData = {
  summary: string;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  findings: DifyConfigAuditFinding[];
  recommendations: string[];
  warnings?: string[];
  truncated: boolean;
  scannedFiles?: { path: string }[];
};

export type AnalyzeDifyConfigRequest = {
  yaml: string;
  fileName?: string;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

/** LLM can run twice (main + repair); large YAML + slow providers exceed default 30s axios timeout. */
const ANALYZE_TIMEOUT_MS = 300_000;

export type AnalyzeDifyConfigResponse = DifyConfigAuditData & { reportId?: string };

export type DifyNodeInventoryItem = {
  id: string;
  graphType: string;
  dataType: string;
  title?: string;
  desc?: string;
  /** RFC6901-style path to node `data` in export (e.g. `/workflow/graph/nodes/0/data`). */
  logicalPointer?: string;
  /** Sanitized per-node extraction (knowledge-retrieval, http-request, etc.). */
  details?: Record<string, unknown>;
};

export type DifyStructuredInventory = {
  structureSchemaVersion: number;
  app: { name?: string; mode?: string } | null;
  version?: string;
  kind?: string;
  conversationVariables: unknown;
  environmentVariables: unknown;
  dependencies: unknown;
  nodes: DifyNodeInventoryItem[];
  nodesByGroup: Record<string, DifyNodeInventoryItem[]>;
  edgeCount: number;
  /** Deterministic JSON for keyword rules (server-generated). */
  structureSearchBlob?: string;
  structureSearchBlobTruncated?: boolean;
};

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

export type RefToken = {
  raw: string;
  root: string;
  path: string[];
  kind: string;
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
  branches: Array<{ handle: string; target: string; edge_kind: NormalizedEdgeKind }>;
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
  parse_errors: Array<{
    level: string;
    node_id?: string;
    field?: string;
    message: string;
  }>;
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

export type DifyStructureResponseData = {
  inventory: DifyStructuredInventory;
  truncated: boolean;
  normalized?: NormalizedWorkflow;
  parseSummary?: ParseSummary;
  parseErrors?: NormalizedWorkflow['parse_errors'];
};

export type StructureDifyConfigRequest = {
  yaml: string;
};

const STRUCTURE_TIMEOUT_MS = 60_000;

export const difyConfigAuditApi = {
  analyze: async (body: AnalyzeDifyConfigRequest): Promise<AnalyzeDifyConfigResponse> => {
    const response = await apiClient.post<ApiResponse<AnalyzeDifyConfigResponse>>(
      '/dify-config-audit/analyze',
      body,
      { timeout: ANALYZE_TIMEOUT_MS },
    );
    return handleApiResponse(response.data);
  },

  structure: async (body: StructureDifyConfigRequest): Promise<DifyStructureResponseData> => {
    const response = await apiClient.post<ApiResponse<DifyStructureResponseData>>(
      '/dify-config-audit/structure',
      body,
      { timeout: STRUCTURE_TIMEOUT_MS },
    );
    return handleApiResponse(response.data);
  },
};
