/**
 * Run log table: API rounds store a short status in `message` and the body summary in `responsePreview`.
 * The Message column should prefer that preview whenever present (any `source`), not only coze/dify.
 */

const DEFAULT_MAX_DISPLAY_LEN = 400;

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== 'string') {
    return undefined;
  }
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** Raw preview text for tooltips / copy (no truncation). */
export function getRunLogResponsePreviewRaw(log: {
  responsePreview?: unknown;
  response_preview?: unknown;
  body?: unknown;
}): string {
  const fromPreview =
    asNonEmptyString(log.responsePreview) ?? asNonEmptyString(log.response_preview);
  if (fromPreview) {
    return fromPreview;
  }
  const body = asNonEmptyString(log.body);
  if (body) {
    return body;
  }
  return '';
}

/** Raw user / attack prompt on API round logs. */
export function getRunLogPromptRaw(log: { prompt?: unknown }): string {
  return asNonEmptyString(log.prompt) ?? '';
}

function formatPromptAndResponseLines(
  prompt: string,
  preview: string,
  labels?: { prompt?: string; reply?: string },
): string {
  const promptLabel = labels?.prompt ?? '指令';
  const replyLabel = labels?.reply ?? '回复';
  return `${promptLabel}: ${prompt}\n${replyLabel}: ${preview}`;
}

/**
 * Cell text: when both prompt and response exist, show both; else prefer preview, then prompt, then message.
 */
export function formatRunLogTableMessage(
  log: {
    message?: string;
    prompt?: unknown;
    responsePreview?: unknown;
    response_preview?: unknown;
    body?: unknown;
    source?: string;
    rawOutput?: unknown;
    result?: { reason?: unknown; vulnerable?: unknown };
  },
  maxLen = DEFAULT_MAX_DISPLAY_LEN,
  labels?: { prompt?: string; reply?: string },
): string {
  if (log.source === 'llm-judge') {
    const msg = asNonEmptyString(log.message);
    if (msg) {
      return msg.length > maxLen ? `${msg.slice(0, maxLen)}…` : msg;
    }
    const raw = asNonEmptyString(log.rawOutput);
    if (raw) {
      return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
    }
    const reason =
      log.result && typeof log.result === 'object' && log.result !== null
        ? asNonEmptyString((log.result as { reason?: unknown }).reason)
        : undefined;
    if (reason) {
      return reason.length > maxLen ? `${reason.slice(0, maxLen)}…` : reason;
    }
  }

  const prompt = getRunLogPromptRaw(log);
  const preview = getRunLogResponsePreviewRaw(log);
  if (prompt && preview !== '') {
    const combined = formatPromptAndResponseLines(prompt, preview, labels);
    return combined.length > maxLen ? `${combined.slice(0, maxLen)}…` : combined;
  }
  if (preview !== '') {
    return preview.length > maxLen ? `${preview.slice(0, maxLen)}…` : preview;
  }
  if (prompt) {
    return prompt.length > maxLen ? `${prompt.slice(0, maxLen)}…` : prompt;
  }
  return log.message ?? '';
}

/** Hover title: full prompt + response when both exist. */
export function getRunLogTableCellTitle(
  log: {
    message?: string;
    prompt?: unknown;
    responsePreview?: unknown;
    response_preview?: unknown;
    body?: unknown;
  },
  labels?: { prompt?: string; reply?: string },
): string {
  const prompt = getRunLogPromptRaw(log);
  const preview = getRunLogResponsePreviewRaw(log);
  if (prompt && preview !== '') {
    return formatPromptAndResponseLines(prompt, preview, labels);
  }
  if (preview !== '') {
    return preview;
  }
  if (prompt) {
    return prompt;
  }
  return log.message ?? '';
}

const API_ROUND_SOURCES: ReadonlySet<string> = new Set([
  'coze',
  'dify',
  'n8n',
  'fastgpt',
  'api',
  'langchain',
]);

type RunLogLike = {
  source?: unknown;
  commandId?: unknown;
  vulnerabilityId?: unknown;
  responsePreview?: unknown;
  response_preview?: unknown;
  body?: unknown;
};

/**
 * Log detail dialog: same body as the Message column (`getRunLogResponsePreviewRaw`), and when the row is
 * `attack-command` without an inlined preview, use the matching API round (e.g. coze) from the same run.
 */
export function resolveRunLogResponsePreviewForDetail(selected: RunLogLike, allLogs: unknown[]): string {
  const direct = getRunLogResponsePreviewRaw(selected);
  if (direct !== '') {
    return direct;
  }
  if (String(selected.source ?? '') !== 'attack-command') {
    return '';
  }

  const cmdId = selected.commandId != null ? String(selected.commandId) : '';
  const vulnId = selected.vulnerabilityId != null ? String(selected.vulnerabilityId) : '';

  const tryMatch = (list: unknown[]): string => {
    for (const raw of list) {
      const l = raw as RunLogLike;
      if (!l || typeof l !== 'object') {
        continue;
      }
      const ls = String(l.source ?? '');
      if (!API_ROUND_SOURCES.has(ls)) {
        continue;
      }
      if (cmdId && l.commandId != null && String(l.commandId) !== cmdId) {
        continue;
      }
      if (vulnId && l.vulnerabilityId != null && String(l.vulnerabilityId) !== vulnId) {
        continue;
      }
      const p = getRunLogResponsePreviewRaw(l);
      if (p !== '') {
        return p;
      }
    }
    return '';
  };

  const selfIdx = allLogs.findIndex((l) => l === selected);
  if (selfIdx >= 0) {
    const after = tryMatch(allLogs.slice(selfIdx + 1));
    if (after !== '') {
      return after;
    }
    const before = tryMatch([...allLogs.slice(0, selfIdx)].reverse());
    if (before !== '') {
      return before;
    }
  }
  return tryMatch(allLogs);
}

/**
 * Latest non-empty API-round preview for a vulnerability (walks runLogs in order; last match wins).
 * Used when report finding dialog cannot map to a task `attack_results` row but run logs still hold the body.
 */
export function pickLatestApiRoundPreviewForVulnerability(
  allLogs: unknown[],
  vulnerabilityId: string | undefined,
): string {
  if (!vulnerabilityId || !Array.isArray(allLogs)) {
    return '';
  }
  const vid = String(vulnerabilityId);
  let last = '';
  for (const raw of allLogs) {
    const l = raw as RunLogLike;
    if (!l || typeof l !== 'object') {
      continue;
    }
    if (String(l.vulnerabilityId ?? '') !== vid) {
      continue;
    }
    const ls = String(l.source ?? '');
    if (!API_ROUND_SOURCES.has(ls)) {
      continue;
    }
    const p = getRunLogResponsePreviewRaw(l);
    if (p !== '') {
      last = p;
    }
  }
  return last;
}
