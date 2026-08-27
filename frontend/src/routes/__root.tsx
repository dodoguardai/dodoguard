import { type QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { Toaster } from '@/components/ui/sonner';
import { NavigationProgress } from '@/components/navigation-progress';
import { RouteGeneralError } from '@/features/errors/general-error';
import { NotFoundError } from '@/features/errors/not-found-error';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => {
    return (
      <>
        <NavigationProgress />
        <Outlet />
        <Toaster duration={5000} />
      </>
    );
  },
  notFoundComponent: NotFoundError,
  errorComponent: RouteGeneralError,
});
