import { createFileRoute } from '@tanstack/react-router'
import { ComplianceLibraryDetailPage } from '@/features/compliance-case-library'

export const Route = createFileRoute('/_authenticated/scan/compliance-cases/$libraryId')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === 'string' ? search.tab : 'libraries',
    domain: typeof search.domain === 'string' ? search.domain : undefined,
    highlightCase: typeof search.highlightCase === 'string' ? search.highlightCase : undefined,
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const { libraryId } = Route.useParams()
  const { domain, highlightCase } = Route.useSearch()
  return (
    <ComplianceLibraryDetailPage
      libraryId={libraryId}
      returnDomain={domain}
      highlightCase={highlightCase}
    />
  )
}
