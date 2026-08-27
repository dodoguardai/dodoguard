import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { TechnicalCaseLibraryPage } from '@/features/technical-case-library';
import { ALL_DOMAIN_TAB } from '@/features/technical-case-library/technical-case-domains';

export const Route = createFileRoute('/_authenticated/scan/security-cases')({
  validateSearch: (search: Record<string, unknown>) => ({
    domain: typeof search.domain === 'string' ? search.domain : ALL_DOMAIN_TAB,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isLibraryDetail =
    pathname.startsWith('/scan/security-cases/') && pathname !== '/scan/security-cases';

  if (isLibraryDetail) {
    return <Outlet />;
  }

  const { domain } = Route.useSearch();
  return <TechnicalCaseLibraryPage initialDomain={domain} />;
}
