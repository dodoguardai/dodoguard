/**
 * Map rule hits to Structured explorer–style node labels. Keep algorithm aligned with
 * backend `difyConfigStructure.ts` (formatRuleHitConfigNodeDisplay / resolveInventoryNodeForRuleHit).
 */

import type { DifyNodeInventoryItem } from '@/services/api/dify-config-audit';
import type { FindingDetectionRuleResult } from '@/types/entities';

function parseNodeIndexFromWorkflowLogicalPath(lp: string): number | null {
  const m = lp.match(/\/workflow\/graph\/nodes\/(\d+)/i);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

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
  return raw.replace(/\u2026+$/u, '').trim();
}

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

/** Keep aligned with backend `formatDifyInventoryNodeDetailsBrief`. */
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
  hit: Pick<
    FindingDetectionRuleResult,
    'logicalPath' | 'matchStart' | 'startLine' | 'evidence' | 'ruleName'
  >,
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

export function ruleHitConfigNodeDisplayLabel(
  yamlText: string,
  nodes: DifyNodeInventoryItem[] | undefined,
  hit: FindingDetectionRuleResult,
): string | null {
  if (!nodes?.length || !yamlText.trim()) {
    return null;
  }
  const node = resolveInventoryNodeForRuleHit(yamlText, nodes, hit);
  return node ? formatDifyInventoryNodeLabel(node) : null;
}
