import { createFileRoute } from '@tanstack/react-router';
import { TechnicalCaseLibraryDetailPage } from '@/features/technical-case-library';
import { ALL_DOMAIN_TAB } from '@/features/technical-case-library/technical-case-domains';

export const Route = createFileRoute('/_authenticated/scan/security-cases/$libraryId')({
  validateSearch: (search: Record<string, unknown>) => ({
    domain: typeof search.domain === 'string' ? search.domain : ALL_DOMAIN_TAB,
    highlightCase: typeof search.highlightCase === 'string' ? search.highlightCase : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { libraryId } = Route.useParams();
  const { domain, highlightCase } = Route.useSearch();
  return (
    <TechnicalCaseLibraryDetailPage
      libraryId={libraryId}
      returnDomain={domain}
      highlightCase={highlightCase}
    />
  );
}
