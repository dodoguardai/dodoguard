/**
 * Parse SKILL.md (YAML frontmatter + Markdown body) — Claude Agent Skills style.
 */

import yaml from 'js-yaml';

export type SkillMdFrontmatter = Record<string, unknown>;

export type ParsedSkillMd = {
  frontmatter: SkillMdFrontmatter;
  body: string;
};

const NAME_MAX = 64;
const DESCRIPTION_MAX = 200;

export function parseSkillMdContent(raw: string): ParsedSkillMd {
  const trimmed = raw.replace(/^\uFEFF/, '').trimStart();
  const re = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const m = trimmed.match(re);
  if (!m) {
    return { frontmatter: {}, body: trimmed };
  }
  let frontmatter: SkillMdFrontmatter = {};
  try {
    const loaded = yaml.load(m[1]);
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
      frontmatter = loaded as SkillMdFrontmatter;
    }
  } catch {
    frontmatter = {};
  }
  return { frontmatter, body: m[2].trim() };
}

export function validateSkillFrontmatter(fm: SkillMdFrontmatter): {
  ok: boolean;
  errors: string[];
  name?: string;
  description?: string;
} {
  const errors: string[] = [];
  const name = typeof fm.name === 'string' ? fm.name.trim() : '';
  const description = typeof fm.description === 'string' ? fm.description.trim() : '';
  if (!name) {
    errors.push('SKILL.md frontmatter missing required field: name');
  } else if (name.length > NAME_MAX) {
    errors.push(`SKILL.md name exceeds ${NAME_MAX} characters`);
  }
  if (!description) {
    errors.push('SKILL.md frontmatter missing required field: description');
  } else if (description.length > DESCRIPTION_MAX) {
    errors.push(`SKILL.md description exceeds ${DESCRIPTION_MAX} characters`);
  }
  return {
    ok: errors.length === 0,
    errors,
    name: name || undefined,
    description: description || undefined,
  };
}
