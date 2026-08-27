/**
 * Extract JSON object text from LLM chat output (fences, preamble, trailing text).
 */

/** OpenAI multimodal `content` arrays → plain text. */
export function coerceChatContentToText(raw: unknown): string {
  if (raw === null || raw === undefined) {
    return '';
  }
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && 'text' in part) {
          const t = (part as { text?: unknown }).text;
          return typeof t === 'string' ? t : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(raw);
}

/** Balanced `{ ... }` starting exactly at `start` (must be `{`). */
export function extractBalancedJsonObjectFrom(source: string, start: number): string | null {
  if (source[start] !== '{') {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  return null;
}

/** First top-level `{ ... }` balanced for strings (handles escapes). */
export function extractBalancedJsonObject(source: string): string | null {
  const start = source.indexOf('{');
  if (start < 0) {
    return null;
  }
  return extractBalancedJsonObjectFrom(source, start);
}

/**
 * Try each `{` position and return the first substring that parses as JSON (later `{` often = final answer after "Thinking:").
 */
export function extractFirstParseableJsonObject(source: string): string | null {
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '{') {
      continue;
    }
    const blob = extractBalancedJsonObjectFrom(source, i);
    if (!blob) {
      continue;
    }
    try {
      JSON.parse(blob);
      return blob;
    } catch {
      continue;
    }
  }
  return null;
}

/** Strip ``` or ```json ... ``` wrapper if the whole blob is (mostly) one fence. */
export function stripMarkdownJsonFence(text: string): string {
  const t = text.trim();
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (m) {
    return m[1].trim();
  }
  return t;
}

function looksLikeAuditPayload(o: Record<string, unknown>): boolean {
  return typeof o.summary === 'string' && typeof o.overallRisk === 'string';
}

/**
 * Models often emit long prose / "thinking" first and put the real JSON object at the end.
 * Scan `{` positions from right to left and return the first blob that parses to an audit-shaped object.
 */
export function extractAuditShapedJsonObject(source: string): string | null {
  for (let i = source.length - 1; i >= 0; i--) {
    if (source[i] !== '{') {
      continue;
    }
    const blob = extractBalancedJsonObjectFrom(source, i);
    if (!blob) {
      continue;
    }
    try {
      const parsed = JSON.parse(blob) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const o = parsed as Record<string, unknown>;
        if (looksLikeAuditPayload(o)) {
          return blob;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Provider sometimes returns an object whose JSON is still a string (e.g. `{ content: "{...}" }`
 * or a leaked `choices[0].message.content`). Hoist that string and parse recursively.
 */
export function hoistJsonPayloadFromProviderObject(
  o: Record<string, unknown>,
): unknown | undefined {
  if (looksLikeAuditPayload(o)) {
    return undefined;
  }

  const choices = o.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const ch0 = choices[0] as Record<string, unknown>;
    const msg = ch0.message;
    if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
      const m = msg as Record<string, unknown>;
      if (typeof m.content === 'string' && m.content.trim()) {
        return m.content;
      }
    }
  }

  const msg = o.message;
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    const m = msg as Record<string, unknown>;
    if (typeof m.content === 'string' && m.content.trim()) {
      return m.content;
    }
  }

  for (const key of ['content', 'text', 'answer', 'result', 'output', 'response', 'data']) {
    const val = o[key];
    if (typeof val === 'string' && val.trim()) {
      return val;
    }
  }

  return undefined;
}

/**
 * Parse audit JSON from provider `output`, which may be string or pre-parsed object.
 */
export function parseDifyAuditModelJsonOutput(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const hoisted = hoistJsonPayloadFromProviderObject(o);
    if (hoisted !== undefined) {
      return parseDifyAuditModelJsonOutput(hoisted);
    }
    return raw;
  }

  const text = coerceChatContentToText(raw);
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Empty model output');
  }

  const tryParse = (s: string | null | undefined): unknown | undefined => {
    if (!s) {
      return undefined;
    }
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const candidates = [
    trimmed,
    stripMarkdownJsonFence(trimmed),
    extractBalancedJsonObject(trimmed),
    extractBalancedJsonObject(stripMarkdownJsonFence(trimmed)),
    extractFirstParseableJsonObject(trimmed),
    extractFirstParseableJsonObject(stripMarkdownJsonFence(trimmed)),
  ];

  for (const c of candidates) {
    const v = tryParse(typeof c === 'string' ? c : null);
    if (v !== undefined) {
      return v;
    }
  }

  const auditTail = extractAuditShapedJsonObject(trimmed);
  if (auditTail) {
    const v = tryParse(auditTail);
    if (v !== undefined) {
      return v;
    }
  }

  // "Thinking: ...\n\n{...}" or multiple blocks — try later segments (final answer is often last)
  if (/^Thinking:/i.test(trimmed)) {
    const chunks = trimmed.split(/\n\n+/);
    for (let i = chunks.length - 1; i >= 0; i--) {
      const piece = chunks[i].trim();
      if (!piece || /^Thinking:/i.test(piece)) {
        continue;
      }
      for (const c of [
        piece,
        stripMarkdownJsonFence(piece),
        extractBalancedJsonObject(piece),
        extractFirstParseableJsonObject(piece),
        extractAuditShapedJsonObject(piece),
      ]) {
        const v = tryParse(typeof c === 'string' ? c : null);
        if (v !== undefined) {
          return v;
        }
      }
    }
  }

  throw new Error('Model returned non-JSON output');
}

