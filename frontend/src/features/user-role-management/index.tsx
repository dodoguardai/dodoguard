import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Key, Package, ShieldCheck, UserCog, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { Organizations } from '@/features/organizations';
import { Permissions } from '@/features/permissions';
import { Roles } from '@/features/roles';
import { Teams } from '@/features/teams';
import { Users as UsersPage } from '@/features/users/index';
import {
  isUserRoleManagementPath,
  parseUserRoleManagementTabFromPath,
  type UserRoleManagementTab,
  userRoleManagementTabPath,
} from './constants';

type TabPermission = { resource: string; action: string };

type NavTab = {
  type: 'tab';
  id: UserRoleManagementTab;
  icon: typeof Package;
  labelKey: string;
  permission?: TabPermission;
};

type NavGroup = {
  type: 'group';
  icon: typeof ShieldCheck;
  labelKey: string;
  children: Array<{
    id: UserRoleManagementTab;
    labelKey: string;
    permission?: TabPermission;
  }>;
};

type NavItem = NavTab | NavGroup;

const NAV_CONFIG: NavItem[] = [
  {
    type: 'tab',
    id: 'organizations',
    icon: Package,
    labelKey: 'sidebar.item.organizations',
    permission: { resource: 'organization', action: 'read' },
  },
  {
    type: 'tab',
    id: 'teams',
    icon: Users,
    labelKey: 'sidebar.item.teams',
    permission: { resource: 'team', action: 'manage' },
  },
  {
    type: 'tab',
    id: 'users',
    icon: UserCog,
    labelKey: 'sidebar.item.users',
    permission: { resource: 'user', action: 'manage' },
  },
  {
    type: 'group',
    icon: ShieldCheck,
    labelKey: 'sidebar.item.rolesAndPermissions',
    children: [
      {
        id: 'roles',
        labelKey: 'sidebar.item.roles',
        permission: { resource: 'user', action: 'manage_roles' },
      },
      {
        id: 'permissions',
        labelKey: 'sidebar.item.permissions',
      },
    ],
  },
];


function canShowNavItem(
  permission: TabPermission | undefined,
  hasPermission: (resource: string, action: string) => boolean,
): boolean {
  if (!permission) {
    return true;
  }
  return hasPermission(permission.resource, permission.action);
}

function isNavTabVisible(item: NavItem, hasPermission: (resource: string, action: string) => boolean) {
  if (item.type === 'tab') {
    return canShowNavItem(item.permission, hasPermission);
  }

  return item.children.some((child) => canShowNavItem(child.permission, hasPermission));
}

function collectVisibleTabIds(
  items: NavItem[],
  hasPermission: (resource: string, action: string) => boolean,
): UserRoleManagementTab[] {
  const ids: UserRoleManagementTab[] = [];

  for (const item of items) {
    if (!isNavTabVisible(item, hasPermission)) {
      continue;
    }

    if (item.type === 'tab') {
      ids.push(item.id);
      continue;
    }

    for (const child of item.children) {
      if (canShowNavItem(child.permission, hasPermission)) {
        ids.push(child.id);
      }
    }
  }

  return ids;
}

function navButtonClass(active: boolean, subItem = false) {
  return cn(
    'inline-flex shrink-0 items-center justify-start gap-2 rounded-md text-sm font-medium transition-[color,box-shadow]',
    subItem ? 'h-8 px-3 text-[13px] lg:w-full lg:ps-9' : 'h-9 px-3 lg:w-full',
    active
      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
      : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
  );
}

type UserRoleManagementNavProps = {
  activeTab: UserRoleManagementTab;
  items: NavItem[];
  onSelect: (tab: UserRoleManagementTab) => void;
};

