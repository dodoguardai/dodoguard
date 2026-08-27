import { asString, isRecord } from '../utils';

function expandMultipleRetrievalConfig(m: unknown): Record<string, unknown> {
  if (!isRecord(m)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  if (m.top_k !== undefined) {
    out.top_k = m.top_k;
  }
  if (m.reranking_enable !== undefined) {
    out.reranking_enable = m.reranking_enable;
  }
  if (m.reranking_mode !== undefined) {
    out.reranking_mode = m.reranking_mode;
  }
  const rm = m.reranking_model;
  if (isRecord(rm)) {
    out.reranking_model = {
      model: asString(rm.model),
      provider: asString(rm.provider),
    };
  }
  return out;
}

function datasetNamesFromConfigs(dc: unknown): string[] {
  const names: string[] = [];
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
  } else if (isRecord(dc)) {
    for (const k of Object.keys(dc)) {
      const v = dc[k];
      if (isRecord(v)) {
        const n = asString(v.name) || asString(v.dataset_name);
        if (n) {
          names.push(n);
        }
      }
    }
  }
  return [...new Set(names)];
}

export function extractKnowledgeRetrievalPayload(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const dataset_configs = data.dataset_configs;
  const names = datasetNamesFromConfigs(dataset_configs);
  return {
    kind: 'knowledge-retrieval',
    dataset_ids: Array.isArray(data.dataset_ids) ? data.dataset_ids : [],
    dataset_names: names.length > 0 ? names : undefined,
    query_variable_selector: Array.isArray(data.query_variable_selector)
      ? data.query_variable_selector
      : [],
    retrieval_mode: data.retrieval_mode ?? null,
    metadata_filtering_mode: data.metadata_filtering_mode ?? null,
    multiple_retrieval_config: expandMultipleRetrievalConfig(data.multiple_retrieval_config),
    single_retrieval_config: isRecord(data.single_retrieval_config)
      ? { keys: Object.keys(data.single_retrieval_config).slice(0, 24) }
      : {},
    output_variable: asString(data.output_variable) ?? 'result',
    top_k: data.top_k,
    score_threshold: data.score_threshold,
  };
}
