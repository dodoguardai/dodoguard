/**
 * Optional plugin.yaml beside SKILL.md — extended manifest for this product.
 */

import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';

export type PluginYamlManifest = {
  id?: string;
  version?: string;
  slug?: string;
  supportedSurfaces?: string[];
  skillMdPath?: string;
  dependencies?: string;
  [key: string]: unknown;
};

export function parsePluginYamlFile(filePath: string): PluginYamlManifest | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    const loaded = yaml.load(raw);
    if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
      return {};
    }
    return loaded as PluginYamlManifest;
  } catch {
    return null;
  }
}

/** Resolve skill markdown path under package root; default SKILL.md */
export function resolveSkillMarkdownRelativePath(
  _packageRoot: string,
  manifest: PluginYamlManifest | null,
): string {
  const rel =
    manifest?.skillMdPath && typeof manifest.skillMdPath === 'string'
      ? manifest.skillMdPath.replace(/^\.\//, '')
      : 'SKILL.md';
  const normalized = path.normalize(rel);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error('skillMdPath must stay within the skill package root');
  }
  return normalized;
}
