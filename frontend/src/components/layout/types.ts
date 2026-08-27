import { type LinkProps } from '@tanstack/react-router';

/** Keys resolved by `useSidebarBadges` to orange count chips (prototype-style). */
type SidebarBadgeKey = 'assets' | 'detection' | 'risk' | 'launch' | 'reports' | 'todos';

type BaseNavItem = {
  title: string;
  badge?: string;
  /** When set, runtime count from `useSidebarBadges` overrides static `badge`. */
  badgeKey?: SidebarBadgeKey;
  icon?: React.ElementType;
  /** Optional: user must have this permission (e.g. "dashboard:read") to see the item */
  permission?: string;
};

type NavSubLink = BaseNavItem & {
  url: LinkProps['to'] | (string & {});
  search?: Record<string, unknown>;
  items?: never;
};

type NavSubCollapsible = BaseNavItem & {
  items: NavSubLink[];
  url?: never;
};

type NavSubItem = NavSubLink | NavSubCollapsible;

type NavLink = BaseNavItem & {
  url: LinkProps['to'] | (string & {});
  search?: Record<string, unknown>;
  items?: never;
};

type NavCollapsible = BaseNavItem & {
  items: NavSubItem[];
  url?: never;
};

type NavItem = NavCollapsible | NavLink;

type NavGroup = {
  title: string;
  items: NavItem[];
};

type SidebarData = {
  navGroups: NavGroup[];
};

export type {
  SidebarData,
  NavGroup,
  NavItem,
  NavCollapsible,
  NavLink,
  NavSubItem,
  NavSubLink,
  NavSubCollapsible,
  SidebarBadgeKey,
};
