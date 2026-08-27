import type { AuditHistoryItem } from '@/features/audit/types';
import { MCP_CATALOG_EXTRAS } from './mcp-catalog-extras';
import type { UserMcpCatalogEntry } from './user-mcp-catalog-storage';
import type { McpAuditData } from '@/services/api/mcp-audit';

export type UnifiedMcpRow = {
  slug: string;
  name: string;
  description: string;
  source: 'catalog-extra' | 'user-upload';
};

/** Reference-only MCP patterns shown on the audit hub (not the system of record). */
export function listReferenceMcpRows(lang: 'zh' | 'en' = 'en'): UnifiedMcpRow[] {
  return MCP_CATALOG_EXTRAS.map((extra) => ({
    slug: extra.slug,
    name: lang === 'zh' ? extra.name.zh : extra.name.en,
    description: lang === 'zh' ? extra.desc.zh : extra.desc.en,
    source: 'catalog-extra' as const,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @deprecated Prefer listReferenceMcpRows + capability registry API.
 * Kept for mcp detail pages that still resolve local/reference slugs.
 */
export function mergeMcpCatalogRows(
  lang: 'zh' | 'en' = 'en',
  userCatalog: UserMcpCatalogEntry[] = [],
): UnifiedMcpRow[] {
  const bySlug = new Map<string, UnifiedMcpRow>();
  for (const row of listReferenceMcpRows(lang)) {
    bySlug.set(row.slug, row);
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

export type McpAuditHistoryRow = AuditHistoryItem<McpAuditData> & {
  metadata?: {
    fileName?: string;
    overallRisk?: string;
    reportId?: string;
    mcpSlug?: string;
  };
};

function itemMatchesMcp(item: McpAuditHistoryRow, slug: string): boolean {
  const meta = item.metadata;
  if (meta?.mcpSlug === slug) {
    return true;
  }
  const fn = (meta?.fileName as string | undefined)?.toLowerCase() ?? '';
  if (fn && (fn.includes(`${slug}.zip`) || fn.includes(`${slug}/`) || fn.startsWith(`${slug}.`))) {
    return true;
  }
  const paths = item.result.scannedFiles?.map((p) => p.path.toLowerCase()) ?? [];
  return paths.some((p) => p.includes(`/${slug}/`) || p.startsWith(`${slug}/`));
}

export function auditsForMcpSlug(items: McpAuditHistoryRow[], slug: string): McpAuditHistoryRow[] {
  return items.filter((i) => itemMatchesMcp(i, slug));
}

export function latestAuditForMcp(
  items: McpAuditHistoryRow[],
  slug: string,
): McpAuditHistoryRow | undefined {
  const list = auditsForMcpSlug(items, slug);
  return list[0];
}
