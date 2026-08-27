/**
 * Safe extraction of text files from a skill .zip for static LLM audit.
 */

import { gunzipSync } from 'node:zlib';

import { strFromU8, unzipSync } from 'fflate';

export const MAX_SKILL_ZIP_BYTES = 15 * 1024 * 1024;
export const MAX_SKILL_UNCOMPRESSED_TOTAL = 24 * 1024 * 1024;
export const MAX_SKILL_FILES = 400;
export const MAX_SKILL_SINGLE_FILE_BYTES = 2 * 1024 * 1024;
/** Outer zip plus one nested archive (e.g. zip → tar.gz → files). */
export const MAX_NESTED_ARCHIVE_DEPTH = 2;

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.yaml',
  '.yml',
  '.json',
  '.txt',
  '.sh',
  '.bash',
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.toml',
  '.xml',
  '.css',
  '.html',
]);

export type SkillPackageTextFile = {
  relativePath: string;
  text: string;
};

export type SkillPackageExtractResult = {
  files: SkillPackageTextFile[];
  warnings: string[];
};

function extname(lowerName: string): string {
  const i = lowerName.lastIndexOf('.');
  if (i <= 0) {
    return '';
  }
  return lowerName.slice(i);
}

function isAllowedTextPath(relativePath: string): boolean {
  const norm = relativePath.replace(/\\/g, '/').trim();
  if (!norm || norm.endsWith('/')) {
    return false;
  }
  const lower = norm.toLowerCase();
  const base = lower.split('/').pop() ?? lower;
  if (base === '.ds_store' || base === 'thumbs.db') {
    return false;
  }
  const ext = extname(lower);
  if (TEXT_EXTENSIONS.has(ext)) {
    return true;
  }
  if (/^(dockerfile|makefile|readme)$/i.test(base)) {
    return true;
  }
  return false;
}

/**
 * Reject paths that escape the archive root (Zip Slip) or use unsafe segments.
 */
export function isSafeArchiveRelativePath(relativePath: string): boolean {
  const norm = relativePath.replace(/\\/g, '/').trim();
  if (!norm || norm.startsWith('/') || /^[a-z]:/i.test(norm)) {
    return false;
  }
  const segments = norm.split('/');
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') {
      return false;
    }
    if (seg.startsWith('..')) {
      return false;
    }
  }
  return true;
}

function looksBinary(buf: Uint8Array, preview = 4096): boolean {
  const n = Math.min(buf.length, preview);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) {
      return true;
    }
  }
  return false;
}

export function normalizeArchivePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

/** Extract all regular files from a .tar.gz / .tgz buffer (zip-slip safe). */
export function extractTarGzArchive(
  tarGzBuffer: Buffer,
  warnings: string[] = [],
  sourceArchive = 'archive.tar.gz',
): Record<string, Uint8Array> {
  const tarBuffer = gunzipSync(tarGzBuffer);
  return extractTarEntries(tarBuffer, warnings, sourceArchive);
}

function isMacOsMetadataPath(relativePath: string): boolean {
  const norm = normalizeArchivePath(relativePath).toLowerCase();
  const base = norm.split('/').pop() ?? norm;
  return norm.startsWith('__macosx/') || base.startsWith('._') || base === '.ds_store';
}

function isNestedArchivePath(relativePath: string): boolean {
  const norm = normalizeArchivePath(relativePath).toLowerCase();
  if (isMacOsMetadataPath(norm)) {
    return false;
  }
  return (
    norm.endsWith('.tar.gz') ||
    norm.endsWith('.tgz') ||
    norm.endsWith('.tar') ||
    norm.endsWith('.zip')
  );
}

function hasAllowedTextEntries(entries: Record<string, Uint8Array>): boolean {
  for (const rawName of Object.keys(entries)) {
    if (rawName.endsWith('/') || !entries[rawName]?.length) {
      continue;
    }
    const normalized = normalizeArchivePath(rawName);
    if (!isSafeArchiveRelativePath(normalized) || isMacOsMetadataPath(normalized)) {
      continue;
    }
    if (isAllowedTextPath(normalized)) {
      return true;
    }
  }
  return false;
}

function readTarEntryName(header: Buffer): string {
  let name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '').trim();
  const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/u, '').trim();
  if (prefix) {
    name = `${prefix}/${name}`;
  }
  return name.replace(/\\/g, '/');
}

export function extractTarEntries(
  tarBuffer: Buffer,
  warnings: string[],
  sourceArchive: string,
): Record<string, Uint8Array> {
  const result: Record<string, Uint8Array> = {};
  let offset = 0;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const typeflag = header[156];
    const name = readTarEntryName(header);
    const size = Number.parseInt(header.subarray(124, 136).toString('utf8').trim(), 8) || 0;
    offset += 512;

    const isRegularFile = typeflag === 0x30 || typeflag === 0;
    if (isRegularFile && name && size > 0) {
      const normalized = normalizeArchivePath(name);
      if (isSafeArchiveRelativePath(normalized) && !isMacOsMetadataPath(normalized)) {
        result[normalized] = new Uint8Array(tarBuffer.subarray(offset, offset + size));
      } else {
        warnings.push(`Skipped unsafe tar entry from ${sourceArchive}: ${name}`);
      }
    }

    offset += Math.ceil(size / 512) * 512;
  }

  return result;
}

