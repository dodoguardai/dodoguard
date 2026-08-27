import { createFileRoute } from '@tanstack/react-router';
import { CapabilityAuditPage } from '@/features/capability-audit/capability-audit-page';

type CapabilityAuditSearch = {
  view?: 'overview' | 'run' | 'history';
  historyId?: string;
  auditType?: string;
};

export const Route = createFileRoute('/_authenticated/capability-audit/')({
  validateSearch: (search: Record<string, unknown>): CapabilityAuditSearch => {
    const viewRaw = typeof search.view === 'string' ? search.view : undefined;
    const view =
      viewRaw === 'run' || viewRaw === 'history' || viewRaw === 'overview' ? viewRaw : undefined;
    return {
      view,
      historyId: typeof search.historyId === 'string' && search.historyId ? search.historyId : undefined,
      auditType: typeof search.auditType === 'string' && search.auditType ? search.auditType : undefined,
    };
  },
  component: CapabilityAuditPage,
});
