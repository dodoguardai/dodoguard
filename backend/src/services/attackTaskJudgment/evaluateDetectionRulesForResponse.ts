/**
 * Evaluate per-vulnerability detection_rules rows (regex / keyword) against agent output or YAML subtree.
 * Hit records include character offsets and 1-based line/column for UI / reports (JavaScript string indices = UTF-16 code units).
 */

import { and, eq } from 'drizzle-orm';
import { load as yamlLoad } from 'js-yaml';
import { getDbType } from '../../database';

type Db = any;

/** One rule match with location in the evaluated text (usually full export YAML). */
export type RuleHitEvidence = {
  ruleId: string;
  ruleName: string;
  type: string;
  evidence: string;
  /** Inclusive start index in full responseText (UTF-16). */
  matchStart: number;
  /** Exclusive end index in full responseText. */
  matchEnd: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  contextSnippet?: string;
  /** JSON Pointer (RFC 6901) when match was scoped to a YAML subtree. */
  logicalPath?: string;
  matchScope?: 'full_text' | 'json_pointer';
};

export type RuleEvaluationResult = {
  matched: boolean;
  hits: RuleHitEvidence[];
};

const CONTEXT_LINE_PAD = 2;
const MAX_CONTEXT_CHARS = 4000;

const YAML_POINTER_TARGETS = new Set(['config_yaml', 'exported_dsl', 'config_node', 'config', '']);

/** Rules that evaluate against structured inventory JSON (from parseDifyYamlToStructure). */
const STRUCTURE_POINTER_TARGETS = new Set(['config_structure', 'structure_json']);

export type EvaluateDetectionRulesOptions = {
  /** Sanitized JSON blob for matchTarget config_structure / structure_json. */
  structureText?: string;
};

function safeRequireDetectionRulesTable(): any | null {
  if (getDbType() !== 'mysql') {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mysqlTables = require('../../database/tables-mysql');
    return mysqlTables.detectionRulesTable;
  } catch {
    return null;
  }
}

/** 1-based line and column for the character at offset (0-based). */
export function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  const o = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < o; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: o - lineStart + 1 };
}

function extractContextSnippet(
  text: string,
  startLine: number,
  endLine: number,
  pad: number = CONTEXT_LINE_PAD,
): string {
  const lines = text.split('\n');
  const i0 = Math.max(0, startLine - 1 - pad);
  const i1 = Math.min(lines.length, endLine + pad);
  const body = lines.slice(i0, i1).join('\n');
  return body.length > MAX_CONTEXT_CHARS ? `${body.slice(0, MAX_CONTEXT_CHARS)}\n…` : body;
}

function indexOfInsensitive(haystack: string, needle: string): number {
  if (!needle) {
    return -1;
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'i');
  const m = re.exec(haystack);
  return m ? m.index : -1;
}

/**
 * Resolve JSON Pointer (RFC 6901) against a parsed object. Pointer "" or "/" means root.
 */
