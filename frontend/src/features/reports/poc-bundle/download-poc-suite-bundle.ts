import { strToU8, zipSync } from 'fflate';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

import type { PocDocumentSpec } from './poc-documents';

export type PocSuiteBundleFormat = 'html' | 'md' | 'pdf';

function sanitizeTaskSegment(taskName: string | undefined): string {
  if (!taskName?.trim()) {
    return '';
  }
  return taskName.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 40);
}

/** Safe single path segment for zip entry (no slashes, no traversal). */
function zipEntryBase(downloadBaseName: string, taskSegment: string): string {
  const base = downloadBaseName.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'document';
  return taskSegment ? `${base}-${taskSegment}` : base;
}

function dedupeEntryNames(bases: string[]): string[] {
  const seen = new Map<string, number>();
  return bases.map((b) => {
    const c = seen.get(b) ?? 0;
    seen.set(b, c + 1);
    if (c === 0) {
      return b;
    }
    return `${b}-${c + 1}`;
  });
}

let turndownSingleton: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndownSingleton) {
    turndownSingleton = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    turndownSingleton.use(gfm);
  }
  return turndownSingleton;
}

/** Strip PoC inject (layout CSS + prefill banner) so Markdown export starts at real document content. */
function stripInjectedChromeFromBody(body: HTMLElement): void {
  body.querySelectorAll('style').forEach((el) => el.remove());
  body.querySelectorAll('.poc-prefill-notice').forEach((el) => el.remove());
}

function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  stripInjectedChromeFromBody(doc.body);
  return getTurndown().turndown(doc.body);
}

function buildZipFromUtf8Files(
  files: Array<{ path: string; content: string }>,
): Uint8Array {
  const map: Record<string, Uint8Array> = {};
  for (const f of files) {
    map[f.path] = strToU8(f.content);
  }
  return zipSync(map, { level: 6 });
}

export function getPocSuiteZipFileName(taskName: string | undefined, format: PocSuiteBundleFormat): string {
  const seg = sanitizeTaskSegment(taskName);
  const mid = seg ? `-${seg}` : '';
  return `PoC-suite${mid}-${format}.zip`;
}

/** Same `baseName` values as the HTML/Markdown zip entries, for the PDF zip API payload. */
export function buildPocSuitePdfDocuments(
  filledById: Record<string, string>,
  specs: PocDocumentSpec[],
  taskName: string | undefined,
): Array<{ baseName: string; html: string }> {
  const taskSeg = sanitizeTaskSegment(taskName);
  const bases = specs.map((s) => zipEntryBase(s.downloadBaseName, taskSeg));
  const uniqueBases = dedupeEntryNames(bases);
  return specs.map((spec, i) => ({
    baseName: uniqueBases[i],
    html: filledById[spec.id] ?? '',
  }));
}

export async function buildPocSuiteClientZipBlob(
  filledById: Record<string, string>,
  specs: PocDocumentSpec[],
  format: 'html' | 'md',
  taskName: string | undefined,
): Promise<Blob> {
  const taskSeg = sanitizeTaskSegment(taskName);
  const bases = specs.map((s) => zipEntryBase(s.downloadBaseName, taskSeg));
  const uniqueBases = dedupeEntryNames(bases);
  const ext = format === 'html' ? 'html' : 'md';

  const files = specs.map((spec, i) => {
    const html = filledById[spec.id] ?? '';
    const body = format === 'html' ? html : htmlToMarkdown(html);
    return { path: `${uniqueBases[i]}.${ext}`, content: body };
  });

  const zipped = buildZipFromUtf8Files(files);
  return new Blob([new Uint8Array(zipped)], { type: 'application/zip' });
}

export function triggerZipDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
