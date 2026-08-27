import { createFileRoute } from '@tanstack/react-router';
import { SystemOpsPage } from '@/features/system-mgmt/system-ops-page';

export const Route = createFileRoute('/_authenticated/system/ops')({
  component: SystemOpsPage,
});
