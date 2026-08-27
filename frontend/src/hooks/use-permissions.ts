/**
 * usePermissions Hook
 * Provides permission checking from current user's role (GET /me/permissions).
 */

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { permissionsApi } from '@/services/api/permissions';

interface UsePermissionsReturn {
  /** Current user's permission names (e.g. ["dashboard:read", "user:manage"]) */
  permissionNames: string[] | undefined;
  isLoading: boolean;
  hasPermission: (resource: string, action: string) => boolean;
  hasAnyPermission: (perms: Array<{ resource: string; action: string }>) => boolean;
  hasAllPermissions: (perms: Array<{ resource: string; action: string }>) => boolean;
}

/**
 * Check if user's permission list includes the given resource:action.
 * Supports wildcards: "resource:*" or "*" in the list grants access.
 */
function checkPermission(permissionNames: string[], resource: string, action: string): boolean {
  const exact = `${resource}:${action}`;
  if (permissionNames.includes(exact)) return true;
  if (permissionNames.includes('*')) return true;
  if (permissionNames.includes(`${resource}:*`)) return true;
  return false;
}

export function usePermissions(): UsePermissionsReturn {
  const { user } = useAuthStore((state) => state.auth);

  const { data: permissionNames = [], isLoading } = useQuery({
    queryKey: ['me', 'permissions', user?.id],
    queryFn: () => permissionsApi.getMyPermissions(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const hasPermission = (resource: string, action: string): boolean => {
    if (!permissionNames || permissionNames.length === 0) return false;
    return checkPermission(permissionNames, resource, action);
  };

  const hasAnyPermission = (perms: Array<{ resource: string; action: string }>): boolean => {
    return perms.some((p) => hasPermission(p.resource, p.action));
  };

  const hasAllPermissions = (perms: Array<{ resource: string; action: string }>): boolean => {
    return perms.every((p) => hasPermission(p.resource, p.action));
  };

  return {
    permissionNames,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
