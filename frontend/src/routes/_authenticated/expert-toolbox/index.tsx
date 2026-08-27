import { createFileRoute } from '@tanstack/react-router';
import { ExpertToolboxPage } from '@/features/expert-toolbox/expert-toolbox-page';

export const Route = createFileRoute('/_authenticated/expert-toolbox/')({
  component: ExpertToolboxPage,
});
