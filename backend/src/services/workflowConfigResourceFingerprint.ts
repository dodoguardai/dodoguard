/**
 * Stable resource fingerprints for workflow graph nodes — used to correlate the same
 * logical resource (LLM model, dataset set, HTTP endpoint, etc.) across assets / agents.
 */

import { createHash } from 'node:crypto';

import type { NormalizedNode } from './difyDsl/normalizeTypes';

function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) {
    sorted[k] = obj[k];
  }
  return JSON.stringify(sorted);
}

export function normalizeWorkflowNodeTypeKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

export type ResourceDescriptor = {
  label: string;
  descriptor: Record<string, unknown>;
};

/**
 * Build a human label + canonical descriptor from a normalized node (payload is kind-specific).
 */
export function buildResourceDescriptor(node: NormalizedNode): ResourceDescriptor {
  const p = node.payload ?? {};
  const kind = String(p.kind ?? '');
  const nt = normalizeWorkflowNodeTypeKey(node.node_type);

  if (kind === 'llm' || nt === 'llm' || nt === 'chat' || nt === 'completion') {
    const model = String(p.model_name ?? (p as { model?: unknown }).model ?? '').trim();
    const provider = String(p.provider ?? '').trim();
    const label = [provider, model].filter(Boolean).join(' · ') || node.title || node.node_id;
    return {
      label,
      descriptor: { v: 1, res: 'llm', model: model || node.title, provider },
    };
  }

  if (kind === 'knowledge-retrieval' || nt.includes('knowledge') || nt.includes('retrieval')) {
    const ids = Array.isArray(p.dataset_ids)
      ? [...(p.dataset_ids as unknown[])].map((x) => String(x)).sort()
      : [];
    const names = Array.isArray(p.dataset_names)
      ? [...(p.dataset_names as unknown[])].map((x) => String(x)).sort()
      : [];
    const label =
      names.length > 0
        ? names.join(', ')
        : ids.length > 0
          ? `datasets (${ids.length})`
          : node.title || node.node_id;
    return {
      label,
      descriptor: { v: 1, res: 'knowledge', dataset_ids: ids, dataset_names: names },
    };
  }

  if (kind === 'tool' || nt === 'tool' || nt === 'custom-tool' || nt === 'customtool') {
    const provider = String(p.provider_name ?? p.provider_id ?? '').trim();
    const tool = String(p.tool_name ?? '').trim();
    const label = [provider, tool].filter(Boolean).join(' · ') || node.title || node.node_id;
    return {
      label,
      descriptor: {
        v: 1,
        res: 'tool',
        provider_id: String(p.provider_id ?? ''),
        tool_name: tool,
      },
    };
  }

  if (nt === 'http-request' || nt === 'httprequest') {
    const url = String(
      (p as { url?: unknown }).url ?? (p as { api_endpoint?: unknown }).api_endpoint ?? '',
    ).trim();
    return {
      label: url || node.title || node.node_id,
      descriptor: { v: 1, res: 'http', url },
    };
  }

  if (kind === 'code' || nt === 'code') {
    const code = String((p as { code?: unknown }).code ?? '').slice(0, 2000);
    return {
      label: node.title || node.node_id,
      descriptor: { v: 1, res: 'code', code_snippet: code },
    };
  }

  return {
    label: node.title || node.node_id,
    descriptor: {
      v: 1,
      res: 'generic',
      node_type: node.node_type,
      title: node.title,
    },
  };
}

export function fingerprintForNode(node: NormalizedNode): string {
  const { descriptor } = buildResourceDescriptor(node);
  const body = stableStringify({
    nodeType: node.node_type,
    ...descriptor,
  });
  return createHash('sha256').update(body, 'utf8').digest('hex');
}
