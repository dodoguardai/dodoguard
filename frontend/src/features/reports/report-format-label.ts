/** Human-readable label for persisted report `format` (list + detail badges). */
export function formatReportStorageFormatLabel(format: unknown): string {
  const f = String(format ?? '')
    .trim()
    .toLowerCase();
  if (f === 'md') {
    return 'Markdown';
  }
  if (f === 'html') {
    return 'HTML';
  }
  if (f === 'pdf') {
    return 'PDF';
  }
  if (f === 'docx') {
    return 'Word';
  }
  return f ? f.toUpperCase() : 'N/A';
}
