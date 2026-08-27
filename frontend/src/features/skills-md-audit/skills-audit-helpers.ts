import { AGENT_SKILL_CATALOG_EXTRAS } from '@/features/agent-skills/catalog-extras';
import type { AuditHistoryItem } from '@/features/audit/types';
import type { AgentModeBundledSkill } from '@/services/api/agent-mode';
import type { SkillsMdAuditData } from '@/services/api/skills-md-audit';
import type { Report } from '@/types/entities';

import type { UserSkillCatalogEntry } from './user-skill-catalog-storage';

export type UnifiedSkillRow = {
  slug: string;
  name: string;
  description: string;
  source: 'bundled' | 'catalog-extra' | 'user-upload';
};

function slugifySegment(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'skill';
}

/** Proposed catalog slug from upload / scan paths (not uniqueness-checked). */
export function inferSkillCatalogSlug(params: {
  linkedSkillSlug?: string;
  zipFileName?: string;
  mdFileName?: string;
  scannedFiles?: { path: string }[];
}): string {
  if (params.linkedSkillSlug?.trim()) {
    return slugifySegment(params.linkedSkillSlug.trim());
  }
  if (params.zipFileName) {
    const base = params.zipFileName.replace(/\.zip$/i, '').trim();
    if (base) {
      return slugifySegment(base);
    }
  }
  if (params.mdFileName) {
    const base = params.mdFileName.replace(/\.(md|markdown)$/i, '').trim();
    if (base) {
      return slugifySegment(base);
    }
  }
  const paths = params.scannedFiles?.map((f) => f.path) ?? [];
  for (const p of paths) {
    const first = p.split('/')[0]?.trim() ?? '';
    if (first && !/^skill\.md$/i.test(first)) {
      return slugifySegment(first.replace(/\.zip$/i, ''));
    }
  }
  for (const p of paths) {
    const lower = p.toLowerCase();
    if (lower.endsWith('/skill.md') || lower === 'skill.md') {
      const folder = lower.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
      const root = folder.split('/')[0]?.trim();
      if (root) {
        return slugifySegment(root);
      }
    }
  }
  return `local-skill-${Date.now()}`;
}

/** Ensure slug does not collide with bundled, catalog extras, or other reserved slugs. */
export function resolveUniqueSkillSlug(
  proposed: string,
  reserved: Set<string>,
  existingUserSlugs: Set<string>,
): string {
  let candidate = proposed;
  let n = 0;
  while (reserved.has(candidate) || existingUserSlugs.has(candidate)) {
    n += 1;
    candidate = `${proposed}-local${n > 1 ? `-${n}` : ''}`;
  }
  return candidate;
}

export function mergeBundledAndExtras(
  apiSkills: AgentModeBundledSkill[],
  lang: 'zh' | 'en' = 'en',
  userCatalog: UserSkillCatalogEntry[] = [],
): UnifiedSkillRow[] {
  const bySlug = new Map<string, UnifiedSkillRow>();
  for (const s of apiSkills) {
    const slug = s.slug || s.manifest?.slug || s.manifest?.id || '';
    if (!slug) {
      continue;
    }
    bySlug.set(slug, {
      slug,
      name: s.manifest?.name?.trim() || slug,
      description: s.manifest?.description?.trim() || '',
      source: 'bundled',
    });
  }
  for (const extra of AGENT_SKILL_CATALOG_EXTRAS) {
    if (bySlug.has(extra.slug)) {
      continue;
    }
    bySlug.set(extra.slug, {
      slug: extra.slug,
      name: extra.slug,
      description: lang === 'zh' ? extra.desc.zh : extra.desc.en,
      source: 'catalog-extra',
    });
  }
  const seenUser = new Set<string>();
  for (const u of userCatalog) {
    if (!u.slug || bySlug.has(u.slug)) {
      continue;
    }
    if (seenUser.has(u.slug)) {
      continue;
    }
    seenUser.add(u.slug);
    bySlug.set(u.slug, {
      slug: u.slug,
      name: u.name.trim() || u.slug,
      description: u.description,
      source: 'user-upload',
    });
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type SkillsAuditHistoryRow = AuditHistoryItem<SkillsMdAuditData> & {
  metadata?: {
    fileName?: string;
    overallRisk?: string;
    reportId?: string;
    skillSlug?: string;
  };
};

function parseReportMetadata(metadata: Report['metadata']): Record<string, unknown> {
  if (!metadata) {
    return {};
  }
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return metadata as Record<string, unknown>;
}

export function reportToSkillsAuditHistoryRow(report: Report): SkillsAuditHistoryRow | null {
  if (report.reportType !== 'skills_md_audit') {
    return null;
  }
  const meta = parseReportMetadata(report.metadata);
  const auditData = meta.auditData as SkillsMdAuditData | undefined;
  if (!auditData) {
    return null;
  }
  return {
    id: report.id,
    type: 'skills-md',
    result: auditData,
    metadata: {
      fileName: (meta.fileName as string | undefined) ?? report.title ?? undefined,
      overallRisk: (meta.overallRisk as string | undefined) ?? auditData.overallRisk,
      reportId: report.id,
    },
    createdAt: report.createdAt,
  };
}

export function mergeSkillsAuditHistoryRows(
  localItems: SkillsAuditHistoryRow[],
  serverItems: SkillsAuditHistoryRow[],
): SkillsAuditHistoryRow[] {
  const seenReportIds = new Set<string>();
  const merged: SkillsAuditHistoryRow[] = [];

  for (const item of localItems) {
    const reportId = item.metadata?.reportId;
    if (reportId) {
      seenReportIds.add(reportId);
    }
    merged.push(item);
  }

  for (const item of serverItems) {
    const reportId = item.metadata?.reportId ?? item.id;
    if (seenReportIds.has(reportId)) {
      continue;
    }
    merged.push(item);
  }

  return merged.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function itemMatchesSkill(item: SkillsAuditHistoryRow, slug: string): boolean {
  const meta = item.metadata;
  if (meta?.skillSlug === slug) {
    return true;
  }
  const fn = (meta?.fileName as string | undefined)?.toLowerCase() ?? '';
  if (fn && (fn.includes(`${slug}.zip`) || fn.includes(`${slug}/`) || fn.startsWith(`${slug}.`))) {
    return true;
  }
  const paths = item.result.scannedFiles?.map((p) => p.path.toLowerCase()) ?? [];
  return paths.some((p) => p.includes(`/${slug}/`) || p.startsWith(`${slug}/`));
}

export function auditsForSkillSlug(
  items: SkillsAuditHistoryRow[],
  slug: string,
): SkillsAuditHistoryRow[] {
  return items.filter((i) => itemMatchesSkill(i, slug));
}

export function latestAuditForSkill(
  items: SkillsAuditHistoryRow[],
  slug: string,
): SkillsAuditHistoryRow | undefined {
  const list = auditsForSkillSlug(items, slug);
  return list[0];
}
