import type { ReactNode } from 'react';

import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router';
import { FeaturePageLayout } from '@/components/layout/feature-page-layout';
import { DialogueTaskDetailOverlay } from '@/features/detection-scanning/dialogue-task-detail-overlay';
import { AuditCenterPage } from '@/features/reports/audit-center-page';

export const Route = createFileRoute('/_authenticated/reports/audit-center')({
  validateSearch: (search: Record<string, unknown> = {}) => {
    const panel = search.panel === 'full' ? ('full' as const) : undefined;
    const category =
      search.category === 'security'
        ? ('security' as const)
        : search.category === 'periodic'
          ? ('periodic' as const)
          : search.category === 'capability'
            ? ('capability' as const)
            : search.category === 'config'
              ? ('config' as const)
              : search.category === 'manual'
                ? ('manual' as const)
                : search.category === 'compliance'
                  ? ('compliance' as const)
                  : undefined;
    return {
      ...(panel ? { panel } : {}),
      ...(category ? { category } : {}),
    };
  },
  component: RouteComponent,
});

function AuditCenterShell({ children }: { children: ReactNode }) {
  return <FeaturePageLayout>{children}</FeaturePageLayout>;
}

function RouteComponent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { panel, category } = Route.useSearch();
  const detailMatch = location.pathname.match(/^\/reports\/audit-center\/([^/]+)$/);
  const taskId = detailMatch?.[1] ? decodeURIComponent(detailMatch[1]) : null;

  if (taskId) {
    return (
      <AuditCenterShell>
        <DialogueTaskDetailOverlay
          taskId={taskId}
          open
          initialPanel={panel === 'full' ? 'full' : 'overview'}
          presentation="inline"
          onClose={() => {
            void navigate({
              to: '/reports/audit-center',
              search: category ? { category } : {},
            });
          }}
        />
      </AuditCenterShell>
    );
  }

  return <AuditCenterPage initialCategory={category} />;
}
