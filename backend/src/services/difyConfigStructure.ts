/**
 * Dify application YAML → structured inventory for UI (Beta explorer) and rule evaluation.
 * No LLM; reuses parse/validate from difyConfigAuditService.
 */

import { sanitizeObject } from '../util/sanitizer';
import { assertDifyAppExport, parseDifyExportYaml } from './difyConfigAuditService';
import { extractNodeDetails } from './difyConfigNodeExtractors';
import { normalizeDifyWorkflow } from './difyDsl/normalizeDifyWorkflow';

import type { NormalizedWorkflow, ParseError, ParseSummary } from './difyDsl/normalizeTypes';

/** Aligned with MAX_NODES_IN_SUBSET in difyConfigAuditService. */
const MAX_NODES_IN_STRUCTURE = 100;

/** Max size for structureSearchBlob (UTF-16 units, approx bytes for ASCII). */
const MAX_STRUCTURE_SEARCH_BLOB = 200_000;

export const DIFY_STRUCTURE_SCHEMA_VERSION = 2;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export type DifyNodeInventoryItem = {
  id: string;
  graphType: string;
  dataType: string;
  title?: string;
  desc?: string;
  /** RFC6901-style pointer to node `data` in the export (index is position in workflow.graph.nodes). */
  logicalPointer?: string;
  /** Type-specific extracted fields (sanitized). */
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
  /** Keys are dataType, or graphType, or "unknown". */
  nodesByGroup: Record<string, DifyNodeInventoryItem[]>;
  edgeCount: number;
  /** Compact JSON for keyword/regex rules (matchTarget config_structure); sanitized. */
  structureSearchBlob?: string;
  structureSearchBlobTruncated?: boolean;
};