function extractNestedArchiveEntries(
  archivePath: string,
  buf: Uint8Array,
  warnings: string[],
): Record<string, Uint8Array> {
  const lower = normalizeArchivePath(archivePath).toLowerCase();
  try {
    if (lower.endsWith('.zip')) {
      return unzipSync(buf);
    }
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      const tarBuffer = gunzipSync(buf);
      return extractTarEntries(tarBuffer, warnings, archivePath);
    }
    if (lower.endsWith('.tar')) {
      return extractTarEntries(Buffer.from(buf), warnings, archivePath);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(`Skipped nested archive (${archivePath}): ${msg}`);
  }
  return {};
}

/** Expand one level of nested archives when the outer layer has no readable text files. */
export function expandNestedArchives(
  entries: Record<string, Uint8Array>,
  warnings: string[],
): Record<string, Uint8Array> {
  if (hasAllowedTextEntries(entries)) {
    return entries;
  }

  const nestedArchives = Object.keys(entries)
    .filter((name) => !name.endsWith('/') && entries[name]?.length && isNestedArchivePath(name))
    .sort((a, b) => a.localeCompare(b));

  if (nestedArchives.length === 0) {
    return entries;
  }

  const expanded: Record<string, Uint8Array> = {};
  for (const archivePath of nestedArchives) {
    const buf = entries[archivePath];
    if (!buf) {
      continue;
    }
    const nestedEntries = extractNestedArchiveEntries(archivePath, buf, warnings);
    for (const [nestedPath, nestedBuf] of Object.entries(nestedEntries)) {
      if (!nestedBuf?.length || nestedPath.endsWith('/')) {
        continue;
      }
      expanded[normalizeArchivePath(nestedPath)] = nestedBuf;
    }
  }

  if (Object.keys(expanded).length === 0) {
    return entries;
  }

  warnings.push(
    `Expanded nested archive layer (${nestedArchives.join(', ')}) before scanning text files`,
  );
  return expanded;
}

function resolveArchiveEntries(zipBuffer: Buffer, warnings: string[]): Record<string, Uint8Array> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(zipBuffer));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid or corrupted ZIP: ${msg}`);
  }

  for (let depth = 0; depth < MAX_NESTED_ARCHIVE_DEPTH; depth += 1) {
    if (hasAllowedTextEntries(entries)) {
      break;
    }
    const next = expandNestedArchives(entries, warnings);
    if (next === entries || Object.keys(next).length === 0) {
      break;
    }
    entries = next;
  }

  return entries;
}

/**
 * Extract text files from a zip buffer with strict limits.
 */
export function extractSkillPackageForAudit(zipBuffer: Buffer): SkillPackageExtractResult {
  const warnings: string[] = [];
  if (zipBuffer.length > MAX_SKILL_ZIP_BYTES) {
    throw new Error(
      `ZIP exceeds maximum size (${Math.floor(MAX_SKILL_ZIP_BYTES / (1024 * 1024))} MB)`,
    );
  }

  const entries = resolveArchiveEntries(zipBuffer, warnings);

  const names = Object.keys(entries).filter((k) => !k.endsWith('/') && entries[k]?.length);
  names.sort((a, b) => a.localeCompare(b));

  let uncompressedTotal = 0;
  const files: SkillPackageTextFile[] = [];

  for (const rawName of names) {
    const normalized = normalizeArchivePath(rawName);
    if (!isSafeArchiveRelativePath(normalized)) {
      warnings.push(`Skipped unsafe path: ${rawName}`);
      continue;
    }
    if (isMacOsMetadataPath(normalized)) {
      continue;
    }
    if (!isAllowedTextPath(normalized)) {
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
    if (looksBinary(buf)) {
      warnings.push(`Skipped binary-looking file (${normalized})`);
      continue;
    }

    uncompressedTotal += buf.length;
    if (uncompressedTotal > MAX_SKILL_UNCOMPRESSED_TOTAL) {
      throw new Error(
        `Uncompressed content exceeds limit (${Math.floor(MAX_SKILL_UNCOMPRESSED_TOTAL / (1024 * 1024))} MB total)`,
      );
    }

    let text: string;
    try {
      text = strFromU8(buf, false);
    } catch {
      warnings.push(`Skipped file with invalid UTF-8 (${normalized})`);
      continue;
    }

    files.push({ relativePath: normalized, text });
    if (files.length >= MAX_SKILL_FILES) {
      warnings.push(`Stopped after ${MAX_SKILL_FILES} text files (limit reached)`);
      break;
    }
  }

  if (files.length === 0) {
    throw new Error(
      'No readable text files found in ZIP (allowed: .md, .yaml, .json, scripts, etc.)',
    );
  }

  return { files, warnings };
}

export function mergeSkillFilesForAuditPayload(files: readonly SkillPackageTextFile[]): string {
  return files
    .map((f) => [`--- path: ${f.relativePath} ---`, f.text.trimEnd()].join('\n'))
    .join('\n\n');
}
