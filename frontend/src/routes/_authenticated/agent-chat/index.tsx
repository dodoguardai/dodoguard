import { createFileRoute } from '@tanstack/react-router';
import { AgentChatPage } from '@/features/agent-chat/agent-chat-page';

export const Route = createFileRoute('/_authenticated/agent-chat/')({
  component: AgentChatPage,
});
