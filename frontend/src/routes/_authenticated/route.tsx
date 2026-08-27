import { createFileRoute, redirect } from '@tanstack/react-router';
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout';
import { useAuthStore } from '@/stores/auth-store';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const { accessToken, user } = useAuthStore.getState().auth;
    const isAuthenticated = !!(accessToken && user);

    if (!isAuthenticated) {
      // location.href 是 TanStack Router 提供的完整 URL 字符串，避免直接拼接对象类型的 search
      const redirectTo =
        typeof location.href === 'string' && location.href.length > 0
          ? location.href
          : location.pathname;

      throw redirect({
        to: '/sign-in',
        search: { redirect: redirectTo || '/' },
      });
    }
  },
  component: AuthenticatedLayout,
});
