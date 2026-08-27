/**
 * Parse uploaded workflow export text → structured summary + graph snapshot for workflow_config_assets.
 * Reuses the same parsers as config audit / structure APIs (see docs/development/workflow-config-assets-spec.md).
 */

import type { NormalizedWorkflow, ParseSummary } from './difyDsl/normalizeTypes';
import { tryParseCozeStructureForRules } from './cozeConfigStructure';
import { tryParseDifyStructureForRules } from './difyConfigStructure';
import { tryParseFastGptStructureForRules } from './fastgptConfigStructure';

export const WORKFLOW_CONFIG_ASSET_PARSER_VERSION = 'wf-asset-v1';

export type WorkflowSourceType = 'dify' | 'fastgpt' | 'coze' | 'unknown';

export type WorkflowAssetParseSummaryPayload = {
  parserVersion: string;
  sourceType: WorkflowSourceType;
  dslParseSummary: ParseSummary | null;
  inventoryTruncated: boolean;
  normalizedMeta?: NormalizedWorkflow['meta'];
};

export type ParsedWorkflowConfigResult = {
  sourceType: WorkflowSourceType;
  parseStatus: 'ok' | 'failed';
  parseError?: string;
  parseSummary: WorkflowAssetParseSummaryPayload | null;
  graphSnapshot: NormalizedWorkflow | null;
};

function emptyPayload(sourceType: WorkflowSourceType, err: string): ParsedWorkflowConfigResult {
  return {
    sourceType,
    parseStatus: 'failed',
    parseError: err,
    parseSummary: null,
    graphSnapshot: null,
  };
}

function okPayload(
  sourceType: WorkflowSourceType,
  dsl: ParseSummary,
  normalized: NormalizedWorkflow,
  inventoryTruncated: boolean,
): ParsedWorkflowConfigResult {
  const parseSummary: WorkflowAssetParseSummaryPayload = {
    parserVersion: WORKFLOW_CONFIG_ASSET_PARSER_VERSION,
    sourceType,
    dslParseSummary: dsl,
    inventoryTruncated,
    normalizedMeta: normalized.meta,
  };
  return {
    sourceType,
    parseStatus: 'ok',
    parseSummary,
    graphSnapshot: normalized,
  };
}

/**
 * Optional hint: only attempt that platform's parser first; on failure no fallback (caller may retry without hint).
 */
export function parseWorkflowConfigContent(
  rawText: string,
  hint?: WorkflowSourceType | 'auto',
): ParsedWorkflowConfigResult {
  const text = String(rawText ?? '').trim();
  if (!text) {
    return emptyPayload('unknown', 'Empty content');
  }

  const h = hint === undefined || hint === 'auto' ? undefined : hint;

  const tryDify = (): ParsedWorkflowConfigResult | null => {
    const r = tryParseDifyStructureForRules(text);
    if (!r) {
      return null;
    }
    return okPayload('dify', r.parseSummary, r.normalized, r.truncated);
  };

  const tryFastGpt = (): ParsedWorkflowConfigResult | null => {
    const r = tryParseFastGptStructureForRules(text);
    if (!r) {
      return null;
    }
    return okPayload('fastgpt', r.parseSummary, r.normalized, r.truncated);
  };

  const tryCoze = (): ParsedWorkflowConfigResult | null => {
    const r = tryParseCozeStructureForRules(text);
    if (!r) {
      return null;
    }
    return okPayload('coze', r.parseSummary, r.normalized, r.truncated);
  };

  if (h === 'dify') {
    const d = tryDify();
    return d ?? emptyPayload('dify', 'Could not parse as Dify app export');
  }
  if (h === 'fastgpt') {
    const f = tryFastGpt();
    return f ?? emptyPayload('fastgpt', 'Could not parse as FastGPT workflow export');
  }
  if (h === 'coze') {
    const c = tryCoze();
    return c ?? emptyPayload('coze', 'Could not parse as Coze workflow export');
  }

  const d = tryDify();
  if (d) {
    return d;
  }
  const f = tryFastGpt();
  if (f) {
    return f;
  }
  const c = tryCoze();
  if (c) {
    return c;
  }

  return emptyPayload(
    'unknown',
    'Content is not a recognized Dify, FastGPT, or Coze workflow export',
  );
}

export function detectRawFormat(text: string): 'json' | 'yaml' {
  const t = String(text ?? '').trim();
  if (!t) {
    return 'yaml';
  }
  const first = t[0];
  if (first === '{' || first === '[') {
    try {
      JSON.parse(t);
      return 'json';
    } catch {
      return 'yaml';
    }
  }
  return 'yaml';
}
