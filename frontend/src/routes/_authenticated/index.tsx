import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '@/features/dashboard';

type DashboardTab = 'overview' | 'quickstart';

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: (search: Record<string, unknown>) => {
    const raw = search.tab as string | undefined;
    const tab: DashboardTab = raw === 'overview' ? 'overview' : 'quickstart';
    return { tab };
  },
  component: Dashboard,
});
