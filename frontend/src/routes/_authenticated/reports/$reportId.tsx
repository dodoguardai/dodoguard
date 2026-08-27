import { createFileRoute } from '@tanstack/react-router';
import { ReportDetail } from '@/features/reports/report-detail';

const FROM_CATEGORIES = [
  'security',
  'periodic',
  'compliance',
  'capability',
  'config',
  'manual',
] as const;

export type ReportDetailFromCategory = (typeof FROM_CATEGORIES)[number];

export type ReportDetailSearch = {
  fromCategory?: ReportDetailFromCategory;
};

export const Route = createFileRoute('/_authenticated/reports/$reportId')({
  validateSearch: (search: Record<string, unknown> = {}): ReportDetailSearch => {
    const raw = typeof search.fromCategory === 'string' ? search.fromCategory : undefined;
    const fromCategory = FROM_CATEGORIES.includes(raw as ReportDetailFromCategory)
      ? (raw as ReportDetailFromCategory)
      : undefined;
    return fromCategory ? { fromCategory } : {};
  },
  component: () => {
    const { reportId } = Route.useParams();
    const { fromCategory } = Route.useSearch();
    return <ReportDetail reportId={reportId} fromCategory={fromCategory} />;
  },
});
