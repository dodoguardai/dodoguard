/**
 * Best-effort extraction of Dify workflow node `data` fields for security inventory.
 * Shapes vary by Dify version; all access is defensive.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function _asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function normalizeNodeType(t: string): string {
  return t.trim().toLowerCase().replace(/_/g, '-');
}

/** Collect human-readable dataset hints from common Dify export shapes. */
function extractDatasetHints(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (Array.isArray(data.dataset_ids)) {
    out.dataset_ids = data.dataset_ids;
  }

  const names: string[] = [];
  const dc = data.dataset_configs;
  if (Array.isArray(dc)) {
    for (const item of dc) {
      if (!isRecord(item)) {
        continue;
      }
      const n =
        asString(item.name) ||
        asString(item.dataset_name) ||
        asString(item.datasetName) ||
        asString((item.dataset as Record<string, unknown> | undefined)?.name);
      if (n) {
        names.push(n);
      }
    }
    if (names.length > 0) {
      out.dataset_names = [...new Set(names)];
    }
  } else if (isRecord(dc)) {
    out.dataset_config_keys = Object.keys(dc).slice(0, 32);
    for (const k of Object.keys(dc)) {
      const v = dc[k];
      if (isRecord(v)) {
        const n = asString(v.name) || asString(v.dataset_name);
        if (n) {
          names.push(n);
        }
      }
    }
    if (names.length > 0) {
      out.dataset_names = [...new Set(names)];
    }
  }

  for (const k of [
    'retrieval_mode',
    'multiple_retrieval_config',
    'single_retrieval_config',
    'top_k',
    'score_threshold',
    'reranking_enable',
    'reranking_model',
  ]) {
    if (data[k] !== undefined && data[k] !== null) {
      if (k === 'multiple_retrieval_config' || k === 'single_retrieval_config') {
        if (isRecord(data[k])) {
          out[`${k}_keys`] = Object.keys(data[k] as Record<string, unknown>).slice(0, 24);
        }
      } else {
        out[k] = data[k];
      }
    }
  }

  const qv = data.query_variable_selector;
  if (Array.isArray(qv)) {
    out.query_variable_selector = qv.slice(0, 16);
  }
  if (data.metadata_filtering_mode !== undefined && data.metadata_filtering_mode !== null) {
    out.metadata_filtering_mode = data.metadata_filtering_mode;
  }
  const mrc = data.multiple_retrieval_config;
  if (isRecord(mrc)) {
    const mOut: Record<string, unknown> = {};
    if (mrc.top_k !== undefined) {
      mOut.top_k = mrc.top_k;
    }
    if (mrc.reranking_enable !== undefined) {
      mOut.reranking_enable = mrc.reranking_enable;
    }
    if (mrc.reranking_mode !== undefined) {
      mOut.reranking_mode = mrc.reranking_mode;
    }
    const rm = mrc.reranking_model;
    if (isRecord(rm)) {
      const m = asString(rm.model);
      const p = asString(rm.provider);
      if (m || p) {
        mOut.reranking_model = {
          model: m,
          provider: p,
        };
      }
    }
    if (Object.keys(mOut).length > 0) {
      out.multiple_retrieval_config = mOut;
    }
  }

  return out;
}

function extractHttpRequest(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const url = asString(data.url) || asString(data.api_endpoint) || asString(data.path);
  if (url) {
    out.url = url;
  }
  const method = asString(data.method) || asString(data.request_method);
  if (method) {
    out.method = method.toUpperCase();
  }
  if (typeof data.authorization === 'object' && data.authorization !== null) {
    out.has_authorization_config = true;
  }
  return out;
}

function extractTool(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const toolName =
    asString(data.tool_name) ||
    asString(data.provider_name) ||
    asString(data.tool_label) ||
    asString(data.name);
  if (toolName) {
    out.tool_name = toolName;
  }
  if (asString(data.plugin_id)) {
    out.plugin_id = data.plugin_id;
  }
  if (asString(data.provider_id)) {
    out.provider_id = data.provider_id;
  }
  return out;
}

