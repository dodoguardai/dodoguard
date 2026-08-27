import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/assets/discovered')({
  beforeLoad: () => {
    throw redirect({
      to: '/assets/ledger',
    });
  },
});