function slimNormalizedForBlob(
  n: NormalizedWorkflow | undefined,
): Record<string, unknown> | undefined {
  if (!n) {
    return undefined;
  }
  return {
    normalizedSchemaVersion: n.normalizedSchemaVersion,
    meta: n.meta,
    edge_kinds: n.edges.reduce(
      (acc, e) => {
        acc[e.edge_kind] = (acc[e.edge_kind] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    node_types: n.nodes.map((x) => x.node_type),
    ref_samples: n.nodes.flatMap((x) => x.refs_in.map((r) => r.raw)).slice(0, 80),
    dataset_hints: n.nodes
      .filter((x) => x.payload?.kind === 'knowledge-retrieval')
      .map((x) => ({
        id: x.node_id,
        dataset_ids: x.payload.dataset_ids,
        dataset_names: x.payload.dataset_names,
      })),
  };
}

function buildStructureSearchBlob(
  inventory: DifyStructuredInventory,
  normalized?: NormalizedWorkflow,
): {
  text: string;
  truncated: boolean;
} {
  const slim = {
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
    normalizedDigest: slimNormalizedForBlob(normalized),
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

export function buildDifyStructuredInventory(root: Record<string, unknown>): {
  inventory: DifyStructuredInventory;
  truncated: boolean;
} {
  const workflow = root.workflow as Record<string, unknown>;
  const graph = isRecord(workflow.graph) ? workflow.graph : {};
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

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
        logicalPointer: `/workflow/graph/nodes/${i}/data`,
        details: { kind: 'generic', rawDataKeys: [] as string[] },
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
    const graphType = typeof node.type === 'string' ? node.type : 'unknown';
    const data = isRecord(node.data) ? node.data : null;
    const dataType =
      data && typeof data.type === 'string'
        ? data.type
        : graphType !== 'unknown'
          ? graphType
          : 'unknown';
    const title = data && typeof data.title === 'string' ? data.title : undefined;
    const desc = data && typeof data.desc === 'string' ? data.desc : undefined;
    const logicalPointer = `/workflow/graph/nodes/${idx}/data`;
    const details = extractNodeDetails(data, dataType) as Record<string, unknown>;

    return {
      id,
      graphType,
      dataType,
      title,
      desc,
      logicalPointer,
      details,
    };
  });

  const nodesByGroup: Record<string, DifyNodeInventoryItem[]> = {};
  for (const n of nodes) {
    const key =
      n.dataType !== 'unknown' ? n.dataType : n.graphType !== 'unknown' ? n.graphType : 'unknown';
    if (!nodesByGroup[key]) {
      nodesByGroup[key] = [];
    }
    nodesByGroup[key].push(n);
  }

  const appRaw = root.app;
  const app = isRecord(appRaw)
    ? {
        name: typeof appRaw.name === 'string' ? appRaw.name : undefined,
        mode: typeof appRaw.mode === 'string' ? appRaw.mode : undefined,
      }
    : null;

  const inventory: DifyStructuredInventory = {
    structureSchemaVersion: DIFY_STRUCTURE_SCHEMA_VERSION,
    app,
    version: typeof root.version === 'string' ? root.version : undefined,
    kind: typeof root.kind === 'string' ? root.kind : undefined,
    conversationVariables: workflow.conversation_variables,
    environmentVariables: workflow.environment_variables,
    dependencies: root.dependencies,
    nodes,
    nodesByGroup,
    edgeCount: edges.length,
  };

  return { inventory, truncated };
}

/**
 * Parse Dify app export YAML and return sanitized structured inventory for the Beta UI and rules.
 */
export function parseDifyYamlToStructure(yamlText: string): {
  inventory: DifyStructuredInventory;
  truncated: boolean;
  normalized: NormalizedWorkflow;
  parseSummary: ParseSummary;
  parseErrors: ParseError[];
} {
  const parsed = parseDifyExportYaml(yamlText);
  assertDifyAppExport(parsed);
  const { workflow: normalizedRaw, parseSummary } = normalizeDifyWorkflow(parsed, {
    maxNodes: MAX_NODES_IN_STRUCTURE,
  });
  const { inventory, truncated } = buildDifyStructuredInventory(parsed);
  const sanitizedNorm = sanitizeObject(normalizedRaw, {
    context: 'dify-config-audit',
  }) as NormalizedWorkflow;
  const sanitized = sanitizeObject(inventory, {
    context: 'dify-config-audit',
  }) as DifyStructuredInventory;

  const blob = buildStructureSearchBlob(sanitized, sanitizedNorm);
  sanitized.structureSearchBlob = blob.text;
  sanitized.structureSearchBlobTruncated = blob.truncated;

  return {
    inventory: sanitized,
    truncated,
    normalized: sanitizedNorm,
    parseSummary,
    parseErrors: sanitizedNorm.parse_errors,
  };
}

/**
 * Try to parse Dify YAML and build structure + search blob; returns null on failure (caller continues with YAML-only rules).
 */
export function tryParseDifyStructureForRules(
  yamlText: string,
): ReturnType<typeof parseDifyYamlToStructure> | null {
  const yaml = String(yamlText || '').trim();
  if (!yaml) {
    return null;
  }
  try {
    return parseDifyYamlToStructure(yaml);
  } catch {
    return null;
  }
}

/** Minimal fields from a stored rule hit (detection_results.ruleHits). */
export type RuleHitLikeForDslNode = {
  logicalPath?: string;
  matchStart?: number;
  startLine?: number;
  /** Matched substring (keyword / regex hit); used when offsets/lines refer to structure JSON, not YAML. */
  evidence?: string;
  /** Fallback needle when `evidence` is missing (e.g. name contains `siliconflow`). */
  ruleName?: string;
};

function parseNodeIndexFromWorkflowLogicalPath(lp: string): number | null {
  const m = lp.match(/\/workflow\/graph\/nodes\/(\d+)/i);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** JSON Pointer into structureSearchBlob / inventory JSON, e.g. `/nodes/2/title`. */
function parseStructureInventoryNodeIndex(lp: string): number | null {
  const t = lp.trim();
  if (!t || t === '/') {
    return null;
  }
  const m = t.match(/^\/?nodes\/(\d+)/i);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Parse node id from engine-inferred zh suffix: `…/nodes/3（节点 id: llm-abc）`. */
function parseInferredNodeIdFromLogicalPath(lp: string): string | null {
  const m = lp.match(/（节点 id:\s*([^）]+)\s*）/);
  if (!m) {
    return null;
  }
  const id = m[1].trim();
  return id.length > 0 ? id : null;
}

function escapeRegexId(id: string): string {
  return id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MIN_EVIDENCE_LEN_FOR_NODE_MATCH = 3;

function normalizeEvidenceNeedle(raw: string): string {
  return raw.replace(/…+$/u, '').trim();
}

/** First occurrence of evidence in YAML (exact, then case-insensitive). */
function findEvidenceOffsetInYaml(fullText: string, evidence: string): number {
  const n = normalizeEvidenceNeedle(evidence);
  if (n.length < MIN_EVIDENCE_LEN_FOR_NODE_MATCH) {
    return -1;
  }
  let i = fullText.indexOf(n);
  if (i >= 0) {
    return i;
  }
  const lower = fullText.toLowerCase();
  const nl = n.toLowerCase();
  i = lower.indexOf(nl);
  return i;
}

/** When hit text is not in YAML, match needle against explorer inventory (id/title/details). */
function findInventoryNodeByEvidenceInInventory(
  nodes: DifyNodeInventoryItem[],
  evidence: string,
): DifyNodeInventoryItem | null {
  const n = normalizeEvidenceNeedle(evidence).toLowerCase();
  if (n.length < MIN_EVIDENCE_LEN_FOR_NODE_MATCH) {
    return null;
  }
  for (const node of nodes) {
    const id = String(node.id || '').toLowerCase();
    const title = String(node.title || '').toLowerCase();
    const typ = `${node.dataType} ${node.graphType}`.toLowerCase();
    let details = '';
    try {
      details = JSON.stringify(node.details ?? {}).toLowerCase();
    } catch {
      details = '';
    }
    const hay = `${id}\n${title}\n${typ}\n${details}`;
    if (hay.includes(n)) {
      return node;
    }
  }
  return null;
}

/** Tokens like `siliconflow` from rule display names when evidence was not persisted. */
function needlesFromRuleName(ruleName: string): string[] {
  const raw = ruleName.trim();
  if (!raw) {
    return [];
  }
  const tokens = raw.match(/[a-zA-Z][a-zA-Z0-9_.-]{3,}/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const k = t.toLowerCase();
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(t);
  }
  return out;
}

function tryResolveByNeedles(
  yamlText: string,
  nodes: DifyNodeInventoryItem[],
  needles: string[],
): DifyNodeInventoryItem | null {
  for (const needle of needles) {
    if (yamlText) {
      const off = findEvidenceOffsetInYaml(yamlText, needle);
      if (off >= 0) {
        const node = pickInventoryNodeByYamlOffset(yamlText, nodes, off);
        if (node) {
          return node;
        }
      }
    }
    const inv = findInventoryNodeByEvidenceInInventory(nodes, needle);
    if (inv) {
      return inv;
    }
  }
  return null;
}

/**
 * Map 1-based line in Dify export YAML to the workflow list item that owns it
 * (last `- id:` at or above that line).
 */
export function findInventoryNodeByYamlLine(
  fullText: string,
  nodes: DifyNodeInventoryItem[],
  line1Based: number,
): DifyNodeInventoryItem | null {
  if (line1Based < 1 || !fullText.trim() || !nodes.length) {
    return null;
  }
  type Start = { line: number; id: string };
  const starts: Start[] = [];
  for (const n of nodes) {
    const id = String(n.id || '').trim();
    if (!id) {
      continue;
    }
    const eid = escapeRegexId(id);
    const re = new RegExp(`^\\s*-\\s*id:\\s*${eid}\\b`, 'm');
    const m = re.exec(fullText);
    if (m) {
      const line = fullText.slice(0, m.index).split('\n').length;
      starts.push({ line, id });
    }
  }
  if (starts.length === 0) {
    return null;
  }
  starts.sort((a, b) => a.line - b.line);
  if (line1Based < starts[0].line) {
    return null;
  }
  let pickId = starts[0].id;
  for (const s of starts) {
    if (s.line <= line1Based) {
      pickId = s.id;
    } else {
      break;
    }
  }
  return nodes.find((x) => x.id === pickId) ?? null;
}

/**
 * Pick which graph list entry an absolute offset in the same YAML string belongs to
 * (same idea as inferDifyExportNodeLocationFromYaml in rule evaluation).
 */
export function pickInventoryNodeByYamlOffset(
  fullText: string,
  nodes: DifyNodeInventoryItem[],
  matchStart: number,
): DifyNodeInventoryItem | null {
  if (matchStart < 0 || !fullText || !nodes.length) {
    return null;
  }
  type Scored = { start: number; id: string };
  const scored: Scored[] = [];
  for (const n of nodes) {
    const id = String(n.id || '').trim();
    if (!id) {
      continue;
    }
    const eid = escapeRegexId(id);
    const re = new RegExp(`(?:^|\\n)(\\s*)-\\s*id:\\s*${eid}\\b`, 'g');
    let best = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fullText)) !== null) {
      const pos = m.index + (m[0].startsWith('\n') ? 1 : 0);
      if (pos <= matchStart && pos > best) {
        best = pos;
      }
    }
    if (best >= 0) {
      scored.push({ start: best, id });
    }
  }
  if (scored.length === 0) {
    const line = fullText.slice(0, Math.min(matchStart, fullText.length)).split('\n').length;
    return findInventoryNodeByYamlLine(fullText, nodes, line);
  }
  scored.sort((a, b) => b.start - a.start);
  const pick = scored[0];
  return nodes.find((x) => x.id === pick.id) ?? null;
}

function briefStr(v: unknown, maxLen: number): string | null {
  if (typeof v === 'string' && v.trim()) {
    const t = v.replace(/\s+/g, ' ').trim();
    return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return String(v);
  }
  if (typeof v === 'boolean') {
    return v ? 'true' : 'false';
  }
  return null;
}

/**
 * Short Chinese summary from `extractNodeDetails` (provider/model/tool/url/KB…) for reports & UI.
 */
export function formatDifyInventoryNodeDetailsBrief(
  details: Record<string, unknown> | undefined,
): string {
  if (!details || typeof details !== 'object') {
    return '';
  }
  const parts: string[] = [];
  const prov = briefStr(details.provider, 48);
  if (prov) {
    parts.push(`厂商：${prov}`);
  }
  const model = briefStr(details.model, 56);
  if (model) {
    parts.push(`模型：${model}`);
  }
  const mode = briefStr(details.mode, 32);
  if (mode) {
    parts.push(`模式：${mode}`);
  }
  const tool = briefStr(details.tool_name, 48);
  if (tool) {
    parts.push(`工具：${tool}`);
  }
  const pid = briefStr(details.provider_id, 40);
  if (pid && !prov) {
    parts.push(`provider_id：${pid}`);
  }
  const url = briefStr(details.url, 72);
  if (url) {
    const method = briefStr(details.method, 12);
    parts.push(method ? `HTTP ${method} ${url}` : `URL：${url}`);
  }
  const ds = details.dataset_names;
  if (Array.isArray(ds) && ds.length > 0) {
    const names = ds
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .slice(0, 4)
      .map((x) => briefStr(x, 40) ?? '');
    const joined = names.filter(Boolean).join('、');
    if (joined) {
      parts.push(`知识库：${joined}`);
    }
  }
  return parts.join(' · ');
}

/** Explorer-style line: title（type）· id，并附带 details 摘要（厂商/模型等）。 */
export function formatDifyInventoryNodeLabel(n: DifyNodeInventoryItem): string {
  const title = n.title?.trim();
  const typ = n.dataType !== 'unknown' ? n.dataType : n.graphType;
  const head = title ? `${title}（${typ}） · ${n.id}` : `${typ} · ${n.id}`;
  const brief = formatDifyInventoryNodeDetailsBrief(n.details);
  return brief ? `${head}；${brief}` : head;
}

export function resolveInventoryNodeForRuleHit(
  yamlText: string,
  nodes: DifyNodeInventoryItem[],
  hit: RuleHitLikeForDslNode,
): DifyNodeInventoryItem | null {
  const lp = hit.logicalPath?.trim();
  if (lp) {
    const structIdx = parseStructureInventoryNodeIndex(lp);
    if (structIdx != null && structIdx < nodes.length) {
      return nodes[structIdx];
    }
    const idx = parseNodeIndexFromWorkflowLogicalPath(lp);
    if (idx != null && idx < nodes.length) {
      const byIdx = nodes[idx];
      const inferredId = parseInferredNodeIdFromLogicalPath(lp);
      if (inferredId && byIdx.id !== inferredId) {
        const byId = nodes.find((x) => x.id === inferredId);
        if (byId) {
          return byId;
        }
      }
      return byIdx;
    }
    const inferredOnly = parseInferredNodeIdFromLogicalPath(lp);
    if (inferredOnly) {
      const byId = nodes.find((x) => x.id === inferredOnly);
      if (byId) {
        return byId;
      }
    }
  }
  const ms = typeof hit.matchStart === 'number' ? hit.matchStart : -1;
  if (ms >= 0 && yamlText) {
    const byOff = pickInventoryNodeByYamlOffset(yamlText, nodes, ms);
    if (byOff) {
      return byOff;
    }
  }
  const sl = typeof hit.startLine === 'number' ? hit.startLine : 0;
  if (sl > 0 && yamlText) {
    const byLine = findInventoryNodeByYamlLine(yamlText, nodes, sl);
    if (byLine) {
      return byLine;
    }
  }
  const ev = typeof hit.evidence === 'string' ? hit.evidence : '';
  if (ev) {
    const byNeedle = tryResolveByNeedles(yamlText, nodes, [ev]);
    if (byNeedle) {
      return byNeedle;
    }
  }
  const ruleName = typeof hit.ruleName === 'string' ? hit.ruleName : '';
  const fromName = needlesFromRuleName(ruleName);
  if (fromName.length > 0) {
    const byName = tryResolveByNeedles(yamlText, nodes, fromName);
    if (byName) {
      return byName;
    }
  }
  return null;
}

export function formatRuleHitConfigNodeDisplay(
  yamlText: string,
  nodes: DifyNodeInventoryItem[],
  hit: Record<string, unknown>,
): string | null {
  const resolved = resolveInventoryNodeForRuleHit(yamlText, nodes, {
    logicalPath: hit.logicalPath != null ? String(hit.logicalPath) : undefined,
    matchStart: typeof hit.matchStart === 'number' ? hit.matchStart : undefined,
    startLine: typeof hit.startLine === 'number' ? hit.startLine : undefined,
    evidence: hit.evidence != null ? String(hit.evidence) : undefined,
    ruleName: hit.ruleName != null ? String(hit.ruleName) : undefined,
  });
  return resolved ? formatDifyInventoryNodeLabel(resolved) : null;
}
