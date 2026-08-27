import { Navigate, Outlet, useLocation } from '@tanstack/react-router';
import { usePermissions } from '@/hooks/use-permissions';
import { getPermissionForPath } from '@/config/permissions';

interface PermissionRouteProps {
  permission: string | { resource: string; action: string };
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

export function PermissionRoute({
  permission,
  children,
  fallback,
  redirectTo = '/',
}: PermissionRouteProps) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return fallback || <div>Loading...</div>;
  }

  const hasAccess =
    typeof permission === 'string'
      ? hasPermission(permission.split(':')[0], permission.split(':')[1])
      : hasPermission(permission.resource, permission.action);

  if (!hasAccess) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

/**
 * Wraps the authenticated layout outlet: for the current path, if a permission
 * is required (per config), renders PermissionRoute around the outlet; otherwise
 * renders the outlet directly. Use once inside AuthenticatedLayout.
 */
export function AuthenticatedRouteGuard() {
  const location = useLocation();
  const permission = getPermissionForPath(location.pathname);

  if (!permission) {
    return <Outlet />;
  }

  return (
    <PermissionRoute permission={permission} redirectTo="/">
      <Outlet />
    </PermissionRoute>
  );
}
