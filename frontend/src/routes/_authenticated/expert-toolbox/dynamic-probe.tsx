import { createFileRoute } from '@tanstack/react-router';
import {
  DynamicProbePage,
  parseDynamicProbeSearch,
} from '@/features/expert-toolbox/dynamic-probe-page';

export const Route = createFileRoute('/_authenticated/expert-toolbox/dynamic-probe')({
  validateSearch: (search: Record<string, unknown>) => parseDynamicProbeSearch(search),
  component: DynamicProbePage,
});
