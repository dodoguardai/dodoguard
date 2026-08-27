/**
 * Chat column — prototype #view-builder chat card (thread + composer).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2, Paperclip } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { agentModeApi, type AgentModeBundledSkill } from '@/services/api/agent-mode';
import { agentsApi } from '@/services/api/agents';
import { formatApiClientError } from '@/services/api/client';
import { tasksApi } from '@/services/api/tasks';
import { markAttackTaskRunJustStarted } from '@/features/tasks/active-run-session';
import type { CreateAttackTaskRequest } from '@/types/api';
import type { AttackTask, TargetAgent, TaskType } from '@/types/entities';
import { AgentModeDraftInline } from './agent-mode-draft-inline';
import type { AgentModeSurface } from './agent-mode-layout';
import { AgentModeSkillSelect } from './agent-mode-skill-select';

export type ChatMsg = { role: 'user' | 'assistant'; content: string };

type AgentModeChatProps = {
  surface: AgentModeSurface;
  isZh: boolean;
  bundled: AgentModeBundledSkill[];
  pinnedSkillSlug: string;
  onPinnedSkillSlugChange: (slug: string) => void;
};

const WELCOME_ZH =
  '你好。请在上方选择待测智能体；在底部输入条左侧选择「本会话技能」。再说明攻击意图。草案与创建确认在本条对话；评测结束后可在任务详情查看测试报告。';

const WELCOME_EN =
  'Pick a target agent above and a session Agent skill from the dropdown left of the chat input. Describe the attack intent. Draft validation and task creation stay in this thread; open the task after creation for full reports.';

const CHIPS_ZH = [
  '测 Dify 客服机器人的 prompt 注入',
  '工作流 API 密钥泄露场景',
  '多轮对话下的权限绕过',
] as const;

const CHIPS_EN = [
  'Prompt injection against the support bot',
  'Workflow API key leakage scenario',
  'Privilege bypass across multi-turn chat',
] as const;

type WizardTaskKind = 'api_test' | 'config_audit' | 'config_static';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Align Agent-mode creates with configuration wizard v4 fields (task type label + scan mode). */
function resolveV4ForAgentDraft(
  taskKind: WizardTaskKind,
  taskTypes: TaskType[],
  surface: AgentModeSurface,
) {
  const code =
    taskKind === 'config_audit'
      ? 'dify_config_audit'
      : taskKind === 'config_static'
        ? 'dify_config_static'
        : 'dify_api_scan';
  const taskTypeId = taskTypes.find((t) => t.code === code)?.id;
  const scanMode =
    taskKind === 'config_audit' || taskKind === 'config_static' ? 'static' : 'runtime';
  return { taskTypeId, platformFamily: surface, scanMode };
}

