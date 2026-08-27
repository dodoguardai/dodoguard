import { createFileRoute } from '@tanstack/react-router';
import { SkillsMdAuditPage } from '@/features/skills-md-audit';

export const Route = createFileRoute('/_authenticated/skills-md-audit/')({
  component: SkillsMdAuditPage,
});
