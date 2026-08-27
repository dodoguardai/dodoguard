export function extractGenericPayload(
  data: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!data) {
    return { kind: 'generic', raw_data_keys: [] as string[] };
  }
  return {
    kind: 'generic',
    raw_data_keys: Object.keys(data).slice(0, 64),
  };
}
