import { createFileRoute } from '@tanstack/react-router';
import { SkillsMdAuditHistoryListPage } from '@/features/skills-md-audit/history-list';

export const Route = createFileRoute('/_authenticated/skills-md-audit/history/')({
  component: SkillsMdAuditHistoryListPage,
});