export function resolveJsonPointer(doc: unknown, pointer: string): unknown {
  const raw = String(pointer ?? '').trim();
  if (!raw || raw === '/') {
    return doc;
  }
  const path = raw.startsWith('/') ? raw.slice(1).split('/') : raw.split('/');
  let cur: any = doc;
  for (const enc of path) {
    if (cur == null) {
      return undefined;
    }
    const key = enc.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(cur)) {
      const idx = Number.parseInt(key, 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= cur.length) {
        return undefined;
      }
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

function valueToSearchString(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function tryParseYamlRoot(text: string): unknown | null {
  try {
    return yamlLoad(text);
  } catch {
    return null;
  }
}

function tryParseJsonRoot(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function escapeRegexId(id: string): string {
  return id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Map a match offset in Dify app export YAML to workflow.graph.nodes[i] + node id (best-effort).
 * Used when rules run in full_text mode so reports can show which graph node was hit.
 */
function looksLikeDifyAppExportYaml(s: string): boolean {
  return /\bworkflow\s*:/.test(s) && /\bgraph\s*:/.test(s) && /\bnodes\s*:/.test(s);
}

function inferDifyExportNodeLocationFromYaml(
  fullText: string,
  matchStart: number,
): string | undefined {
  if (matchStart < 0 || !fullText.trim() || !looksLikeDifyAppExportYaml(fullText)) {
    return undefined;
  }
  let root: unknown;
  try {
    root = yamlLoad(fullText) as unknown;
  } catch {
    return undefined;
  }
  const obj = root && typeof root === 'object' ? (root as Record<string, unknown>) : null;
  const wf =
    obj?.workflow && typeof obj.workflow === 'object'
      ? (obj.workflow as Record<string, unknown>)
      : null;
  const graph =
    wf?.graph && typeof wf.graph === 'object' ? (wf.graph as Record<string, unknown>) : null;
  const nodes = Array.isArray(graph?.nodes) ? (graph.nodes as unknown[]) : null;
  if (!nodes || nodes.length === 0) {
    return undefined;
  }

  type Scored = { start: number; idx: number; id: string };
  const scored: Scored[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n || typeof n !== 'object') {
      continue;
    }
    const id = String((n as Record<string, unknown>).id ?? '').trim();
    if (!id) {
      continue;
    }
    const eid = escapeRegexId(id);
    const reList = new RegExp(`(?:^|\\n)(\\s*)-\\s*id:\\s*${eid}\\b`, 'g');
    let best = -1;
    let m: RegExpExecArray | null;
    while ((m = reList.exec(fullText)) !== null) {
      const pos = m.index + (m[0].startsWith('\n') ? 1 : 0);
      if (pos <= matchStart && pos > best) {
        best = pos;
      }
    }
    if (best >= 0) {
      scored.push({ start: best, idx: i, id });
    }
  }

  if (scored.length > 0) {
    scored.sort((a, b) => b.start - a.start);
    const pick = scored[0];
    return `/workflow/graph/nodes/${pick.idx}（节点 id: ${pick.id}）`;
  }

  /** Offsets at file start (e.g. matchStart === 0) never satisfy `pos <= matchStart` for later `- id:` lines — use line ownership. */
  const line1Based = offsetToLineColumn(
    fullText,
    Math.min(Math.max(0, matchStart), fullText.length),
  ).line;
  type LineStart = { line: number; idx: number; id: string };
  const lineStarts: LineStart[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n || typeof n !== 'object') {
      continue;
    }
    const id = String((n as Record<string, unknown>).id ?? '').trim();
    if (!id) {
      continue;
    }
    const eid = escapeRegexId(id);
    const reOne = new RegExp(`^\\s*-\\s*id:\\s*${eid}\\b`, 'm');
    const mm = reOne.exec(fullText);
    if (mm) {
      const line = fullText.slice(0, mm.index).split('\n').length;
      lineStarts.push({ line, idx: i, id });
    }
  }
  if (lineStarts.length === 0) {
    return undefined;
  }
  lineStarts.sort((a, b) => a.line - b.line);
  if (line1Based < lineStarts[0].line) {
    return undefined;
  }
  let pickLine: LineStart = lineStarts[0];
  for (const ls of lineStarts) {
    if (ls.line <= line1Based) {
      pickLine = ls;
    } else {
      break;
    }
  }
  return `/workflow/graph/nodes/${pickLine.idx}（节点 id: ${pickLine.id}）`;
}

function buildHit(
  rule: { id: unknown; name: unknown },
  hitType: string,
  evidence: string,
  matchStart: number,
  matchEnd: number,
  fullText: string,
  logicalPath?: string,
  matchScope?: 'full_text' | 'json_pointer',
): RuleHitEvidence {
  const endIdx = Math.max(matchStart, matchEnd - 1);
  const start = offsetToLineColumn(fullText, matchStart);
  const end = offsetToLineColumn(fullText, endIdx);
  return {
    ruleId: String(rule.id),
    ruleName: String(rule.name || rule.id),
    type: hitType,
    evidence: evidence.slice(0, 500),
    matchStart,
    matchEnd,
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
    contextSnippet: extractContextSnippet(fullText, start.line, end.line),
    logicalPath,
    matchScope,
  };
}

function mapPointerToFullTextOffset(fullText: string, evidenceInSubtree: string): number {
  if (!evidenceInSubtree) {
    return -1;
  }
  const idx = fullText.indexOf(evidenceInSubtree);
  if (idx >= 0) {
    return idx;
  }
  const compact = evidenceInSubtree.replace(/\s+/g, ' ').trim();
  if (compact.length >= 8) {
    const lines = fullText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const normalized = lines[i].replace(/\s+/g, ' ').trim();
      if (normalized.includes(compact.slice(0, Math.min(80, compact.length)))) {
        return fullText.indexOf(lines[i]);
      }
    }
  }
  return -1;
}

export async function evaluateDetectionRulesForResponse(
  db: Db,
  vulnerabilityId: string | null | undefined,
  responseText: string,
  options?: EvaluateDetectionRulesOptions,
): Promise<RuleEvaluationResult> {
  const table = safeRequireDetectionRulesTable();
  const rt = String(responseText || '').trim();
  const st = String(options?.structureText || '').trim();
  if (!table || !vulnerabilityId || (!rt && !st)) {
    return { matched: false, hits: [] };
  }

  const rows = await db
    .select()
    .from(table)
    .where(and(eq(table.vulnerabilityId, vulnerabilityId), eq(table.enabled, true)));

  const hits: RuleHitEvidence[] = [];

  for (const rule of rows as any[]) {
    const type = String(rule.type || '').toLowerCase();
    const pattern = String(rule.pattern || '');
    const matchTarget = String(rule.matchTarget || '')
      .toLowerCase()
      .trim();
    const selector = String(rule.selector || '').trim();

    const useStructureHaystack = STRUCTURE_POINTER_TARGETS.has(matchTarget);

    const usePointer =
      selector &&
      (YAML_POINTER_TARGETS.has(matchTarget) ||
        STRUCTURE_POINTER_TARGETS.has(matchTarget) ||
        matchTarget === 'response_body');

    if (usePointer && matchTarget !== 'response_body') {
      let doc: unknown | null = null;
      let fullText: string;

      if (STRUCTURE_POINTER_TARGETS.has(matchTarget)) {
        if (!st) {
          continue;
        }
        fullText = st;
        doc = tryParseJsonRoot(st);
        if (doc == null) {
          continue;
        }
      } else {
        if (!rt) {
          continue;
        }
        fullText = rt;
        doc = tryParseYamlRoot(rt);
        if (doc == null) {
          continue;
        }
      }

      const ptr = selector.startsWith('/') || selector === '' ? selector : `/${selector}`;
      const subValue = resolveJsonPointer(doc, ptr === '/' ? '' : ptr);
      if (subValue === undefined) {
        continue;
      }
      const subText = valueToSearchString(subValue);
      if (!subText && type !== 'regex') {
        continue;
      }

      if (type === 'regex' && pattern) {
        try {
          const re = new RegExp(pattern, 'im');
          const m = re.exec(subText);
          if (m && m[0]) {
            const ev = m[0].slice(0, 500);
            let start = mapPointerToFullTextOffset(fullText, ev);
            let end = start >= 0 ? start + m[0].length : -1;
            if (start < 0) {
              try {
                const reFull = new RegExp(pattern, 'im');
                const mf = reFull.exec(fullText);
                if (mf && mf[0]) {
                  start = mf.index;
                  end = start + mf[0].length;
                }
              } catch {
                /* ignore */
              }
            }
            if (start >= 0 && end != null && end > start) {
              hits.push(
                buildHit(rule, 'regex', ev, start, end, fullText, ptr || '/', 'json_pointer'),
              );
            }
          }
        } catch {
          /* invalid regex */
        }
      } else if ((type === 'keyword' || type === 'contains') && pattern) {
        const keywords = pattern
          .split('|')
          .map((k: string) => k.trim())
          .filter(Boolean);
        const lowerSub = subText.toLowerCase();
        for (const kw of keywords) {
          if (lowerSub.includes(kw.toLowerCase())) {
            const idxSub = indexOfInsensitive(subText, kw);
            const ev = idxSub >= 0 ? subText.slice(idxSub, idxSub + kw.length) : kw;
            const inFull = mapPointerToFullTextOffset(fullText, ev);
            const start = inFull >= 0 ? inFull : indexOfInsensitive(fullText, kw);
            if (start < 0) {
              const snip =
                subText.length > MAX_CONTEXT_CHARS
                  ? `${subText.slice(0, MAX_CONTEXT_CHARS)}\n…`
                  : subText;
              hits.push({
                ruleId: String(rule.id),
                ruleName: String(rule.name || rule.id),
                type,
                evidence: kw.slice(0, 500),
                matchStart: -1,
                matchEnd: -1,
                startLine: 0,
                startColumn: 0,
                endLine: 0,
                endColumn: 0,
                contextSnippet: snip,
                logicalPath: ptr || '/',
                matchScope: 'json_pointer',
              });
            } else {
              hits.push(
                buildHit(
                  rule,
                  type,
                  kw,
                  start,
                  start + kw.length,
                  fullText,
                  ptr || '/',
                  'json_pointer',
                ),
              );
            }
            break;
          }
        }
      }
      continue;
    }

    const text = useStructureHaystack ? st : rt;
    if (!text) {
      continue;
    }

    if (type === 'regex' && pattern) {
      try {
        const re = new RegExp(pattern, 'im');
        const m = re.exec(text);
        if (m && m[0]) {
          const start = m.index;
          const end = start + m[0].length;
          const inferred = inferDifyExportNodeLocationFromYaml(text, start);
          hits.push(
            buildHit(rule, 'regex', m[0].slice(0, 500), start, end, text, inferred, 'full_text'),
          );
        }
      } catch {
        /* ignore invalid regex */
      }
    } else if ((type === 'keyword' || type === 'contains') && pattern) {
      const keywords = pattern
        .split('|')
        .map((k: string) => k.trim())
        .filter(Boolean);
      const lower = text.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          const start = indexOfInsensitive(text, kw);
          if (start >= 0) {
            const inferred = inferDifyExportNodeLocationFromYaml(text, start);
            hits.push(
              buildHit(rule, type, kw, start, start + kw.length, text, inferred, 'full_text'),
            );
          }
          break;
        }
      }
    }
  }

  return { matched: hits.length > 0, hits };
}