function UserRoleManagementNav({ activeTab, items, onSelect }: UserRoleManagementNavProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();

  const topLevelTabs = items.filter(
    (item): item is NavTab => item.type === 'tab' && isNavTabVisible(item, hasPermission),
  );
  const accessGroups = items.filter(
    (item): item is NavGroup => item.type === 'group' && isNavTabVisible(item, hasPermission),
  );

  return (
    <nav
      aria-label={t('pages.userRoleManagement.title')}
      className={cn(
        'shrink-0 rounded-xl border bg-muted/30 p-2',
        'flex w-full flex-row flex-nowrap items-center gap-1 overflow-x-auto',
        'lg:sticky lg:top-20 lg:w-56 lg:flex-col lg:items-stretch lg:self-start lg:overflow-visible',
      )}
    >
      {topLevelTabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={navButtonClass(activeTab === tab.id)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(tab.labelKey)}</span>
          </button>
        );
      })}

      {accessGroups.map((group) => {
        const visibleChildren = group.children.filter((child) =>
          canShowNavItem(child.permission, hasPermission),
        );
        const groupActive = visibleChildren.some((child) => child.id === activeTab);
        const GroupIcon = group.icon;

        return (
          <div
            key={group.labelKey}
            className={cn(
              'flex shrink-0 items-center gap-1',
              'before:mx-1 before:h-5 before:w-px before:bg-border before:content-[""] lg:before:hidden',
              'lg:w-full lg:flex-col lg:items-stretch lg:gap-1 lg:pt-2',
            )}
          >
            <div
              className={cn(
                'hidden items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground lg:flex',
                groupActive && 'text-foreground',
              )}
            >
              <GroupIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t(group.labelKey)}</span>
            </div>

            {visibleChildren.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onSelect(child.id)}
                className={navButtonClass(activeTab === child.id, true)}
              >
                {child.id === 'roles' ? (
                  <ShieldCheck className="h-4 w-4 shrink-0 lg:hidden" />
                ) : (
                  <Key className="h-4 w-4 shrink-0 lg:hidden" />
                )}
                <span className="truncate">{t(child.labelKey)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

export function UserRoleManagement() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { t } = useTranslation();

  const tabFromPath = parseUserRoleManagementTabFromPath(location.pathname);

  const visibleTabIds = useMemo(
    () => collectVisibleTabIds(NAV_CONFIG, hasPermission),
    [hasPermission],
  );

  const activeTab: UserRoleManagementTab = tabFromPath ?? 'organizations';

  const resolvedTab = visibleTabIds.includes(activeTab)
    ? activeTab
    : (visibleTabIds[0] ?? 'permissions');

  useEffect(() => {
    if (!isUserRoleManagementPath(location.pathname)) {
      return;
    }

    if (tabFromPath !== resolvedTab) {
      navigate({ to: userRoleManagementTabPath(resolvedTab), replace: true });
    }
  }, [location.pathname, navigate, resolvedTab, tabFromPath]);

  const handleTabChange = (value: UserRoleManagementTab) => {
    navigate({ to: userRoleManagementTabPath(value) });
  };

  const showTab = (tab: UserRoleManagementTab) => visibleTabIds.includes(tab);

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {t('pages.userRoleManagement.title')}
            </h2>
            <p className="text-muted-foreground">{t('pages.userRoleManagement.subtitle')}</p>
          </div>
        </div>

        <Tabs
          value={resolvedTab}
          onValueChange={(value) => handleTabChange(value as UserRoleManagementTab)}
          className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6"
        >
          <UserRoleManagementNav
            activeTab={resolvedTab}
            items={NAV_CONFIG}
            onSelect={handleTabChange}
          />

          <div className="min-w-0 flex-1">
            {showTab('organizations') ? (
              <TabsContent
                value="organizations"
                className="mt-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
              >
                <Organizations embedded />
              </TabsContent>
            ) : null}
            {showTab('teams') ? (
              <TabsContent
                value="teams"
                className="mt-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
              >
                <Teams embedded />
              </TabsContent>
            ) : null}
            {showTab('users') ? (
              <TabsContent
                value="users"
                className="mt-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
              >
                <UsersPage embedded />
              </TabsContent>
            ) : null}
            {showTab('roles') ? (
              <TabsContent
                value="roles"
                className="mt-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
              >
                <Roles embedded />
              </TabsContent>
            ) : null}
            {showTab('permissions') ? (
              <TabsContent
                value="permissions"
                className="mt-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
              >
                <Permissions embedded />
              </TabsContent>
            ) : null}
          </div>
        </Tabs>
      </Main>
    </>
  );
}
