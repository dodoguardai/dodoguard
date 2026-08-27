/**
 * Shared helpers for selecting registered target agents in the create-task wizard.
 */

/** Max target agents per wizard submit (each becomes one attack task). */
export const MAX_AGENTS_PER_BATCH = 20;

export function getRegisteredAgentIdsFromTargetConfig(targetConfig: unknown): string[] {
  const tc = targetConfig as Record<string, unknown> | undefined;
  if (!tc) {
    return [];
  }
  const raw = tc.agentIds;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}
