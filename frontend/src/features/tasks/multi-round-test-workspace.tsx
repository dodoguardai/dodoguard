/**
 * Multi-round test workspace: N chat panels + shared composer + submit for review.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Loader2, Send, ShieldCheck, Target } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { markAttackTaskRunJustStarted } from '@/features/tasks/active-run-session';
import { agentsApi } from '@/services/api/agents';
import {
  singleTestMultiRoundApi,
  type MultiRoundChatMessage,
} from '@/services/api/single-test-multi-round';
import type { TargetAgent } from '@/types/entities';

type Tr = (en: string, zh: string) => string;

type AgentSession = {
  agent: TargetAgent;
  conversationId?: string;
  messages: MultiRoundChatMessage[];
  pending: boolean;
  error?: string;
};

interface MultiRoundTestWorkspaceProps {
  tr: Tr;
  isZh: boolean;
  agentIds: string[];
  expectedSuccess: string;
  judgeModel: string;
}

export function MultiRoundTestWorkspace({
  tr,
  isZh,
  agentIds,
  expectedSuccess,
  judgeModel,
}: MultiRoundTestWorkspaceProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionIdRef = useRef(`mrt-${Date.now()}`);
  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState<Record<string, AgentSession>>({});
  const [sending, setSending] = useState(false);

  const { data: agentsPage, isLoading } = useQuery({
    queryKey: ['target-agents', 'multi-round-workspace', agentIds.join(',')],
    queryFn: async () => Promise.all(agentIds.map((id) => agentsApi.get(id))),
    enabled: agentIds.length > 0,
  });

  useEffect(() => {
    if (!agentsPage?.length) {
      return;
    }
    setSessions((prev) => {
      const next = { ...prev };
      for (const agent of agentsPage) {
        if (!next[agent.id]) {
          next[agent.id] = { agent, messages: [], pending: false };
        } else {
          next[agent.id] = { ...next[agent.id], agent };
        }
      }
      return next;
    });
  }, [agentsPage]);

  const userRoundCount = useMemo(() => {
    const first = Object.values(sessions)[0];
    return first?.messages.filter((m) => m.role === 'user').length ?? 0;
  }, [sessions]);

  const sendToAll = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || agentIds.length === 0) {
      return;
    }

    setSending(true);
    setInput('');

    let conversationSnapshot: Record<string, string | undefined> = {};
    setSessions((prev) => {
      const next = { ...prev };
      for (const id of agentIds) {
        const s = next[id];
        if (!s) {
          continue;
        }
        conversationSnapshot[id] = s.conversationId;
        next[id] = {
          ...s,
          pending: true,
          error: undefined,
          messages: [...s.messages, { role: 'user', content: text }],
        };
      }
      return next;
    });

    await Promise.allSettled(
      agentIds.map(async (agentId) => {
        try {
          const result = await singleTestMultiRoundApi.chat({
            agentId,
            message: text,
            conversationId: conversationSnapshot[agentId],
          });

          setSessions((prev) => {
            const s = prev[agentId];
            if (!s) {
              return prev;
            }
            const messages = [...s.messages];
            if (result.ok && result.reply) {
              messages.push({ role: 'assistant', content: result.reply });
            }
            return {
              ...prev,
              [agentId]: {
                ...s,
                pending: false,
                conversationId: result.conversationId ?? s.conversationId,
                error: result.ok ? undefined : result.error || tr('Request failed', '请求失败'),
                messages,
              },
            };
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setSessions((prev) => {
            const s = prev[agentId];
            if (!s) {
              return prev;
            }
            return {
              ...prev,
              [agentId]: { ...s, pending: false, error: msg },
            };
          });
        }
      }),
    );

    setSending(false);
  }, [agentIds, input, sending, tr]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const agents = agentIds
        .map((id) => {
          const s = sessions[id];
          if (!s || s.messages.length === 0) {
            return null;
          }
          return {
            agentId: id,
            agentName: s.agent.name,
            conversationId: s.conversationId,
            messages: s.messages,
          };
        })
        .filter(Boolean) as Array<{
        agentId: string;
        agentName: string;
        conversationId?: string;
        messages: MultiRoundChatMessage[];
      }>;

      if (agents.length === 0) {
        throw new Error(
          tr('Complete at least one round before submitting', '请至少完成一轮对话后再提交'),
        );
      }

      return singleTestMultiRoundApi.submit({
        judgeModel,
        expectedSuccess,
        sessionId: sessionIdRef.current,
        batchName: `${tr('Multi-round test', '多轮测试')} — ${new Date().toLocaleString(isZh ? 'zh-CN' : 'en-US')}`,
        agents,
      });
    },
    onSuccess: (data) => {
      for (const t of data.tasks) {
        markAttackTaskRunJustStarted(t.taskId);
      }
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['attack-tasks', 'single-test-list'] });
      toast.success(
        tr(
          `Submitted ${data.tasks.length} task(s) for review`,
          `已提交 ${data.tasks.length} 个任务进行审核`,
        ),
      );
      if (data.tasks.length === 1) {
        navigate({
          to: '/expert-toolbox/dynamic-probe',
          search: { mode: 'result', taskId: data.tasks[0]!.taskId },
        });
      } else {
        navigate({ to: '/expert-toolbox/dynamic-probe', search: { mode: 'list' } });
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err));
    },
  });

  const panelCount = agentIds.length;
  const gridClass =
    panelCount <= 1
      ? 'grid-cols-1'
      : panelCount <= 2
        ? 'grid-cols-1 lg:grid-cols-2'
        : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 shrink-0"
              onClick={() =>
                navigate({
                  to: '/expert-toolbox/dynamic-probe',
                  search: { mode: 'multi-round' },
                })
              }
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {tr('Back', '返回')}
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold tracking-tight">
                {tr('Multi-round test', '多轮测试')}
              </h2>
              <p className="text-muted-foreground text-xs">
                {tr(
                  `${panelCount} agent(s) · ${userRoundCount} round(s)`,
                  `${panelCount} 个智能体 · ${userRoundCount} 轮`,
                )}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={submitMutation.isPending || userRoundCount < 1 || sending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-1.5 h-4 w-4" />
            )}
            {tr('Submit for review', '提交审核')}
          </Button>
        </div>

        <div className="bg-muted/30 flex gap-2.5 rounded-lg border px-3 py-2.5">
          <Target className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground text-[11px] font-medium">
              {tr('Overall expected success', '整体攻击成功预期')}
            </div>
            <p className="mt-0.5 line-clamp-3 text-sm leading-snug whitespace-pre-wrap">
              {expectedSuccess}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
        {isLoading ? (
          <div className={`grid gap-3 ${gridClass}`}>
            {agentIds.map((id) => (
              <Skeleton key={id} className="h-72 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className={`grid gap-3 ${gridClass}`}>
            {agentIds.map((agentId) => {
              const session = sessions[agentId];
              const agent = session?.agent;
              return (
                <div
                  key={agentId}
                  className="flex min-h-64 flex-col overflow-hidden rounded-xl border bg-card"
                >
                  <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                    <div className="min-w-0 truncate text-sm font-medium">
                      {agent?.name ?? agentId}
                      {agent?.type ? (
                        <span className="text-muted-foreground ml-2 text-[11px] font-normal">
                          {String(agent.type).toUpperCase()}
                        </span>
                      ) : null}
                    </div>
                    {session?.pending ? (
                      <Loader2 className="text-muted-foreground h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : null}
                  </div>
                  <ScrollArea className="min-h-0 flex-1 px-3 py-3">
                    <div className="space-y-2.5">
                      {(session?.messages ?? []).length === 0 ? (
                        <p className="text-muted-foreground py-10 text-center text-xs">
                          {tr('Send the first probe below…', '在下方发送第一条探测指令…')}
                        </p>
                      ) : (
                        session?.messages.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`rounded-lg px-3 py-2 text-sm ${
                              msg.role === 'user'
                                ? 'ml-6 bg-primary/10'
                                : 'mr-6 border bg-muted/25'
                            }`}
                          >
                            <div className="text-muted-foreground mb-1 text-[10px] font-medium uppercase tracking-wide">
                              {msg.role === 'user'
                                ? tr('You', '测试')
                                : tr('Agent', '智能体')}
                            </div>
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                              {msg.content}
                            </pre>
                          </div>
                        ))
                      )}
                      {session?.error ? (
                        <p className="text-destructive text-xs">{session.error}</p>
                      ) : null}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-border bg-background/95 sticky bottom-0 z-20 shrink-0 border-t backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="flex items-stretch gap-2 px-4 py-3 sm:px-5">
          <Textarea
            placeholder={tr(
              'Probe instruction — Enter to send to all agents',
              '探测指令 — Enter 发送给全部智能体',
            )}
            value={input}
            disabled={sending || isLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendToAll();
              }
            }}
            className="h-14 min-h-14 min-w-0 flex-1 resize-none overflow-y-auto py-2.5 text-sm leading-relaxed"
          />
          <Button
            type="button"
            className="h-14 shrink-0 px-4"
            disabled={sending || !input.trim()}
            onClick={() => void sendToAll()}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="mr-1.5 h-4 w-4" />
                {tr('Send', '发送')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
