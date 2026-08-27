import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { ComplianceCaseLibraryPage } from '@/features/compliance-case-library'

export const Route = createFileRoute('/_authenticated/scan/compliance-cases')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === 'string' ? search.tab : 'libraries',
    domain: typeof search.domain === 'string' ? search.domain : 'all',
    law: typeof search.law === 'string' ? search.law : undefined,
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isLibraryDetail =
    pathname.startsWith('/scan/compliance-cases/') && pathname !== '/scan/compliance-cases'

  if (isLibraryDetail) {
    return <Outlet />
  }

  const { tab, domain, law } = Route.useSearch()
  return <ComplianceCaseLibraryPage initialTab={tab} initialDomain={domain} initialLaw={law} />
}