/**
 * Some OpenAI-compatible APIs return double-encoded JSON: root parses to a string that is itself JSON text.
 * Unwrap until value is not a string or JSON.parse fails (max `maxLayers`).
 */
export function unwrapJsonStringLayers(value: unknown, maxLayers = 4): unknown {
  let v: unknown = value;
  for (let i = 0; i < maxLayers && typeof v === 'string'; i++) {
    const t = v.trim();
    if (!t) {
      break;
    }
    try {
      v = JSON.parse(t);
    } catch {
      break;
    }
  }
  return v;
}

/** If model wraps the audit in `{ data: { ... } }` etc., lift the inner object. */
export function unwrapKnownAuditWrappers(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const o = value as Record<string, unknown>;
  if (looksLikeAuditPayload(o)) {
    return value;
  }
  for (const key of ['data', 'result', 'audit', 'output', 'response', 'content']) {
    const inner = o[key];
    if (typeof inner === 'string' && inner.trim()) {
      try {
        const parsed = JSON.parse(inner.trim()) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const inObj = parsed as Record<string, unknown>;
          if (looksLikeAuditPayload(inObj)) {
            return parsed;
          }
        }
      } catch {
        const blob = extractFirstParseableJsonObject(inner);
        if (blob) {
          try {
            const parsed = JSON.parse(blob) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const inObj = parsed as Record<string, unknown>;
              if (looksLikeAuditPayload(inObj)) {
                return parsed;
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const inObj = inner as Record<string, unknown>;
      if (looksLikeAuditPayload(inObj)) {
        return inner;
      }
    }
  }
  return value;
}

/**
 * Turn provider output into a plain object for Zod `auditResultSchema`: multi-layer JSON strings,
 * prose + JSON, and common wrapper shapes.
 */
export function normalizeDifyAuditLlmJson(value: unknown): unknown {
  let v: unknown = value;

  for (let iter = 0; iter < 32; iter++) {
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) {
        return v;
      }
      try {
        v = JSON.parse(t);
        continue;
      } catch {
        const blob = extractFirstParseableJsonObject(t);
        if (blob) {
          try {
            v = JSON.parse(blob);
            continue;
          } catch {
            /* fall through */
          }
        }
        try {
          v = parseDifyAuditModelJsonOutput(t);
          continue;
        } catch {
          return v;
        }
      }
    }

    if (Array.isArray(v) && v.length === 1 && v[0] !== null && typeof v[0] === 'object') {
      v = v[0];
      continue;
    }

    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const hoisted = hoistJsonPayloadFromProviderObject(o);
      if (hoisted !== undefined) {
        v = hoisted;
        continue;
      }
      const next = unwrapKnownAuditWrappers(v);
      if (next !== v) {
        v = next;
        continue;
      }
      return v;
    }

    return v;
  }

  return v;
}
