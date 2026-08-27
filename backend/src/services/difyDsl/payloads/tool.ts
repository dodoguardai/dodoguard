import { asString, isRecord } from '../utils';

function normalizeParamMap(
  raw: unknown,
): Record<string, { bind_type: string; value: string; refs: string[] }> {
  if (!isRecord(raw)) {
    return {};
  }
  const out: Record<string, { bind_type: string; value: string; refs: string[] }> = {};
  for (const [key, v] of Object.entries(raw)) {
    if (!isRecord(v)) {
      continue;
    }
    const bindType = asString(v.type) ?? 'unknown';
    const val = v.value;
    const valueStr =
      typeof val === 'string' ? val : val != null ? JSON.stringify(val).slice(0, 4000) : '';
    out[key] = { bind_type: bindType, value: valueStr, refs: [] };
  }
  return out;
}

export function extractToolPayload(data: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: 'tool',
    provider_id: asString(data.provider_id) ?? null,
    provider_name: asString(data.provider_name) ?? null,
    provider_type: asString(data.provider_type) ?? null,
    tool_name: asString(data.tool_name) ?? asString(data.name) ?? null,
    tool_label: asString(data.tool_label) ?? null,
    tool_description: asString(data.tool_description) ?? asString(data.desc) ?? null,
    tool_node_version: data.tool_node_version ?? null,
    is_team_authorization: Boolean(data.is_team_authorization),
    param_schemas: Array.isArray(data.paramSchemas) ? data.paramSchemas : [],
    tool_configurations: normalizeParamMap(data.tool_configurations),
    tool_parameters: normalizeParamMap(data.tool_parameters),
    retry_config: isRecord(data.retry_config) ? data.retry_config : {},
    error_strategy: data.error_strategy ?? null,
  };
}
