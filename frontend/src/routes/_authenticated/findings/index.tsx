import { createFileRoute } from '@tanstack/react-router';
import { Findings } from '@/features/findings';

type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
type FindingStatus = 'open' | 'under_review' | 'accepted' | 'fixed';

export const Route = createFileRoute('/_authenticated/findings/')({
  validateSearch: (search: Record<string, unknown> = {}) => {
    const riskLevel = search.riskLevel ?? search.severity;
    const status = search.status;
    const allowedRisk: RiskLevel[] = ['critical', 'high', 'medium', 'low'];
    const allowedStatus: FindingStatus[] = ['open', 'under_review', 'accepted', 'fixed'];
    const agentId = typeof search.agentId === 'string' ? (search.agentId as string) : undefined;
    const rawPage = search.page;
    let page = 1;
    if (typeof rawPage === 'number' && Number.isFinite(rawPage) && rawPage >= 1) {
      page = Math.floor(rawPage);
    } else if (typeof rawPage === 'string') {
      const n = parseInt(rawPage, 10);
      if (Number.isFinite(n) && n >= 1) {
        page = n;
      }
    }
    return {
      riskLevel:
        typeof riskLevel === 'string' && allowedRisk.includes(riskLevel as RiskLevel)
          ? (riskLevel as RiskLevel)
          : undefined,
      status:
        typeof status === 'string' && allowedStatus.includes(status as FindingStatus)
          ? (status as FindingStatus)
          : undefined,
      search: typeof search.search === 'string' ? search.search : undefined,
      page,
      agentId,
    };
  },
  component: Findings,
});
