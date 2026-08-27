import { createFileRoute } from '@tanstack/react-router';
import { SkillsMdAuditRunPage } from '@/features/skills-md-audit/run-page';

export const Route = createFileRoute('/_authenticated/skills-md-audit/run')({
  validateSearch: (search: { skillSlug?: string } = {}) => ({
    skillSlug:
      typeof search.skillSlug === 'string' && search.skillSlug.trim() ? search.skillSlug.trim() : undefined,
  }),
  component: SkillsMdAuditRunPage,
});
