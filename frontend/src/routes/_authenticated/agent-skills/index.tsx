import { createFileRoute } from '@tanstack/react-router';
import { AgentSkillsPage } from '@/features/agent-skills';

export const Route = createFileRoute('/_authenticated/agent-skills/')({
  component: AgentSkillsPage,
});
