/**
 * Build skill/MCP file tree + preview text for report UI.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AssetManifestItem, SkillPreview, SkillPreviewFile } from './types';

const PREVIEW_MAX_BYTES = 64_000;
const PREVIEW_CONTENT_LIMIT = 20;

const PRIORITY_PATTERNS = [
  /(^|\/)skill\.md$/i,
  /(^|\/)skill\.json$/i,
  /(^|\/)readme\.md$/i,
  /(^|\/)mcp\.json$/i,
];

function isPreviewable(path: string): boolean {
  return /\.(md|markdown|json|txt|ya?ml|sh|bash|ps1|py|js|ts|toml)$/i.test(path);
}

function kindStatsLabel(kind: AssetManifestItem['kind'], isZh: boolean): string {
  const map: Record<AssetManifestItem['kind'], [string, string]> = {
    instruction: ['Markdown', 'Markdown'],
    script: ['Shell', 'Shell'],
    config: ['JSON', 'JSON'],
    dependency: ['Deps', '依赖'],
    data: ['Data', '数据'],
    other: ['Other', '其他'],
  };
  const pair = map[kind] ?? map.other;
  return isZh ? pair[1] : pair[0];
}

function countLines(text: string): number {
  if (!text) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}

function priorityScore(path: string): number {
  for (let i = 0; i < PRIORITY_PATTERNS.length; i += 1) {
    if (PRIORITY_PATTERNS[i].test(path)) {
      return PRIORITY_PATTERNS.length - i;
    }
  }
  return 0;
}

export async function buildSkillPreview(
  workDir: string,
  filePaths: string[],
  assetManifest: AssetManifestItem[],
): Promise<SkillPreview> {
  const manifestByPath = new Map(assetManifest.map((m) => [m.path, m]));
  const files: SkillPreviewFile[] = [];

  const sorted = [...filePaths].sort((a, b) => {
    const pa = priorityScore(a);
    const pb = priorityScore(b);
    if (pa !== pb) {
      return pb - pa;
    }
    return a.localeCompare(b);
  });

  let contentLoaded = 0;
  for (const rel of sorted) {
    const meta = manifestByPath.get(rel);
    const kind = meta?.kind ?? 'other';
    const sizeBytes = meta?.sizeBytes;
    const entry: SkillPreviewFile = { path: rel, kind, sizeBytes };

    const shouldLoad =
      contentLoaded < PREVIEW_CONTENT_LIMIT &&
      isPreviewable(rel) &&
      (sizeBytes === undefined || sizeBytes <= PREVIEW_MAX_BYTES);

    if (shouldLoad) {
      try {
        const raw = await readFile(join(workDir, ...rel.split('/')), 'utf8');
        const clipped =
          raw.length > PREVIEW_MAX_BYTES ? `${raw.slice(0, PREVIEW_MAX_BYTES)}\n…` : raw;
        entry.content = clipped;
        entry.lineCount = countLines(clipped);
        contentLoaded += 1;
      } catch {
        // binary or unreadable — tree entry only
      }
    }

    files.push(entry);
  }

  const statsMap = new Map<string, { count: number; lines: number }>();
  for (const f of files) {
    const label = kindStatsLabel(f.kind, false);
    const cur = statsMap.get(label) ?? { count: 0, lines: 0 };
    cur.count += 1;
    cur.lines += f.lineCount ?? 0;
    statsMap.set(label, cur);
  }

  const stats = [...statsMap.entries()].map(([kind, v]) => ({
    kind,
    count: v.count,
    lines: v.lines,
  }));

  const defaultExpanded =
    files.find((f) => /skill\.md$/i.test(f.path) && f.content)?.path ??
    files.find((f) => f.content)?.path;

  return { files, stats, defaultExpanded };
}
