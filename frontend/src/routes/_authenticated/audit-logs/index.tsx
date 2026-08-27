import { createFileRoute } from '@tanstack/react-router';
import { AuditLogsPage } from '@/features/system-mgmt/audit-logs-page';

export const Route = createFileRoute('/_authenticated/audit-logs/')({
  component: AuditLogsPage,
});
