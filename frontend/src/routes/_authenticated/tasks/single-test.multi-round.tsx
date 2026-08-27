import { createFileRoute } from '@tanstack/react-router';
import { MultiRoundTestPage } from '@/features/tasks/multi-round-test-page';

export const Route = createFileRoute('/_authenticated/tasks/single-test/multi-round')({
  component: MultiRoundTestPage,
  validateSearch: (search: Record<string, unknown>) => ({
    agents: typeof search.agents === 'string' ? search.agents : '',
    expectedSuccess:
      typeof search.expectedSuccess === 'string' ? search.expectedSuccess : '',
    judgeModel: typeof search.judgeModel === 'string' ? search.judgeModel : '',
  }),
});
