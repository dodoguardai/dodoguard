/**
 * Permission–feature matrix (single source of truth for frontend).
 * Maps each permission to labels and route prefixes for sidebar/route guards.
 * Keys must match backend permission names (resource:action).
 */

export interface PermissionConfig {
  label: string;
  /** Path prefixes this permission gates (e.g. `/` for dashboard:read) */
  routes?: string[];
}

/** Permission key -> config. Align routes with current product modules. */
export const PERMISSION_CONFIG: Record<string, PermissionConfig> = {
  'dashboard:read': {
    label: 'View Security Overview and My Todos',
    routes: ['/', '/dashboard', '/workbench'],
  },
  'user:manage': {
    label: 'Manage users',
    routes: ['/users', '/system/user-role-management'],
  },
  'user:manage_roles': {
    label: 'Manage roles and permission catalog',
    routes: ['/roles', '/permissions', '/system/user-role-management'],
  },
  'user:read': {
    label: 'View user details',
    routes: ['/users', '/system/user-role-management'],
  },
  'user:create': { label: 'Create users', routes: ['/users'] },
  'user:update': { label: 'Update users', routes: ['/users'] },
  'user:delete': { label: 'Delete users', routes: ['/users'] },
  'team:manage': {
    label: 'Manage teams',
    routes: ['/teams', '/system/user-role-management'],
  },
  'task:manage': {
    label: 'Manage assessments, probes, assets, and case libraries',
    routes: [
      '/tasks',
      '/agents',
      '/assets',
      '/scan',
      '/mcp-audit',
      '/capability-audit',
      '/expert-toolbox',
      '/launch-monitoring',
      '/workbench/todos',
      '/developer-api',
    ],
  },
  'vulnerability:manage': {
    label: 'Manage risk remediation closed-loop',
    routes: ['/vulnerabilities', '/findings', '/scan/remediation'],
  },
  'report:read': {
    label: 'View audit center and reports',
    routes: ['/reports'],
  },
  'system:read': {
    label: 'View system settings and Agent ownership',
    routes: ['/queue', '/system-config', '/settings', '/system/agent-ownership'],
  },
  'system:update': {
    label: 'Update system settings',
    routes: ['/settings', '/system-config'],
  },
  'organization:read': {
    label: 'View organization',
    routes: ['/organizations', '/system/user-role-management'],
  },
  'organization:update': {
    label: 'Update organization',
    routes: ['/organizations'],
  },
  'subscription:read': {
    label: 'View subscription',
    routes: ['/subscription'],
  },
  'subscription:update': {
    label: 'Change subscription',
    routes: ['/subscription'],
  },
};

/** All permission keys that gate sidebar or routes (for iteration). */
export const PERMISSION_KEYS = Object.keys(PERMISSION_CONFIG);

/**
 * Check if a permission name (e.g. "user:manage") implies access to a path.
 * Path is matched by prefix (e.g. /users matches /users/123).
 */
export function permissionGatesPath(permission: string, path: string): boolean {
  const config = PERMISSION_CONFIG[permission];
  if (!config?.routes) return false;
  const normalizedPath = path.split('?')[0];
  return config.routes.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(prefix + '/'),
  );
}

/**
 * Path prefix -> permission required to access that route.
 * Longest prefix match: order by prefix length descending.
 */
const ROUTE_PERMISSION_MAP: { prefix: string; permission: string }[] = [
  { prefix: '/system/user-role-management', permission: 'user:manage' },
  { prefix: '/system/agent-ownership', permission: 'system:read' },
  { prefix: '/workbench/todos', permission: 'task:manage' },
  { prefix: '/workbench', permission: 'dashboard:read' },
  { prefix: '/scan/remediation', permission: 'vulnerability:manage' },
  { prefix: '/scan', permission: 'task:manage' },
  { prefix: '/assets', permission: 'task:manage' },
  { prefix: '/mcp-audit', permission: 'task:manage' },
  { prefix: '/capability-audit', permission: 'task:manage' },
  { prefix: '/expert-toolbox', permission: 'task:manage' },
  { prefix: '/launch-monitoring', permission: 'task:manage' },
  { prefix: '/developer-api', permission: 'task:manage' },
  { prefix: '/users', permission: 'user:manage' },
  { prefix: '/roles', permission: 'user:manage_roles' },
  { prefix: '/permissions', permission: 'user:manage_roles' },
  { prefix: '/teams', permission: 'team:manage' },
  { prefix: '/tasks', permission: 'task:manage' },
  { prefix: '/agents', permission: 'task:manage' },
  { prefix: '/vulnerabilities', permission: 'vulnerability:manage' },
  { prefix: '/findings', permission: 'vulnerability:manage' },
  { prefix: '/reports', permission: 'report:read' },
  { prefix: '/organizations', permission: 'organization:read' },
  { prefix: '/subscription', permission: 'subscription:read' },
  { prefix: '/queue', permission: 'system:read' },
  { prefix: '/system-config', permission: 'system:read' },
  { prefix: '/settings', permission: 'system:read' },
  { prefix: '/dashboard', permission: 'dashboard:read' },
].sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * Get the required permission for a path, or null if no permission required.
 */
export function getPermissionForPath(path: string): string | null {
  const normalized = path.split('?')[0];
  if (normalized === '/' || normalized === '') return 'dashboard:read';
  const found = ROUTE_PERMISSION_MAP.find(
    (r) => normalized === r.prefix || normalized.startsWith(r.prefix + '/'),
  );
  return found?.permission ?? null;
}
