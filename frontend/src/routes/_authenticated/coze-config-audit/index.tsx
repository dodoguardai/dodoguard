import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/coze-config-audit/')({
  beforeLoad: () => {
    throw redirect({
      to: '/expert-toolbox/platform-config-audit',
      search: { platform: 'coze', view: 'run' },
    });
  },
});
