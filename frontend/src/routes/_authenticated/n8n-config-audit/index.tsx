import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/n8n-config-audit/')({
  beforeLoad: () => {
    throw redirect({
      to: '/expert-toolbox/platform-config-audit',
      search: { platform: 'n8n', view: 'run' },
    });
  },
});
