import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/scan/compliance-tasks/$taskId')({
  validateSearch: (search: Record<string, unknown> = {}) => {
    const panel = search.panel === 'full' ? ('full' as const) : undefined;
    const returnTo =
      typeof search.returnTo === 'string' && search.returnTo.startsWith('/')
        ? search.returnTo
        : undefined;
    return {
      ...(panel ? { panel } : {}),
      ...(returnTo ? { returnTo } : {}),
    };
  },
  component: () => null,
});
