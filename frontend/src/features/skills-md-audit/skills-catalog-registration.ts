import { inferSkillCatalogSlug, resolveUniqueSkillSlug } from './skills-audit-helpers';
import {
  listUserSkillCatalog,
  reservedSkillSlugsFromBundled,
  reservedSkillSlugsFromExtras,
  upsertUserSkillCatalogEntry,
} from './user-skill-catalog-storage';
import type { AgentModeBundledSkill } from '@/services/api/agent-mode';
import type { SkillsMdAuditData } from '@/services/api/skills-md-audit';

export function registerUserSkillAfterAudit(params: {
  apiSkills: AgentModeBundledSkill[];
  linkedSkillSlug?: string;
  zipFileName?: string;
  mdFileName?: string;
  audit: SkillsMdAuditData;
}): string {
  const description = (params.audit.summary ?? '').trim().slice(0, 500);
  const displayNameFromFile =
    (params.zipFileName && params.zipFileName.replace(/\.zip$/i, '')) ||
    (params.mdFileName && params.mdFileName.replace(/\.(md|markdown)$/i, '')) ||
    '';

  if (params.linkedSkillSlug?.trim()) {
    const slug = params.linkedSkillSlug.trim();
    upsertUserSkillCatalogEntry({
      slug,
      name: displayNameFromFile.trim() || slug,
      description,
    });
    return slug;
  }

  const proposed = inferSkillCatalogSlug({
    zipFileName: params.zipFileName,
    mdFileName: params.mdFileName,
    scannedFiles: params.audit.scannedFiles,
  });
  const reserved = new Set([
    ...reservedSkillSlugsFromBundled(params.apiSkills),
    ...reservedSkillSlugsFromExtras(),
  ]);
  const existingUser = new Set(listUserSkillCatalog().map((e) => e.slug));
  const slug = resolveUniqueSkillSlug(proposed, reserved, existingUser);
  upsertUserSkillCatalogEntry({
    slug,
    name: displayNameFromFile.trim() || slug,
    description,
  });
  return slug;
}
