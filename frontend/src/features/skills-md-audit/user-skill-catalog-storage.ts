import { useSyncExternalStore } from 'react';

import { AGENT_SKILL_CATALOG_EXTRAS } from '@/features/agent-skills/catalog-extras';
import type { AgentModeBundledSkill } from '@/services/api/agent-mode';

const STORAGE_KEY = 'skills-md-audit:user-catalog-v1';

export const USER_SKILL_CATALOG_CHANGED = 'skills-md-user-catalog-changed';

export type UserSkillCatalogEntry = {
  slug: string;
  name: string;
  description: string;
  updatedAt: number;
};

/** Stable empty snapshot for `useSyncExternalStore` + SSR. */
const EMPTY_CATALOG: UserSkillCatalogEntry[] = [];

let catalogSnapshotCache: { storageKey: string; entries: UserSkillCatalogEntry[] } = {
  storageKey: '',
  entries: EMPTY_CATALOG,
};

function safeParse(raw: string | null): UserSkillCatalogEntry[] {
  if (!raw) {
    return [];
  }
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) {
      return [];
    }
    return v
      .map((row) => {
        if (!row || typeof row !== 'object') {
          return null;
        }
        const o = row as Record<string, unknown>;
        const slug = typeof o.slug === 'string' ? o.slug.trim() : '';
        const name = typeof o.name === 'string' ? o.name.trim() : '';
        const description = typeof o.description === 'string' ? o.description : '';
        const updatedAt = typeof o.updatedAt === 'number' ? o.updatedAt : 0;
        if (!slug) {
          return null;
        }
        return { slug, name: name || slug, description, updatedAt };
      })
      .filter((x): x is UserSkillCatalogEntry => x !== null);
  } catch {
    return [];
  }
}

/**
 * Reads the catalog from localStorage with a **stable array reference** when storage
 * is unchanged. Required for `useSyncExternalStore` — a fresh `[]` every call causes
 * infinite re-renders.
 */
function getUserSkillCatalogSnapshot(): UserSkillCatalogEntry[] {
  if (typeof window === 'undefined') {
    return EMPTY_CATALOG;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const storageKey = raw ?? '[]';
  if (catalogSnapshotCache.storageKey === storageKey) {
    return catalogSnapshotCache.entries;
  }
  const parsed = safeParse(raw);
  const entries = parsed.length === 0 ? EMPTY_CATALOG : parsed;
  catalogSnapshotCache = { storageKey, entries };
  return entries;
}

export function listUserSkillCatalog(): UserSkillCatalogEntry[] {
  return getUserSkillCatalogSnapshot();
}

function writeAll(entries: UserSkillCatalogEntry[]) {
  if (typeof window === 'undefined') {
    return;
  }
  const serialized = JSON.stringify(entries);
  window.localStorage.setItem(STORAGE_KEY, serialized);
  const nextEntries = entries.length === 0 ? EMPTY_CATALOG : entries.map((e) => ({ ...e }));
  catalogSnapshotCache = { storageKey: serialized, entries: nextEntries };
  window.dispatchEvent(new Event(USER_SKILL_CATALOG_CHANGED));
}

export function upsertUserSkillCatalogEntry(entry: Omit<UserSkillCatalogEntry, 'updatedAt'>) {
  const now = Date.now();
  const list = [...listUserSkillCatalog()];
  const idx = list.findIndex((e) => e.slug === entry.slug);
  const next: UserSkillCatalogEntry = {
    slug: entry.slug,
    name: entry.name.trim() || entry.slug,
    description: entry.description,
    updatedAt: now,
  };
  if (idx >= 0) {
    list[idx] = next;
  } else {
    list.push(next);
  }
  writeAll(list);
}

export function reservedSkillSlugsFromExtras(): Set<string> {
  return new Set(AGENT_SKILL_CATALOG_EXTRAS.map((e) => e.slug));
}

export function reservedSkillSlugsFromBundled(apiSkills: AgentModeBundledSkill[]): Set<string> {
  const s = new Set<string>();
  for (const row of apiSkills) {
    const slug = row.slug || row.manifest?.slug || row.manifest?.id || '';
    if (slug) {
      s.add(slug);
    }
  }
  return s;
}

function subscribeUserCatalog(cb: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener(USER_SKILL_CATALOG_CHANGED, cb);
  return () => window.removeEventListener(USER_SKILL_CATALOG_CHANGED, cb);
}

/** Re-reads local user catalog when entries are added or updated (e.g. after an audit run). */
export function useUserSkillCatalog(): UserSkillCatalogEntry[] {
  return useSyncExternalStore(
    subscribeUserCatalog,
    getUserSkillCatalogSnapshot,
    () => EMPTY_CATALOG,
  );
}
