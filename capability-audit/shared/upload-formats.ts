/** 制品上传格式 — 与 backend parse-request / workdir 对齐 */

export const MAX_ARCHIVE_BYTES = 15 * 1024 * 1024;
export const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;

export const SUPPORTED_ARCHIVE_EXTENSIONS = ['.zip', '.tar.gz', '.tgz'] as const;

export const ARCHIVE_ACCEPT =
  '.zip,.tar.gz,.tgz,application/zip,application/gzip,application/x-gzip,application/x-tar';

export function isSupportedArchiveFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.zip') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz');
}

export function archiveFormatHint(isZh: boolean): string {
  return isZh ? '.zip · .tar.gz · .tgz' : '.zip · .tar.gz · .tgz';
}

export function archiveSizeLimitMb(): number {
  return MAX_ARCHIVE_BYTES / 1024 / 1024;
}
