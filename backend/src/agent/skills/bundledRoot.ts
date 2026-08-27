/**
 * Resolve directory containing built-in Claude-style skill folders (each with SKILL.md).
 */

import fs from 'node:fs';
import path from 'node:path';

export function getBundledAgentSkillsRoot(): string {
  const primary = path.join(__dirname, '..', '..', 'agent-skills', 'bundled');
  if (fs.existsSync(primary)) {
    return primary;
  }
  const cwdFallback = path.join(process.cwd(), 'backend', 'src', 'agent-skills', 'bundled');
  if (fs.existsSync(cwdFallback)) {
    return cwdFallback;
  }
  const distFallback = path.join(process.cwd(), 'dist', 'src', 'agent-skills', 'bundled');
  return distFallback;
}

export function listBundledSkillSlugs(): string[] {
  const root = getBundledAgentSkillsRoot();
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}
