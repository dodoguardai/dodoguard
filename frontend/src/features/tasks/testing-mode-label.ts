/** User-facing label for `attackMode` (stored value remains API-compatible). */
export function formatTestingModeLabel(mode: string | undefined): string {
  if (!mode) {
    return '—';
  }
  if (mode === 'simple') {
    return 'Simple Scanning';
  }
  return mode;
}
