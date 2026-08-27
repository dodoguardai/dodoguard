import type { NavCollapsible, NavItem, NavLink, SidebarBadgeKey } from './types';
import type { SidebarBadgeCounts } from './hooks/use-sidebar-badges';

function badgeFor(key: SidebarBadgeKey | undefined, counts: SidebarBadgeCounts): string | undefined {
  if (!key) return undefined;
  const n = counts[key];
  return n && n > 0 ? String(n) : undefined;
}

/** Apply runtime orange count badges onto static sidebar nav items. */
export function applySidebarBadges(
  items: NavItem[],
  counts: SidebarBadgeCounts,
): NavItem[] {
  return items.map((item) => {
    const nextBadge = badgeFor(item.badgeKey, counts) ?? item.badge;
    if ('items' in item && item.items) {
      const collapsible = item as NavCollapsible;
      return {
        ...collapsible,
        badge: nextBadge,
        items: collapsible.items.map((sub) => {
          if ('items' in sub && sub.items) {
            return {
              ...sub,
              badge: badgeFor(sub.badgeKey, counts) ?? sub.badge,
              items: sub.items.map((child) => ({
                ...child,
                badge: badgeFor(child.badgeKey, counts) ?? child.badge,
              })),
            };
          }
          return {
            ...sub,
            badge: badgeFor(sub.badgeKey, counts) ?? sub.badge,
          };
        }),
      };
    }
    return { ...(item as NavLink), badge: nextBadge };
  });
}
