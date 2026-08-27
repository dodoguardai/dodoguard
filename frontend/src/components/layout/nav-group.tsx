import { type ReactNode } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  type NavCollapsible,
  type NavItem,
  type NavLink,
  type NavSubCollapsible,
  type NavSubItem,
  type NavSubLink,
  type NavGroup as NavGroupProps,
} from './types';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '../ui/skeleton';

function parsePermission(permission: string): { resource: string; action: string } {
  const [resource = '', action = ''] = permission.split(':');
  return { resource, action };
}

function canShowNavItem(
  item: NavItem | (BaseNavItem & { url: string }),
  hasPermission: (resource: string, action: string) => boolean,
): boolean {
  const perm = 'permission' in item ? item.permission : undefined;
  if (!perm) return true;
  const { resource, action } = parsePermission(perm);
  return hasPermission(resource, action);
}

type BaseNavItem = { permission?: string; title: string; [k: string]: unknown };

function routeSearch(search?: Record<string, unknown>) {
  return search as any;
}

const sidebarLinkActiveOptions = { exact: true, includeSearch: false };

export function NavGroup({ title, items }: NavGroupProps) {
  const { state, isMobile } = useSidebar();
  const href = useLocation({ select: (location) => location.href });
  const { hasPermission, isLoading } = usePermissions();
  const { t, i18n } = useTranslation();

  const tr = (keyOrText: string) => {
    return i18n.exists(keyOrText) ? t(keyOrText) : keyOrText;
  };

  const filteredItems = isLoading
    ? []
    : items.filter((item) => canShowNavItem(item, hasPermission));

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{tr(title)}</SidebarGroupLabel>
        <SidebarMenu>
          {[1, 2, 3].map((i) => (
            <SidebarMenuItem key={i}>
              <Skeleton className="h-8 w-full" />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  if (filteredItems.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{tr(title)}</SidebarGroupLabel>
      <SidebarMenu>
        {filteredItems.map((item) => {
          const key = `${item.title}-${'url' in item ? item.url : 'collapsible'}`;

          if (!item.items) return <SidebarMenuLink key={key} item={item} href={href} />;

          const visibleSubItems = item.items.filter((sub) => canShowNavItem(sub, hasPermission));
          if (visibleSubItems.length === 0) return null;

          const itemWithFilteredSubs = { ...item, items: visibleSubItems };

          if (state === 'collapsed' && !isMobile)
            return (
              <SidebarMenuCollapsedDropdown key={key} item={itemWithFilteredSubs} href={href} />
            );

          return <SidebarMenuCollapsible key={key} item={itemWithFilteredSubs} href={href} />;
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavBadge({ children }: { children: ReactNode }) {
  return (
    <Badge
      variant="secondary"
      className="ms-auto h-4 min-w-4 shrink-0 rounded-full border-0 bg-amber-100 px-[7px] py-0 text-[10px] font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400"
    >
      {children}
    </Badge>
  );
}

function SidebarMenuLink({ item, href }: { item: NavLink; href: string }) {
  const { setOpenMobile } = useSidebar();
  const { t, i18n } = useTranslation();
  const tr = (keyOrText: string) => (i18n.exists(keyOrText) ? t(keyOrText) : keyOrText);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={checkIsActive(href, item)}
        tooltip={tr(item.title)}
      >
        <Link
          to={item.url}
          preload={false}
          activeOptions={sidebarLinkActiveOptions}
          onClick={() => setOpenMobile(false)}
        >
          {item.icon && <item.icon />}
          <span>{tr(item.title)}</span>
          {item.badge && <NavBadge>{item.badge}</NavBadge>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarMenuCollapsible({ item, href }: { item: NavCollapsible; href: string }) {
  const { t, i18n } = useTranslation();
  const tr = (keyOrText: string) => (i18n.exists(keyOrText) ? t(keyOrText) : keyOrText);

  return (
    <Collapsible
      asChild
      defaultOpen={checkIsActive(href, item, true)}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={tr(item.title)}>
            {item.icon && <item.icon />}
            <span>{tr(item.title)}</span>
            {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
            <ChevronRight
              className={
                item.badge
                  ? 'transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180'
                  : 'ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180'
              }
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="CollapsibleContent">
          <SidebarMenuSub>
            {item.items.map((subItem) => (
              <SidebarMenuSubEntry key={subItem.title} subItem={subItem} href={href} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function SidebarMenuCollapsedDropdown({ item, href }: { item: NavCollapsible; href: string }) {
  const { t, i18n } = useTranslation();
  const tr = (keyOrText: string) => (i18n.exists(keyOrText) ? t(keyOrText) : keyOrText);

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton tooltip={tr(item.title)} isActive={checkIsActive(href, item)}>
            {item.icon && <item.icon />}
            <span>{tr(item.title)}</span>
            {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
            <ChevronRight
              className={
                item.badge
                  ? 'transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90'
                  : 'ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90'
              }
            />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={4}>
          <DropdownMenuLabel>
            {tr(item.title)} {item.badge ? `(${item.badge})` : ''}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.items.flatMap((sub) => {
            if ('items' in sub && sub.items) {
              return [
                <DropdownMenuLabel key={`${sub.title}-label`} className="text-xs text-muted-foreground">
                  {tr(sub.title)}
                </DropdownMenuLabel>,
                ...sub.items.map((child) => (
                  <DropdownMenuItem key={`${sub.title}-${child.title}`} asChild>
                    <Link
                      to={child.url}
                      search={routeSearch(child.search)}
                      preload={false}
                      activeOptions={sidebarLinkActiveOptions}
                      className={`${isSubItemActive(href, child) ? 'bg-secondary' : ''}`}
                    >
                      <span className="max-w-52 text-wrap">{tr(child.title)}</span>
                    </Link>
                  </DropdownMenuItem>
                )),
              ];
            }
            const linkSub = sub as NavSubLink;
            return (
              <DropdownMenuItem key={`${linkSub.title}-${linkSub.url}`} asChild>
                <Link
                  to={linkSub.url}
                  search={routeSearch(linkSub.search)}
                  preload={false}
                  activeOptions={sidebarLinkActiveOptions}
                  className={`${isSubItemActive(href, linkSub) ? 'bg-secondary' : ''}`}
                >
                  {linkSub.icon && <linkSub.icon />}
                  <span className="max-w-52 text-wrap">{tr(linkSub.title)}</span>
                  {linkSub.badge && <span className="ms-auto text-xs">{linkSub.badge}</span>}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function SidebarMenuSubEntry({ subItem, href }: { subItem: NavSubItem; href: string }) {
  const { setOpenMobile } = useSidebar();
  const { t, i18n } = useTranslation();
  const tr = (keyOrText: string) => (i18n.exists(keyOrText) ? t(keyOrText) : keyOrText);

  if ('items' in subItem && subItem.items) {
    return <SidebarMenuSubCollapsible subItem={subItem} href={href} tr={tr} />;
  }

  const linkItem = subItem as NavSubLink;
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={isSubItemActive(href, linkItem)}>
        <Link
          to={linkItem.url}
          search={routeSearch(linkItem.search)}
          preload={false}
          activeOptions={sidebarLinkActiveOptions}
          onClick={() => setOpenMobile(false)}
        >
          {linkItem.icon && <linkItem.icon />}
          <span>{tr(linkItem.title)}</span>
          {linkItem.badge && <NavBadge>{linkItem.badge}</NavBadge>}
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function SidebarMenuSubCollapsible({
  subItem,
  href,
  tr,
}: {
  subItem: NavSubCollapsible;
  href: string;
  tr: (key: string) => string;
}) {
  const { setOpenMobile } = useSidebar();

  return (
    <Collapsible
      asChild
      defaultOpen={subItem.items.some((child) => isSubItemActive(href, child))}
      className="group/subcollapsible"
    >
      <SidebarMenuSubItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuSubButton className="cursor-pointer">
            {subItem.icon && <subItem.icon />}
            <span>{tr(subItem.title)}</span>
            <ChevronRight className="ms-auto size-3.5 transition-transform duration-200 group-data-[state=open]/subcollapsible:rotate-90" />
          </SidebarMenuSubButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="ms-2 border-l border-sidebar-border pl-2">
            {subItem.items.map((child) => (
              <SidebarMenuSubItem key={child.title}>
                <SidebarMenuSubButton asChild isActive={isSubItemActive(href, child)}>
                  <Link
                    to={child.url}
                    search={routeSearch(child.search)}
                    preload={false}
                    activeOptions={sidebarLinkActiveOptions}
                    onClick={() => setOpenMobile(false)}
                  >
                    <span>{tr(child.title)}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuSubItem>
    </Collapsible>
  );
}

function assetLedgerNavActive(
  href: string,
  itemUrl: string,
  search?: Record<string, unknown>,
): boolean | null {
  const cur = parseLocationHref(href);
  const tgt = parseLocationHref(itemUrl);
  if (tgt.pathname !== '/assets/ledger') {
    return null;
  }
  if (!cur.pathname.startsWith('/assets/ledger')) {
    return null;
  }
  if (!search || search.tab === undefined) {
    return true;
  }
  const curTab = cur.searchParams.get('tab') ?? 'ledger';
  const tgtTab = typeof search.tab === 'string' ? search.tab : 'ledger';
  return curTab === tgtTab;
}

function dynamicProbeNavActive(
  href: string,
  itemUrl: string,
  search?: Record<string, unknown>,
): boolean | null {
  const cur = parseLocationHref(href);
  const tgt = parseLocationHref(itemUrl);
  if (tgt.pathname !== '/expert-toolbox/dynamic-probe') {
    return null;
  }
  if (cur.pathname !== '/expert-toolbox/dynamic-probe') {
    return null;
  }
  if (!search || search.mode === undefined) {
    return true;
  }
  const curMode = cur.searchParams.get('mode') ?? 'list';
  const tgtMode = typeof search.mode === 'string' ? search.mode : 'list';
  // Result view belongs under Dynamic probe; treat as matching the toolbox entry.
  if (curMode === 'result') {
    return true;
  }
  return curMode === tgtMode;
}

function platformConfigNavActive(
  href: string,
  itemUrl: string,
  search?: Record<string, unknown>,
): boolean | null {
  const cur = parseLocationHref(href);
  const tgt = parseLocationHref(itemUrl);
  if (tgt.pathname !== '/expert-toolbox/platform-config-audit') {
    return null;
  }
  if (cur.pathname !== '/expert-toolbox/platform-config-audit') {
    return null;
  }
  if (!search || search.platform === undefined) {
    return true;
  }
  const curPlatform = cur.searchParams.get('platform') ?? 'dify';
  const tgtPlatform = typeof search.platform === 'string' ? search.platform : 'dify';
  return curPlatform === tgtPlatform;
}

function isSubItemActive(href: string, item: NavSubLink): boolean {
  if (typeof item.url !== 'string') {
    return false;
  }
  const assetLedgerActive = assetLedgerNavActive(href, item.url, item.search);
  if (assetLedgerActive !== null) {
    return assetLedgerActive;
  }
  const dynamicProbeActive = dynamicProbeNavActive(href, item.url, item.search);
  if (dynamicProbeActive !== null) {
    return dynamicProbeActive;
  }
  const platformActive = platformConfigNavActive(href, item.url, item.search);
  if (platformActive !== null) {
    return platformActive;
  }
  return href === item.url || pathnameOnlyNavActive(href, item.url);
}

function parseLocationHref(href: string): { pathname: string; searchParams: URLSearchParams } {
  try {
    const u = new URL(href, 'http://localhost');
    return { pathname: u.pathname, searchParams: u.searchParams };
  } catch {
    const q = href.indexOf('?');
    if (q === -1) {
      return { pathname: href, searchParams: new URLSearchParams() };
    }
    return {
      pathname: href.slice(0, q),
      searchParams: new URLSearchParams(href.slice(q + 1)),
    };
  }
}


/** Sidebar tasks links share `/tasks` but differ by `surface`; route default is `all`. */
function tasksNavItemActive(href: string, itemUrl: string): boolean | null {
  const cur = parseLocationHref(href);
  const tgt = parseLocationHref(itemUrl);
  if (cur.pathname !== '/tasks' || tgt.pathname !== '/tasks') {
    return null;
  }
  const curSurface = cur.searchParams.get('surface') ?? 'all';
  const tgtSurface = tgt.searchParams.get('surface') ?? 'all';
  return curSurface === tgtSurface;
}

function pathnameOnlyNavActive(href: string, itemUrl: string): boolean {
  if (itemUrl.includes('?')) {
    return false;
  }
  return parseLocationHref(href).pathname === parseLocationHref(itemUrl).pathname;
}

function parentPathNavActive(href: string, itemUrl: string): boolean {
  const normalizedHref = parseLocationHref(href).pathname;
  const normalizedItemUrl = parseLocationHref(itemUrl).pathname;
  if (normalizedItemUrl === '/') {
    return false;
  }
  return normalizedHref.startsWith(`${normalizedItemUrl}/`);
}

function checkIsActive(href: string, item: NavItem, mainNav = false) {
  const itemUrl = 'url' in item && typeof item.url === 'string' ? item.url : undefined;

  if (itemUrl !== undefined) {
    const assetLedgerActive = assetLedgerNavActive(
      href,
      itemUrl,
      'search' in item ? item.search : undefined,
    );
    if (assetLedgerActive !== null) {
      return assetLedgerActive;
    }
    const dynamicProbeActive = dynamicProbeNavActive(
      href,
      itemUrl,
      'search' in item ? item.search : undefined,
    );
    if (dynamicProbeActive !== null) {
      return dynamicProbeActive;
    }
    const platformActive = platformConfigNavActive(
      href,
      itemUrl,
      'search' in item ? item.search : undefined,
    );
    if (platformActive !== null) {
      return platformActive;
    }
    const tasksActive = tasksNavItemActive(href, itemUrl);
    if (tasksActive !== null) {
      return tasksActive;
    }
  }

  const subItems = 'items' in item ? item.items : undefined;

  return (
    href === itemUrl ||
    (itemUrl !== undefined && pathnameOnlyNavActive(href, itemUrl)) ||
    (itemUrl !== undefined && parentPathNavActive(href, itemUrl)) ||
    !!subItems?.some((sub) =>
      'items' in sub && sub.items
        ? sub.items.some((child) => isSubItemActive(href, child))
        : isSubItemActive(href, sub as NavSubLink),
    ) ||
    (mainNav &&
      itemUrl !== undefined &&
      href.split('/')[1] !== '' &&
      href.split('/')[1] === itemUrl.split('/')[1])
  );
}
