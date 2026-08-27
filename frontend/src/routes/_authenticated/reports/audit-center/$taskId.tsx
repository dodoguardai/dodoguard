import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/reports/audit-center/$taskId')({
  validateSearch: (search: Record<string, unknown> = {}) => {
    const panel = search.panel === 'full' ? ('full' as const) : undefined;
    const category =
      search.category === 'security'
        ? ('security' as const)
        : search.category === 'periodic'
          ? ('periodic' as const)
          : undefined;
    return {
      ...(panel ? { panel } : {}),
      ...(category ? { category } : {}),
    };
  },
  component: () => null,
});
