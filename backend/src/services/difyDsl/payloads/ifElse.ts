import { asString, isRecord } from '../utils';

export function extractIfElsePayload(data: Record<string, unknown>): Record<string, unknown> {
  const cases = Array.isArray(data.cases) ? data.cases : [];
  const normalized = cases.map((c, i) => {
    if (!isRecord(c)) {
      return { case_id: `case_${i}`, conditions: [] };
    }
    return {
      case_id: asString(c.case_id) ?? asString(c.id) ?? String(i),
      logical_operator: asString(c.logical_operator) ?? 'or',
      conditions: Array.isArray(c.conditions) ? c.conditions : [],
    };
  });
  return {
    kind: 'if-else',
    cases: normalized,
  };
}
