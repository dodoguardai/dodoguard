export const USER_ROLE_MANAGEMENT_BASE = '/system/user-role-management';

export const USER_ROLE_MANAGEMENT_TABS = [
  'organizations',
  'teams',
  'users',
  'roles',
  'permissions',
] as const;

export type UserRoleManagementTab = (typeof USER_ROLE_MANAGEMENT_TABS)[number];

export function userRoleManagementTabPath(tab: UserRoleManagementTab): string {
  return `${USER_ROLE_MANAGEMENT_BASE}/${tab}`;
}

export function isUserRoleManagementPath(pathname: string): boolean {
  return (
    pathname === USER_ROLE_MANAGEMENT_BASE ||
    pathname.startsWith(`${USER_ROLE_MANAGEMENT_BASE}/`)
  );
}

export function parseUserRoleManagementTabFromPath(
  pathname: string,
): UserRoleManagementTab | null {
  if (!isUserRoleManagementPath(pathname)) {
    return null;
  }

  const segment = pathname.slice(USER_ROLE_MANAGEMENT_BASE.length).replace(/^\//, '');
  if (!segment) {
    return null;
  }

  return USER_ROLE_MANAGEMENT_TABS.includes(segment as UserRoleManagementTab)
    ? (segment as UserRoleManagementTab)
    : null;
}
