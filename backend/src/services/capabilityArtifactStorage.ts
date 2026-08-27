/**
 * Persist capability component ZIP packages under DODOGUARD_CONFIG_DIR.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { strFromU8, unzipSync } from 'fflate';

import { getConfigDirectoryPath } from '../util/config/manage';
import { isSafeArchiveRelativePath, MAX_SKILL_ZIP_BYTES } from './skillPackageExtract';

export type CapabilityFileTreeNode = {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
  kind?: 'markdown' | 'json' | 'script' | 'text' | 'binary' | 'other';
};

export type CapabilityPackageParseResult = {
  contentHash: string;
  fileSize: number;
  fileTree: CapabilityFileTreeNode[];
  skillMdExcerpt: string | null;
  inferredName: string | null;
  inferredKey: string | null;
  inferredVersion: string | null;
  inferredDescription: string | null;
};

type SkillPackageMetadata = {
  name?: string;
  title?: string;
  displayName?: string;
  slug?: string;
  id?: string;
  key?: string;
  componentKey?: string;
  version?: string;
  ver?: string;
  description?: string;
  desc?: string;
};

function kindForPath(relativePath: string): CapabilityFileTreeNode['kind'] {
  const lower = relativePath.toLowerCase();
  if (/\.md$/i.test(lower)) {
    return 'markdown';
  }
  if (/\.json$/i.test(lower)) {
    return 'json';
  }
  if (/\.(sh|bash|ps1|py|ts|js)$/i.test(lower)) {
    return 'script';
  }
  if (/\.(txt|ya?ml|toml|xml|html|css)$/i.test(lower)) {
    return 'text';
  }
  return 'other';
}

function readJsonMetadata(data: Uint8Array): SkillPackageMetadata | null {
  try {
    const json = JSON.parse(strFromU8(data));
    return json && typeof json === 'object' ? (json as SkillPackageMetadata) : null;
  } catch {
    return null;
  }
}

function readSkillFrontmatter(text: string): SkillPackageMetadata | null {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match?.[1]) {
    return null;
  }
  const meta: SkillPackageMetadata = {};
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
    if (!pair?.[1]) {
      continue;
    }
    const key = pair[1];
    const value = (pair[2] || '').replace(/^['"]|['"]$/g, '').trim();
    if (value) {
      (meta as Record<string, string>)[key] = value;
    }
  }
  return Object.keys(meta).length > 0 ? meta : null;
}

function applyInferredMetadata(
  meta: SkillPackageMetadata | null,
  current: {
    inferredName: string | null;
    inferredKey: string | null;
    inferredVersion: string | null;
    inferredDescription: string | null;
  },
): void {
  if (!meta) {
    return;
  }
  current.inferredName =
    current.inferredName ||
    String(meta.name || meta.title || meta.displayName || '').trim() ||
    null;
  current.inferredKey =
    current.inferredKey ||
    String(meta.slug || meta.id || meta.key || meta.componentKey || meta.name || '').trim() ||
    null;
  current.inferredVersion =
    current.inferredVersion || String(meta.version || meta.ver || '').trim() || null;
  current.inferredDescription =
    current.inferredDescription || String(meta.description || meta.desc || '').trim() || null;
}

export function getCapabilityArtifactsRoot(): string {
  return path.join(getConfigDirectoryPath(), 'capability-artifacts');
}

export function buildCapabilityArtifactStoragePath(
  organizationId: string,
  registryId: string,
  contentHash: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'package.zip';
  return path.join(
    getCapabilityArtifactsRoot(),
    organizationId,
    registryId,
    `${contentHash.slice(0, 16)}_${safeName}`,
  );
}

export function parseCapabilityZipBuffer(
  buffer: Buffer,
  originalFileName: string,
): CapabilityPackageParseResult {
  if (buffer.byteLength > MAX_SKILL_ZIP_BYTES) {
    throw new Error(`ZIP exceeds max size ${MAX_SKILL_ZIP_BYTES} bytes`);
  }
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const entries = unzipSync(new Uint8Array(buffer));
  const fileTree: CapabilityFileTreeNode[] = [];
  let skillMdExcerpt: string | null = null;
  let inferredName: string | null = null;
  let inferredKey: string | null = null;
  let inferredVersion: string | null = null;
  let inferredDescription: string | null = null;
  const inferred = {
    inferredName,
    inferredKey,
    inferredVersion,
    inferredDescription,
  };

  const names = Object.keys(entries).sort((a, b) => a.localeCompare(b));
  for (const rawName of names) {
    const relativePath = rawName.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!relativePath || relativePath.endsWith('/')) {
      const dirPath = relativePath.replace(/\/$/, '');
      if (dirPath && isSafeArchiveRelativePath(dirPath)) {
        fileTree.push({
          path: dirPath,
          name: dirPath.split('/').pop() || dirPath,
          isDir: true,
        });
      }
      continue;
    }
    if (!isSafeArchiveRelativePath(relativePath)) {
      continue;
    }
    const data = entries[rawName];
    const size = data?.byteLength ?? 0;
    fileTree.push({
      path: relativePath,
      name: relativePath.split('/').pop() || relativePath,
      isDir: false,
      size,
      kind: kindForPath(relativePath),
    });

    const base = relativePath.split('/').pop()?.toLowerCase() || '';
    if (
      (base === 'skill.md' ||
        base === 'skills.md' ||
        base === 'readme.md' ||
        base === 'server.md' ||
        base === 'mcp.md') &&
      data
    ) {
      try {
        const text = strFromU8(data).slice(0, 8000);
        applyInferredMetadata(readSkillFrontmatter(text), inferred);
        inferredName = inferred.inferredName;
        inferredKey = inferred.inferredKey;
        inferredVersion = inferred.inferredVersion;
        inferredDescription = inferred.inferredDescription;
        const preferred =
          base === 'skill.md' || base === 'skills.md' || base === 'server.md' || base === 'mcp.md';
        if (!skillMdExcerpt || preferred) {
          skillMdExcerpt = text;
        }
        if (!inferredName) {
          const titleMatch = text.match(/^#\s+(.+)$/m);
          if (titleMatch?.[1]) {
            inferredName = titleMatch[1].trim().slice(0, 200);
          }
        }
        if (!inferredDescription) {
          const para = text
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line && !line.startsWith('#'));
          if (para) {
            inferredDescription = para.slice(0, 500);
          }
        }
      } catch {
        // ignore binary decode issues
      }
    }

    if (
      base === '_meta.json' ||
      base === 'meta.json' ||
      base === 'manifest.json' ||
      base === 'package.json' ||
      base === 'skill.json' ||
      base === 'mcp.json' ||
      base === 'server.json'
    ) {
      try {
        applyInferredMetadata(readJsonMetadata(data), inferred);
        inferredName = inferred.inferredName;
        inferredKey = inferred.inferredKey;
        inferredVersion = inferred.inferredVersion;
        inferredDescription = inferred.inferredDescription;
        if (!skillMdExcerpt && data) {
          skillMdExcerpt = strFromU8(data).slice(0, 8000);
        }
      } catch {
        // ignore
      }
    }
  }

  if (!inferredName) {
    inferredName = originalFileName.replace(/\.zip$/i, '').slice(0, 200) || null;
  }

  return {
    contentHash,
    fileSize: buffer.byteLength,
    fileTree,
    skillMdExcerpt,
    inferredName,
    inferredKey,
    inferredVersion,
    inferredDescription,
  };
}

export function writeCapabilityArtifactFile(storagePath: string, buffer: Buffer): void {
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  fs.writeFileSync(storagePath, buffer);
}

export function readCapabilityArtifactFile(storagePath: string): Buffer {
  return fs.readFileSync(storagePath);
}

export function readCapabilityArtifactTextFile(
  storagePath: string,
  relativePath: string,
): { path: string; text: string; kind: CapabilityFileTreeNode['kind'] } {
  const buffer = readCapabilityArtifactFile(storagePath);
  const entries = unzipSync(new Uint8Array(buffer));
  const matchKey = Object.keys(entries).find(
    (name) => name.replace(/\\/g, '/').replace(/^\.\//, '') === relativePath.replace(/\\/g, '/'),
  );
  if (!matchKey) {
    throw new Error(`File not found in package: ${relativePath}`);
  }
  const data = entries[matchKey];
  return {
    path: relativePath,
    text: strFromU8(data).slice(0, 200_000),
    kind: kindForPath(relativePath),
  };
}
