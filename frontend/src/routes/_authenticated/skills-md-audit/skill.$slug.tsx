import { createFileRoute } from '@tanstack/react-router';
import { SkillsMdAuditSkillDetailPage } from '@/features/skills-md-audit/skill-detail-page';

export const Route = createFileRoute('/_authenticated/skills-md-audit/skill/$slug')({
  component: SkillsMdAuditSkillDetailPage,
});
