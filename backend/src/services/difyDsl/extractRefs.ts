import { isRecord } from './utils';

import type { RefToken } from './normalizeTypes';

const DSL_REF_RE = /\{\{#([A-Za-z0-9_.-]+)#\}\}/g;
const PLAIN_REF_RE = /\{\{([A-Za-z0-9_.-]+)\}\}/g;

function parseDslRef(rawInner: string): RefToken {
  const parts = rawInner.split('.').filter(Boolean);
  const root = parts[0] ?? rawInner;
  const path = parts.slice(1);
  const kind: RefToken['kind'] =
    root === 'sys'
      ? 'system_ref'
      : /^\d+$/.test(root) || /^[a-z0-9_-]{6,}$/i.test(root)
        ? 'node_ref'
        : 'plain';
  return { raw: rawInner, root, path, kind };
}

function parsePlainRef(rawInner: string): RefToken {
  const parts = rawInner.split('.').filter(Boolean);
  const root = parts[0] ?? rawInner;
  const path = parts.slice(1);
  const kind: RefToken['kind'] = root === 'sys' ? 'system_ref' : 'plain';
  return { raw: rawInner, root, path, kind };
}

export function extractRefsFromText(text: string): RefToken[] {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const seen = new Set<string>();
  const out: RefToken[] = [];

  let m: RegExpExecArray | null;
  const dslRe = new RegExp(DSL_REF_RE.source, 'g');
  while ((m = dslRe.exec(text)) !== null) {
    const inner = m[1] ?? '';
    if (!inner || seen.has(`#${inner}#`)) {
      continue;
    }
    seen.add(`#${inner}#`);
    out.push(parseDslRef(inner));
  }

  const plainRe = new RegExp(PLAIN_REF_RE.source, 'g');
  while ((m = plainRe.exec(text)) !== null) {
    const inner = m[1] ?? '';
    if (!inner || inner.includes('#') || seen.has(`{{${inner}}}`)) {
      continue;
    }
    seen.add(`{{${inner}}}`);
    out.push(parsePlainRef(inner));
  }

  return out;
}

function collectStringsFromValue(v: unknown, out: string[], depth: number): void {
  if (depth > 8) {
    return;
  }
  if (typeof v === 'string') {
    out.push(v);
    return;
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      collectStringsFromValue(item, out, depth + 1);
    }
    return;
  }
  if (isRecord(v)) {
    for (const val of Object.values(v)) {
      collectStringsFromValue(val, out, depth + 1);
    }
  }
}

/**
 * Spec 10.5: scan payload fields for refs by node kind.
 */
export function collectRefsFromPayload(
  nodeType: string,
  payload: Record<string, unknown>,
): RefToken[] {
  const blobs: string[] = [];
  const nt = nodeType.trim().toLowerCase().replace(/_/g, '-');

  if (nt === 'llm' || nt === 'chat' || nt === 'completion') {
    const pt = payload.prompt_template;
    if (Array.isArray(pt)) {
      for (const item of pt) {
        if (isRecord(item) && typeof item.text === 'string') {
          blobs.push(item.text);
        }
      }
    }
    const ctxSel = payload.context_variable_selector;
    if (Array.isArray(ctxSel)) {
      blobs.push(JSON.stringify(ctxSel));
    }
    collectStringsFromValue(payload.default_value, blobs, 0);
  } else if (nt === 'tool' || nt === 'custom-tool' || nt === 'customtool') {
    collectStringsFromValue(payload.tool_parameters, blobs, 0);
    collectStringsFromValue(payload.tool_configurations, blobs, 0);
  } else if (nt === 'knowledge-retrieval' || nt.includes('knowledge')) {
    collectStringsFromValue(payload.query_variable_selector, blobs, 0);
  } else if (nt === 'if-else' || nt === 'ifelse' || nt === 'conditional') {
    collectStringsFromValue(payload.cases, blobs, 0);
  } else if (nt === 'answer' || nt === 'reply') {
    if (typeof payload.answer_template === 'string') {
      blobs.push(payload.answer_template);
    }
  } else {
    collectStringsFromValue(payload, blobs, 0);
  }

  const merged: RefToken[] = [];
  const seenRaw = new Set<string>();
  for (const b of blobs) {
    for (const t of extractRefsFromText(b)) {
      const k = `${t.kind}:${t.raw}`;
      if (!seenRaw.has(k)) {
        seenRaw.add(k);
        merged.push(t);
      }
    }
  }
  return merged;
}

export function refPathString(t: RefToken): string {
  if (t.path.length === 0) {
    return t.root;
  }
  return `${t.root}.${t.path.join('.')}`;
}

/** Fill tool_parameters / tool_configurations refs string lists from values. */
export function attachRefsToToolPayload(payload: Record<string, unknown>): void {
  const tp = payload.tool_parameters;
  const tc = payload.tool_configurations;
  for (const block of [tp, tc]) {
    if (!isRecord(block)) {
      continue;
    }
    for (const v of Object.values(block)) {
      if (!isRecord(v) || typeof v.value !== 'string') {
        continue;
      }
      const refs = extractRefsFromText(v.value).map(refPathString);
      v.refs = refs;
    }
  }
}
