/**
 * Extract ZIP / tar.gz to isolated temp work directory (zip-slip safe).
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { unzipSync } from 'fflate';

import {
  extractTarGzArchive,
  isSafeArchiveRelativePath,
  MAX_SKILL_FILES,
  MAX_SKILL_SINGLE_FILE_BYTES,
  MAX_SKILL_UNCOMPRESSED_TOTAL,
  MAX_SKILL_ZIP_BYTES,
  normalizeArchivePath,
} from '../../../backend/src/services/skillPackageExtract';
import { enrichFinding } from './finding-meta';
import type { AssetManifestItem, UnifiedFinding } from './types';

export type WorkDirResult = {
  workDir: string;
  filePaths: string[];
  assetManifest: AssetManifestItem[];
  warnings: string[];
  securityFindings: UnifiedFinding[];
};

function classifyPath(path: string): AssetManifestItem['kind'] {
  const lower = path.toLowerCase();
  const base = lower.split('/').pop() ?? lower;
  if (/skill\.md$|readme|instructions|prompts\//.test(lower)) {
    return 'instruction';
  }
  if (/\.(py|js|ts|sh|bash|ps1)$/.test(lower) || base === 'dockerfile') {
    return 'script';
  }
  if (/\.(yaml|yml|json|toml|env)$/.test(lower) || /manifest|mcp\.json/.test(lower)) {
    return 'config';
  }
  if (/requirements\.txt|package\.json|pnpm-lock|poetry\.lock/.test(lower)) {
    return 'dependency';
  }
  if (/\.(csv|xlsx|data\/)/.test(lower)) {
    return 'data';
  }
  return 'other';
}

function pathTraversalFinding(rawPath: string): UnifiedFinding {
  return enrichFinding({
    severity: 'critical',
    category: 'ARCHIVE_SECURITY',
    riskType: 'filesystem_risk',
    location: rawPath,
    issue: '压缩包包含路径穿越或非法路径条目',
    evidence: rawPath,
    recommendation: '拒绝使用该压缩包；要求重新打包并移除 ../ 等逃逸路径',
    sourceEngines: ['archive_parser'],
    ruleIds: ['ARCHIVE-PATH-TRAVERSAL'],
    confidence: 'high',
    suggestedAction: 'block',
  });
}

function isTarGzBuffer(buffer: Buffer, fileName?: string): boolean {
  const lower = (fileName ?? '').toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    return true;
  }
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function resolveArchiveEntries(
  buffer: Buffer,
  fileName: string | undefined,
  warnings: string[],
): Record<string, Uint8Array> {
  if (isTarGzBuffer(buffer, fileName)) {
    return extractTarGzArchive(buffer, warnings, fileName ?? 'archive.tar.gz');
  }
  try {
    return unzipSync(new Uint8Array(buffer));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid or corrupted archive: ${msg}`);
  }
}

async function materializeEntries(
  entries: Record<string, Uint8Array>,
  archiveLabel: string,
): Promise<WorkDirResult> {
  const warnings: string[] = [];
  const securityFindings: UnifiedFinding[] = [];
  const workDir = await mkdtemp(join(tmpdir(), 'cap-scan-'));
  const filePaths: string[] = [];
  const assetManifest: AssetManifestItem[] = [];
  let uncompressedTotal = 0;

  const names = Object.keys(entries).filter((k) => !k.endsWith('/') && entries[k]?.length);
  names.sort((a, b) => a.localeCompare(b));

  for (const rawName of names) {
    const normalized = normalizeArchivePath(rawName);
    if (!isSafeArchiveRelativePath(normalized)) {
      warnings.push(`Skipped unsafe path in ${archiveLabel}: ${rawName}`);
      securityFindings.push(pathTraversalFinding(rawName));
      continue;
    }

    const buf = entries[rawName];
    if (!buf || buf.length === 0) {
      continue;
    }
    if (buf.length > MAX_SKILL_SINGLE_FILE_BYTES) {
      warnings.push(`Skipped oversized file (${normalized})`);
      continue;
    }

    uncompressedTotal += buf.length;
    if (uncompressedTotal > MAX_SKILL_UNCOMPRESSED_TOTAL) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      throw new Error(
        `Uncompressed content exceeds limit (${MAX_SKILL_UNCOMPRESSED_TOTAL / 1024 / 1024} MB)`,
      );
    }

    const dest = join(workDir, ...normalized.split('/'));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    filePaths.push(normalized);
    assetManifest.push({
      path: normalized,
      kind: classifyPath(normalized),
      sizeBytes: buf.length,
    });

    if (filePaths.length >= MAX_SKILL_FILES) {
      warnings.push(`Stopped after ${MAX_SKILL_FILES} files`);
      break;
    }
  }

  if (filePaths.length === 0 && securityFindings.length === 0) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    throw new Error(`No files extracted from ${archiveLabel}`);
  }

  return { workDir, filePaths, assetManifest, warnings, securityFindings };
}

export async function extractArchiveToWorkDir(
  buffer: Buffer,
  fileName?: string,
): Promise<WorkDirResult> {
  if (buffer.length > MAX_SKILL_ZIP_BYTES) {
    throw new Error(`Archive exceeds maximum size (${MAX_SKILL_ZIP_BYTES / 1024 / 1024} MB)`);
  }

  const label = fileName ?? (isTarGzBuffer(buffer, fileName) ? 'archive.tar.gz' : 'archive.zip');
  const warnings: string[] = [];
  const entries = resolveArchiveEntries(buffer, fileName, warnings);
  const result = await materializeEntries(entries, label);
  return {
    ...result,
    warnings: [...warnings, ...result.warnings],
  };
}

/** @deprecated Use extractArchiveToWorkDir */
export async function extractZipToWorkDir(zipBuffer: Buffer): Promise<WorkDirResult> {
  return extractArchiveToWorkDir(zipBuffer, 'archive.zip');
}

export async function writeMarkdownWorkDir(
  markdown: string,
  fileName = 'SKILL.md',
): Promise<WorkDirResult> {
  const safeName = fileName.replace(/[/\\]/g, '_').slice(0, 200) || 'SKILL.md';
  const workDir = await mkdtemp(join(tmpdir(), 'cap-scan-md-'));
  const dest = join(workDir, safeName);
  await writeFile(dest, markdown, 'utf8');
  return {
    workDir,
    filePaths: [safeName],
    assetManifest: [
      { path: safeName, kind: 'instruction', sizeBytes: Buffer.byteLength(markdown, 'utf8') },
    ],
    warnings: [],
    securityFindings: [],
  };
}

export async function cleanupWorkDir(workDir: string): Promise<void> {
  await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
}
