import { asString, isRecord } from '../utils';

function mapPromptTemplate(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => {
    if (!isRecord(item)) {
      return item;
    }
    return {
      id: asString(item.id),
      role: asString(item.role),
      text: typeof item.text === 'string' ? item.text : '',
    };
  });
}

export function extractLlmPayload(data: Record<string, unknown>): Record<string, unknown> {
  const ctx = isRecord(data.context) ? data.context : null;
  return {
    kind: 'llm',
    provider: data.provider ?? null,
    model_name: asString(data.model) ?? asString(data.model_name) ?? null,
    model_mode: asString(data.mode) ?? asString(data.model_mode) ?? null,
    completion_params: isRecord(data.completion_params) ? data.completion_params : {},
    context_enabled: Boolean((ctx && ctx.enabled) ?? data.context_enabled),
    context_variable_selector: Array.isArray(ctx?.variable_selector)
      ? ctx.variable_selector
      : Array.isArray(data.context_variable_selector)
        ? data.context_variable_selector
        : [],
    prompt_template: mapPromptTemplate(data.prompt_template),
    structured_output_enabled: Boolean(
      data.structured_output_enabled ??
        (isRecord(data.structured_output) ? data.structured_output.enabled : undefined),
    ),
    structured_output_schema: data.structured_output ?? null,
    default_value: Array.isArray(data.default_value) ? data.default_value : [],
    error_strategy: data.error_strategy ?? null,
    retry_config: isRecord(data.retry_config) ? data.retry_config : {},
    vision_enabled: Boolean(
      (isRecord(data.vision) ? data.vision.enabled : undefined) ?? data.vision_enabled,
    ),
  };
}