export function AgentModeChat({
  surface,
  isZh,
  bundled,
  pinnedSkillSlug,
  onPinnedSkillSlugChange,
}: AgentModeChatProps) {
  const threadRef = useRef<HTMLDivElement>(null);
  /** Incremented on Clear so late chat responses do not repopulate a cleared thread. */
  const chatSessionSeqRef = useRef(0);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [targetAgentId, setTargetAgentId] = useState('');
  const [agentPickMode, setAgentPickMode] = useState<'list' | 'manual'>('list');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [lastValidation, setLastValidation] = useState<{ ok: boolean; errors?: unknown } | null>(
    null,
  );
  const [lastDraft, setLastDraft] = useState<unknown>(null);

  const { data: agentsPage } = useQuery({
    queryKey: ['agent-mode-target-agents', surface],
    queryFn: () =>
      agentsApi.list({
        type: surface as TargetAgent['type'],
        limit: 100,
        offset: 0,
      }),
  });

  const { data: taskTypes = [] } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => tasksApi.listTaskTypes(),
  });

  const targetAgents = agentsPage?.data ?? [];
  const selectedAgentName =
    targetAgents.find((a) => a.id === targetAgentId)?.name ??
    (targetAgentId.trim() ? targetAgentId.trim() : '');

  useEffect(() => {
    const el = threadRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, lastDraft, lastValidation]);

  const chatMutation = useMutation({
    mutationFn: async () => {
      const seq = chatSessionSeqRef.current;
      const userMsg: ChatMsg = { role: 'user', content: input.trim() };
      const nextThread = [...messages, userMsg];
      const res = await agentModeApi.chat({
        surface,
        targetAgentId: targetAgentId.trim() || undefined,
        pinnedSkillSlug: pinnedSkillSlug.trim() || undefined,
        messages: nextThread,
      });
      return { res, nextThread, seq };
    },
    onSuccess: ({ res, nextThread, seq }) => {
      if (seq !== chatSessionSeqRef.current) {
        return;
      }
      setInput('');
      const assistantRaw = res.assistant;
      const assistantText =
        typeof assistantRaw === 'string'
          ? assistantRaw
          : assistantRaw == null
            ? ''
            : (() => {
                try {
                  return JSON.stringify(assistantRaw);
                } catch {
                  return formatApiClientError(assistantRaw);
                }
              })();
      const assistantMsg: ChatMsg = { role: 'assistant', content: assistantText };
      setMessages([...nextThread, assistantMsg]);
      setLastValidation(res.validation ?? null);
      setLastDraft(res.draftTask ?? null);
      if (res.validation && !res.validation.ok) {
        toast.message(isZh ? '草案未通过校验' : 'Draft validation failed', {
          description: isZh ? '已在对话内展示 errors，可继续修改需求。' : 'Errors are shown in the draft card below.',
        });
      }
    },
    onMutate: () => ({ seq: chatSessionSeqRef.current }),
    onError: (err: unknown, _vars, context) => {
      const seq = (context as { seq?: number } | undefined)?.seq;
      if (seq !== chatSessionSeqRef.current) {
        return;
      }
      toast.error(formatApiClientError(err));
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!lastDraft || typeof lastDraft !== 'object') {
        throw new Error(isZh ? '没有可创建的草案' : 'No draft to create');
      }
      const base = lastDraft as Record<string, unknown>;
      const metaRaw =
        typeof base.metadata === 'object' && base.metadata !== null
          ? (base.metadata as Record<string, unknown>)
          : {};
      const meta = { ...metaRaw };
      const rawKind = meta.taskKind;
      const taskKind: WizardTaskKind =
        rawKind === 'config_audit' || rawKind === 'config_static' || rawKind === 'api_test'
          ? rawKind
          : 'api_test';
      meta.taskKind = taskKind;
      meta.creationMode = 'agent_skills';
      meta.surface = surface;

      const v4 = resolveV4ForAgentDraft(taskKind, taskTypes, surface);
      const existingId = typeof base.taskTypeId === 'string' ? base.taskTypeId.trim() : '';
      const taskTypeId =
        existingId && UUID_RE.test(existingId) ? existingId : v4.taskTypeId;

      const scanRaw = base.scanMode;
      const scanMode =
        scanRaw === 'static' || scanRaw === 'runtime' || scanRaw === 'hybrid'
          ? scanRaw
          : v4.scanMode;

      const body = {
        ...base,
        platformFamily: surface,
        scanMode,
        ...(taskTypeId ? { taskTypeId } : {}),
        metadata: meta,
      } as unknown as CreateAttackTaskRequest;

      const task = await tasksApi.create(body);
      try {
        await tasksApi.run({ taskId: task.id });
        return { task, runStartedSuccessfully: true as const };
      } catch (runErr: unknown) {
        return {
          task,
          runStartedSuccessfully: false as const,
          runErrorMessage: formatApiClientError(runErr),
        };
      }
    },
    onSuccess: (outcome) => {
      const { task, runStartedSuccessfully, runErrorMessage } = outcome;
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      if (runStartedSuccessfully) {
        markAttackTaskRunJustStarted(task.id);
        queryClient.setQueryData<AttackTask>(['attack-task', task.id], (prev) => ({
          ...(prev ?? (task as AttackTask)),
          ...(task as AttackTask),
          status: 'running',
        }));
        toast.success(isZh ? '任务已创建并已启动运行' : 'Task created and run started');
      } else {
        toast.warning(
          isZh
            ? `任务已创建，但启动运行失败：${runErrorMessage ?? ''}`
            : `Task created but run failed to start: ${runErrorMessage ?? ''}`,
        );
      }
      navigate({ to: `/tasks/${task.id}` });
    },
    onError: (err: unknown) => {
      toast.error(formatApiClientError(err));
    },
  });

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) {
      return;
    }
    if (!targetAgentId.trim()) {
      toast.error(
        isZh
          ? '请先在「待测智能体」中选择列表中的智能体，或切换到手动输入并填写 ID，然后再发送。'
          : 'Choose a target agent from the list below, or switch to manual id and enter one, before sending.',
      );
      return;
    }
    chatMutation.mutate();
  };

  const handleClear = () => {
    chatSessionSeqRef.current += 1;
    chatMutation.reset();
    createMutation.reset();
    setMessages([]);
    setLastDraft(null);
    setLastValidation(null);
    setInput('');
  };

  const clearDisabled =
    chatMutation.isPending ||
    createMutation.isPending ||
    (messages.length === 0 &&
      lastDraft === null &&
      lastValidation === null &&
      input.trim().length === 0);

  const handleCopyJson = async () => {
    if (lastDraft === undefined || lastDraft === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastDraft, null, 2));
      toast.success(isZh ? '已复制 JSON' : 'JSON copied');
    } catch {
      toast.error(isZh ? '复制失败' : 'Copy failed');
    }
  };

  const handleRevise = () => {
    document.getElementById('chat-input')?.focus();
    toast.message(isZh ? '请在输入框说明要调整的部分' : 'Describe what to change below');
  };

  const displayMessages: ChatMsg[] =
    messages.length === 0
      ? [{ role: 'assistant', content: isZh ? WELCOME_ZH : WELCOME_EN }]
      : messages;

  const canCreate = lastValidation?.ok === true && lastDraft !== null;
  const chips = isZh ? CHIPS_ZH : CHIPS_EN;

  return (
    <section className="min-w-0 flex-1">
      <div className="border-border bg-card flex h-[min(780px,calc(100vh-9rem))] flex-col overflow-hidden rounded-2xl border shadow-xs lg:h-[min(820px,calc(100vh-8.5rem))]">
        <div className="border-border bg-muted/30 flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-foreground text-sm font-semibold">{isZh ? '对话' : 'Chat'}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {isZh ? (
                <>
                  在上方选择<strong className="text-muted-foreground font-medium">待测智能体</strong>；在底部输入条左侧选择
                  <strong className="text-muted-foreground font-medium">本会话技能</strong>
                  。草案、确认与
                  <strong className="text-foreground font-medium">测试报告</strong>
                  均在消息流内（报告详情见任务运行）。
                </>
              ) : (
                <>
                  Pick <strong className="font-medium">target agent</strong> above and{' '}
                  <strong className="font-medium">session skill</strong> left of the chat input. Drafts and{' '}
                  <strong className="text-foreground font-medium">reports</strong> stay in-thread (details on the task
                  run).
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto rounded-lg px-3 py-1.5 text-xs"
              disabled={clearDisabled}
              title={
                chatMutation.isPending || createMutation.isPending
                  ? isZh
                    ? '请等待当前请求结束后再清空'
                    : 'Wait for the current request to finish before clearing'
                  : undefined
              }
              onClick={handleClear}
            >
              {isZh ? '清空' : 'Clear'}
            </Button>
          </div>
        </div>

        <div
          ref={threadRef}
          id="chat-thread"
          className="scrollbar-thin bg-muted/40 flex-1 space-y-6 overflow-y-auto p-5"
        >
          {displayMessages.map((m, i) =>
            m.role === 'assistant' ? (
              <div key={`a-${i}`} className="animate-in flex gap-3">
                <div className="bg-primary text-primary-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs">
                  AI
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-foreground text-xs font-semibold">
                      {isZh ? '任务编排助手' : 'Task orchestrator'}
                    </span>
                    <span className="text-muted-foreground text-[10px]">{isZh ? '刚刚' : 'now'}</span>
                  </div>
                  <div className="border-border bg-card text-card-foreground max-w-[min(100%,52rem)] rounded-xl rounded-tl-md border px-4 py-3 text-sm leading-relaxed shadow-xs">
                    <pre className="font-sans whitespace-pre-wrap">{m.content}</pre>
                  </div>
                </div>
              </div>
            ) : (
              <div key={`u-${i}`} className="animate-in flex justify-end gap-3">
                <div className="bg-primary text-primary-foreground max-w-[min(100%,min(90%,52rem))] rounded-xl rounded-tr-md px-4 py-3 text-sm leading-relaxed shadow-xs">
                  <pre className="font-sans whitespace-pre-wrap">{m.content}</pre>
                </div>
              </div>
            ),
          )}

          <AgentModeDraftInline
            validation={lastValidation}
            draftTask={lastDraft}
            canCreate={canCreate}
            isCreating={createMutation.isPending}
            onCreate={() => createMutation.mutate()}
            onCopyJson={handleCopyJson}
            onRevise={handleRevise}
            isZh={isZh}
            surface={surface}
            targetAgentLabel={selectedAgentName}
            pinnedSkillSlug={pinnedSkillSlug}
          />
        </div>

        <div className="border-border bg-card border-t p-4">
          <div className="border-border bg-muted/50 mb-3 flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-foreground text-xs font-semibold">{isZh ? '待测智能体' : 'Target agent'}</div>
              <p className="text-muted-foreground mt-0.5 text-[10px] leading-snug">
                {isZh ? (
                  <>
                    对接 <span className="font-mono">GET /api/v1/target-agents?type=…</span>；可切换手动输入 ID
                  </>
                ) : (
                  <>
                    From <span className="font-mono">GET /api/v1/target-agents?type=…</span>; switch to manual id if
                    needed
                  </>
                )}
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:max-w-[min(100%,280px)]">
              {targetAgents.length > 0 ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground self-end text-[10px] underline-offset-2 hover:underline sm:self-auto"
                  onClick={() => {
                    setAgentPickMode((m) => (m === 'list' ? 'manual' : 'list'));
                    setTargetAgentId('');
                  }}
                >
                  {agentPickMode === 'list'
                    ? isZh
                      ? '手动输入 ID'
                      : 'Manual id'
                    : isZh
                      ? '从列表选择'
                      : 'From list'}
                </button>
              ) : null}
              {agentPickMode === 'list' && targetAgents.length > 0 ? (
                <Select
                  value={targetAgentId || '__none__'}
                  onValueChange={(v) => setTargetAgentId(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="border-input bg-card h-auto rounded-lg py-2 text-sm font-medium shadow-xs">
                    <SelectValue placeholder={isZh ? '选择待测智能体' : 'Select target agent'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{isZh ? '（未指定）' : '(None)'}</SelectItem>
                    {targetAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="border-input bg-card rounded-lg py-2 text-sm font-medium shadow-xs"
                  value={targetAgentId}
                  onChange={(e) => setTargetAgentId(e.target.value)}
                  placeholder={isZh ? 'UUID / 平台侧 ID' : 'UUID / platform id'}
                />
              )}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {chips.map((text) => (
              <button
                key={text}
                type="button"
                className="border-border bg-muted text-muted-foreground hover:border-ring hover:bg-accent hover:text-accent-foreground rounded-full border px-3 py-1 text-[11px] font-medium transition-colors"
                onClick={() => setInput(text)}
              >
                {text}
              </button>
            ))}
          </div>

          <div className="border-border bg-muted/80 flex flex-col gap-2 rounded-xl border p-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="text-muted-foreground hover:bg-card flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                title={isZh ? '附件（占位）' : 'Attachments (placeholder)'}
                disabled
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <div className="flex min-h-10 w-full max-w-[240px] shrink-0 flex-col gap-1 sm:w-auto">
                <span className="text-foreground px-0.5 text-[11px] font-semibold leading-none sm:sr-only">
                  {isZh ? '本会话技能' : 'Session skill'}
                </span>
                <AgentModeSkillSelect
                  bundled={bundled}
                  pinnedSkillSlug={pinnedSkillSlug}
                  onPinnedSkillSlugChange={onPinnedSkillSlugChange}
                  isZh={isZh}
                  title={
                    isZh
                      ? '本会话技能：下拉单选 Agent 技能包；第一项表示由助手自动选用。'
                      : 'Session skill: pick one Agent skill per send; first option lets the assistant choose.'
                  }
                  triggerClassName="border-input bg-card h-10 w-full min-w-[11rem] rounded-lg text-sm font-medium shadow-xs"
                />
              </div>
              <Input
                id="chat-input"
                type="text"
                className="placeholder:text-muted-foreground h-10 min-w-32 flex-1 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
                placeholder={isZh ? '描述测试意图，Enter 发送…' : 'Describe intent, Enter to send…'}
                aria-label={isZh ? '聊天输入' : 'Chat input'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <Button
                type="button"
                className="h-10 shrink-0 gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-xs"
                disabled={chatMutation.isPending || !input.trim()}
                onClick={handleSend}
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {isZh ? '发送' : 'Send'}
                    <kbd className="bg-card/20 hidden rounded px-1.5 py-0.5 font-mono text-[10px] sm:inline">↵</kbd>
                  </>
                )}
              </Button>
            </div>
          </div>

          <p className="text-muted-foreground mt-2 text-center text-[10px]">
            {isZh ? (
              <>
                编排接口 <span className="font-mono">POST /api/v1/agent/chat</span>
              </>
            ) : (
              <>
                Orchestrator <span className="font-mono">POST /api/v1/agent/chat</span>
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
