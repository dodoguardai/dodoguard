import { asString } from '../utils';

export function extractStartPayload(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: 'start' };
  if (Array.isArray(data.variables)) {
    out.variables = data.variables;
  }
  if (Array.isArray((data as any).input_fields)) {
    out.input_fields = (data as any).input_fields;
  }
  const iv = (data as any).input_variables;
  if (Array.isArray(iv)) {
    out.input_variables = iv;
  }
  if (asString((data as any).system_variables)) {
    out.system_variables_hint = true;
  }
  return out;
}
