/** First top-level `{ ... }` by brace depth (handles trailing chatter after JSON). */
export function extractFirstBalancedJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) {
    return null;
  }
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return s.slice(start, i + 1);
      }
    }
  }
  return null;
}