function extractLlm(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // Visible model / provider hints (kept shallow). Some exports use nested model objects.
  let model: string | undefined;
  let mode: string | undefined;
  let provider: string | undefined;

  const modelField = (data as Record<string, unknown>).model;
  if (typeof modelField === 'string' && modelField.trim()) {
    model = modelField.trim();
  } else if (isRecord(modelField)) {
    model = asString(modelField.name) || asString(modelField.model);
    mode = asString(modelField.mode) || mode;
    provider = asString(modelField.provider) || provider;
  }

  // Fallbacks for flat fields on data itself.
  if (!model) {
    model =
      asString((data as Record<string, unknown>).model_name) ||
      asString((data as Record<string, unknown>).name);
  }
  mode = mode || asString((data as Record<string, unknown>).mode);
  provider = provider || asString((data as Record<string, unknown>).provider);

  if (model) {
    out.model = model;
  }
  if (mode) {
    out.mode = mode;
  }
  if (provider) {
    out.provider = provider;
  }
  const cp = data.completion_params;
  if (isRecord(cp)) {
    const keys = Object.keys(cp).slice(0, 16);
    if (keys.length > 0) {
      out.completion_param_keys = keys;
    }
    // Shallow copy of a safe subset of completion_params values for UI / rules.
    const picked: Record<string, unknown> = {};
    for (const key of [
      'temperature',
      'top_p',
      'top_k',
      'max_tokens',
      'max_tokens_to_sample',
      'presence_penalty',
      'frequency_penalty',
      'seed',
    ]) {
      if (cp[key] !== undefined && cp[key] !== null) {
        const v = cp[key];
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
          picked[key] = v;
        }
      }
    }
    if (Object.keys(picked).length > 0) {
      out.completion_params = picked;
    }
  }
  // Prompt roles + short preview for auditors / UI; keep structure shallow to avoid sanitizer depth cut.
  const pt = (data as Record<string, unknown>).prompt_template;
  if (Array.isArray(pt)) {
    const roles = new Set<string>();
    const snippets: string[] = [];
    for (const item of pt) {
      if (!isRecord(item)) { continue; }
      const role = asString(item.role);
      if (role) {
        roles.add(role);
      }
      if (typeof item.text === 'string' && snippets.length < 3) {
        const prefix = role ? `${role}: ` : '';
        snippets.push(`${prefix}${item.text}`.slice(0, 400));
      }
    }
    if (roles.size > 0) {
      out.prompt_roles = Array.from(roles);
    }
    if (snippets.length > 0) {
      const joined = snippets.join('\n---\n');
      out.prompt_preview = joined.length > 1200 ? `${joined.slice(0, 1200)}\n…` : joined;
    }
  }
  return out;
}

function extractCode(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lang = asString(data.code_language) || asString(data.language);
  if (lang) {
    out.code_language = lang;
  }
  return out;
}

function extractAgent(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ['agent_strategy', 'strategy', 'max_iteration', 'instruction']) {
    if (data[k] !== undefined && data[k] !== null) {
      if (k === 'instruction' && typeof data[k] === 'string') {
        out.has_instruction = true;
        out.instruction_length = (data[k] as string).length;
      } else {
        out[k] = data[k];
      }
    }
  }
  const tools = data.tools || data.agent_tools;
  if (Array.isArray(tools)) {
    const toolIds: string[] = [];
    const toolLabels: string[] = [];
    for (const t of tools) {
      if (isRecord(t)) {
        const id = asString(t.id) || asString(t.tool_name);
        const lb = asString(t.tool_label) || asString(t.name);
        if (id) {
          toolIds.push(id);
        }
        if (lb) {
          toolLabels.push(lb);
        }
      } else if (typeof t === 'string') {
        toolIds.push(t);
      }
    }
    if (toolIds.length > 0) {
      out.tool_ids = toolIds.slice(0, 40);
    }
    if (toolLabels.length > 0) {
      out.tool_labels = toolLabels.slice(0, 40);
    }
  }
  return out;
}

/**
 * Returns a plain object safe to merge into `details` (later passed through sanitizeObject).
 */
export function extractNodeDetails(
  data: Record<string, unknown> | null,
  dataTypeRaw: string,
): Record<string, unknown> {
  const rawKeys = data ? Object.keys(data).slice(0, 48) : [];
  const base: Record<string, unknown> = {
    kind: 'generic',
    rawDataKeys: rawKeys,
  };

  if (!data) {
    return base;
  }

  const dt = normalizeNodeType(dataTypeRaw || '');

  if (dt === 'knowledge-retrieval' || dt === 'dataset-retrieval' || dt.includes('knowledge')) {
    return {
      kind: 'knowledge-retrieval',
      rawDataKeys: rawKeys,
      ...extractDatasetHints(data),
    };
  }

  if (dt === 'http-request' || dt === 'httprequest') {
    return { kind: 'http-request', rawDataKeys: rawKeys, ...extractHttpRequest(data) };
  }

  if (dt === 'tool' || dt === 'custom-tool') {
    return { kind: 'tool', rawDataKeys: rawKeys, ...extractTool(data) };
  }

  if (dt === 'llm' || dt === 'chat' || dt === 'completion') {
    return { kind: 'llm', rawDataKeys: rawKeys, ...extractLlm(data) };
  }

  if (dt === 'code' || dt === 'custom-code') {
    return { kind: 'code', rawDataKeys: rawKeys, ...extractCode(data) };
  }

  if (dt === 'agent') {
    return { kind: 'agent', rawDataKeys: rawKeys, ...extractAgent(data) };
  }

  return base;
}
