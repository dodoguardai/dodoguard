import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/tasks/single-test/create')({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: typeof search.mode === 'string' ? search.mode : undefined,
  }),
  beforeLoad: ({ search }) => {
    const mode =
      typeof search.mode === 'string' &&
      ['single', 'multi-round', 'multi-round-excel'].includes(search.mode)
        ? search.mode
        : 'single';
    throw redirect({
      to: '/expert-toolbox/dynamic-probe',
      search: { mode: mode as 'single' | 'multi-round' | 'multi-round-excel' },
    });
  },
});
