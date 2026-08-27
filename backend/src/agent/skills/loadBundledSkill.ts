/**
 * Load a bundled skill folder (SKILL.md + optional plugin.yaml).
 */

import fs from 'node:fs';
import path from 'node:path';

import { getBundledAgentSkillsRoot } from './bundledRoot';
import { parsePluginYamlFile, resolveSkillMarkdownRelativePath } from './parsePluginYaml';
import { parseSkillMdContent, validateSkillFrontmatter } from './parseSkillMd';

export type LoadedBundledSkill = {
  slug: string;
  packageRoot: string;
  /** L1 + plugin extras for catalog */
  manifest: {
    name: string;
    description: string;
    id?: string;
    version?: string;
    slug?: string;
    supportedSurfaces?: string[];
  };
  /** L2 — markdown body only */
  instructionBody: string;
};

function mergeManifest(
  slug: string,
  fm: Record<string, unknown>,
  plugin: Record<string, unknown> | null,
): LoadedBundledSkill['manifest'] {
  const skillName = typeof fm.name === 'string' ? fm.name.trim() : '';
  const skillDesc = typeof fm.description === 'string' ? fm.description.trim() : '';
  const base: LoadedBundledSkill['manifest'] = {
    name: skillName,
    description: skillDesc,
    slug,
  };
  if (!plugin) {
    return base;
  }
  const id = typeof plugin.id === 'string' ? plugin.id : undefined;
  const version = typeof plugin.version === 'string' ? plugin.version : undefined;
  const pSlug = typeof plugin.slug === 'string' ? plugin.slug : undefined;
  const supportedSurfaces = Array.isArray(plugin.supportedSurfaces)
    ? plugin.supportedSurfaces.filter((x): x is string => typeof x === 'string')
    : undefined;
  return {
    ...base,
    ...(id ? { id } : {}),
    ...(version ? { version } : {}),
    ...(pSlug ? { slug: pSlug } : {}),
    ...(supportedSurfaces?.length ? { supportedSurfaces } : {}),
    // SKILL.md wins for name/description (already from fm)
    name: skillName,
    description: skillDesc,
  };
}

export function loadBundledSkill(slug: string): LoadedBundledSkill | null {
  const root = getBundledAgentSkillsRoot();
  const packageRoot = path.join(root, slug);
  if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) {
    return null;
  }
  const pluginPath = path.join(packageRoot, 'plugin.yaml');
  const plugin = parsePluginYamlFile(pluginPath);

  let mdRelative = 'SKILL.md';
  try {
    mdRelative = resolveSkillMarkdownRelativePath(packageRoot, plugin);
  } catch {
    return null;
  }
  const mdPath = path.join(packageRoot, mdRelative);
  if (!mdPath.startsWith(packageRoot)) {
    return null;
  }
  if (!fs.existsSync(mdPath)) {
    return null;
  }
  const rawMd = fs.readFileSync(mdPath, 'utf-8');
  const parsed = parseSkillMdContent(rawMd);
  const validation = validateSkillFrontmatter(parsed.frontmatter);
  if (!validation.ok || !validation.name || !validation.description) {
    return null;
  }

  const manifest = mergeManifest(slug, parsed.frontmatter, plugin);

  return {
    slug,
    packageRoot,
    manifest,
    instructionBody: parsed.body,
  };
}

export function buildBundledSkillsSystemInjection(
  coreSlug: string,
  extraSlug?: string | null,
): string {
  const core = loadBundledSkill(coreSlug);
  if (!core) {
    return '';
  }
  const parts: string[] = [
    `### Skill: ${core.manifest.name} (${core.slug})\n${core.instructionBody}`,
  ];
  if (extraSlug && extraSlug !== coreSlug) {
    const extra = loadBundledSkill(extraSlug);
    if (extra) {
      parts.push(`### Skill: ${extra.manifest.name} (${extra.slug})\n${extra.instructionBody}`);
    }
  }
  return parts.join('\n\n---\n\n');
}
