import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'mcp-audit:user-catalog-v1';

export const USER_MCP_CATALOG_CHANGED = 'mcp-audit-user-catalog-changed';

export type UserMcpCatalogEntry = {
  slug: string;
  name: string;
  description: string;
  updatedAt: number;
};

const EMPTY_CATALOG: UserMcpCatalogEntry[] = [];

let catalogSnapshotCache: { storageKey: string; entries: UserMcpCatalogEntry[] } = {
  storageKey: '',
  entries: EMPTY_CATALOG,
};

function safeParse(raw: string | null): UserMcpCatalogEntry[] {
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
      .filter((x): x is UserMcpCatalogEntry => x !== null);
  } catch {
    return [];
  }
}

function getUserMcpCatalogSnapshot(): UserMcpCatalogEntry[] {
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

export function listUserMcpCatalog(): UserMcpCatalogEntry[] {
  return getUserMcpCatalogSnapshot();
}

function writeAll(entries: UserMcpCatalogEntry[]) {
  if (typeof window === 'undefined') {
    return;
  }
  const serialized = JSON.stringify(entries);
  window.localStorage.setItem(STORAGE_KEY, serialized);
  const nextEntries = entries.length === 0 ? EMPTY_CATALOG : entries.map((e) => ({ ...e }));
  catalogSnapshotCache = { storageKey: serialized, entries: nextEntries };
  window.dispatchEvent(new Event(USER_MCP_CATALOG_CHANGED));
}

export function upsertUserMcpCatalogEntry(entry: Omit<UserMcpCatalogEntry, 'updatedAt'>) {
  const now = Date.now();
  const list = [...listUserMcpCatalog()];
  const idx = list.findIndex((e) => e.slug === entry.slug);
  const next: UserMcpCatalogEntry = {
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

function subscribeUserCatalog(cb: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener(USER_MCP_CATALOG_CHANGED, cb);
  return () => window.removeEventListener(USER_MCP_CATALOG_CHANGED, cb);
}

export function useUserMcpCatalog(): UserMcpCatalogEntry[] {
  return useSyncExternalStore(
    subscribeUserCatalog,
    getUserMcpCatalogSnapshot,
    () => EMPTY_CATALOG,
  );
}
