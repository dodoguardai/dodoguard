/**
 * Lightweight single-test / multi-round result: verdict first, then inputs / transcript / output.
 */

import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Loader2,
  MessageSquareText,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Target,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AttackTaskStatusBadge } from '@/features/tasks/attack-task-status-badge';
import { getRunLogResponsePreviewRaw } from '@/features/tasks/run-log-table-message';
import {
  getMultiRoundTestRoundCount,
  getRunSourceLabel,
  getSingleTestExpectedSuccess,
  getSingleTestPrompt,
  isMultiRoundTestTask,
} from '@/features/tasks/run-source-label';
import { cn } from '@/lib/utils';
import { tasksApi } from '@/services/api/tasks';
import { parseCozePreview } from '@/util/cozeResponsePreview';

type Tr = (en: string, zh: string) => string;

type RunLog = {
  id?: string;
  source?: string;
  judgePipeline?: string;
  responsePreview?: unknown;
  error?: unknown;
  prompt?: unknown;
  result?: { vulnerable?: unknown; reason?: unknown };
  message?: string;
};

type TranscriptMessage = { role: 'user' | 'assistant'; content: string };

function asRunLogs(metadata: Record<string, unknown> | undefined): RunLog[] {
  const raw = metadata?.runLogs;
  return Array.isArray(raw) ? (raw as RunLog[]) : [];
}

function getMultiRoundTranscript(
  metadata: Record<string, unknown> | undefined,
): TranscriptMessage[] {
  const mrt = metadata?.multiRoundTest;
  if (
    !mrt ||
    typeof mrt !== 'object' ||
    !Array.isArray((mrt as { transcript?: unknown }).transcript)
  ) {
    return [];
  }
  return ((mrt as { transcript: unknown[] }).transcript).filter(
    (m): m is TranscriptMessage =>
      Boolean(m) &&
      typeof m === 'object' &&
      ((m as { role?: string }).role === 'user' ||
        (m as { role?: string }).role === 'assistant') &&
      typeof (m as { content?: unknown }).content === 'string',
  );
}

function formatAgentOutput(raw: string): string {
  const t = raw.trim();
  if (!t) {
    return '';
  }
  if (t.startsWith('{') && t.includes('"messages"')) {
    const parsed = parseCozePreview(t).trim();
    if (parsed && parsed !== '—') {
      return parsed;
    }
  }
  return t;
}

function pickAgentOutput(logs: RunLog[]): string | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const log = logs[i];
    if (
      !log ||
      log.source === 'llm-judge' ||
      log.source === 'system' ||
      log.source === 'combined-judge'
    ) {
      continue;
    }
    const preview = getRunLogResponsePreviewRaw(log);
    if (preview) {
      return formatAgentOutput(preview);
    }
    const err = typeof log.error === 'string' ? log.error.trim() : '';
    if (err) {
      return err;
    }
  }
  return null;
}

function pickJudgeResult(logs: RunLog[]): {
  vulnerable: boolean | null;
  reason: string | null;
} {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const log = logs[i];
    if (log?.source !== 'llm-judge') {
      continue;
    }
    if (log.judgePipeline && log.judgePipeline !== 'single_test') {
      continue;
    }
    const result = log.result;
    if (!result || typeof result !== 'object') {
      continue;
    }
    const vulnerable =
      typeof result.vulnerable === 'boolean'
        ? result.vulnerable
        : result.vulnerable === 'true'
          ? true
          : result.vulnerable === 'false'
            ? false
            : null;
    const reason =
      typeof result.reason === 'string' && result.reason.trim()
        ? result.reason.trim()
        : typeof log.message === 'string' && log.message.trim()
          ? log.message.trim()
          : null;
    return { vulnerable, reason };
  }
  return { vulnerable: null, reason: null };
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
      {children}
    </div>
  );
}

function BodyBlock({
  children,
  className,
  tall,
}: {
  children: ReactNode;
  className?: string;
  tall?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-muted/30 text-foreground/90 overflow-y-auto rounded-lg px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word',
        tall ? 'max-h-[min(42vh,22rem)]' : 'max-h-36',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SingleTestResultCardProps {
  taskId: string;
  tr: Tr;
}

export function SingleTestResultCard({ taskId, tr }: SingleTestResultCardProps) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');

  const { data: task, isLoading, isError, error } = useQuery({
    queryKey: ['attack-tasks', taskId, 'single-test-result'],
    queryFn: () => tasksApi.get(taskId),
    enabled: Boolean(taskId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'pending' ? 2000 : false;
    },
  });

  const metadata = (task?.metadata ?? {}) as Record<string, unknown>;
  const isMultiRound = isMultiRoundTestTask(metadata);
  const transcript = useMemo(() => getMultiRoundTranscript(metadata), [metadata]);
  const roundCount = getMultiRoundTestRoundCount(metadata);
  const prompt = useMemo(() => getSingleTestPrompt(metadata), [metadata]);
  const expectedSuccess = useMemo(() => getSingleTestExpectedSuccess(metadata), [metadata]);
  const logs = useMemo(() => asRunLogs(metadata), [metadata]);
  const agentOutput = useMemo(() => pickAgentOutput(logs), [logs]);
  const judge = useMemo(() => pickJudgeResult(logs), [logs]);
  const sourceLabel = getRunSourceLabel(metadata, isZh);

  const isTerminal =
    task?.status === 'completed' || task?.status === 'failed' || task?.status === 'canceled';
  const isRunning = task?.status === 'running' || task?.status === 'pending';

  if (isLoading) {
    return (
      <div className="w-full space-y-4 rounded-xl border p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !task) {
    return (
      <div className="w-full space-y-4 rounded-xl border p-6">
        <h2 className="text-lg font-semibold">{tr('Result unavailable', '无法加载结果')}</h2>
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : tr('Task not found', '任务不存在')}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate({ to: '/expert-toolbox/dynamic-probe', search: { mode: 'list' } })
          }
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tr('Back to list', '返回列表')}
        </Button>
      </div>
    );
  }

  const verdictTone =
    judge.vulnerable === true
      ? 'risk'
      : judge.vulnerable === false
        ? 'safe'
        : isTerminal
          ? 'neutral'
          : 'pending';

  const title = isMultiRound
    ? tr('Multi-round result', '多轮探测结果')
    : tr('Probe result', '探测结果');

  const newProbeMode =
    metadata.creationMode === 'multi_round_excel_test'
      ? 'multi-round-excel'
      : metadata.creationMode === 'multi_round_test'
        ? 'multi-round'
        : 'single';

  return (
    <div className="w-full overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            <AttackTaskStatusBadge status={task.status} />
            {sourceLabel ? (
              <Badge variant="outline" className="text-[11px] font-normal">
                {sourceLabel}
              </Badge>
            ) : null}
            {isRunning ? (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {tr('Updating…', '自动更新中…')}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground truncate text-xs" title={task.name}>
            {task.name}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({ to: '/expert-toolbox/dynamic-probe', search: { mode: 'list' } })
            }
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {tr('List', '列表')}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              navigate({
                to: '/expert-toolbox/dynamic-probe',
                search: { mode: newProbeMode },
              })
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {tr('New probe', '新建')}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'px-5 py-5',
          verdictTone === 'risk' && 'bg-destructive/6',
          verdictTone === 'safe' && 'bg-emerald-500/7',
          verdictTone === 'neutral' && 'bg-muted/40',
          verdictTone === 'pending' && 'bg-muted/20',
        )}
      >
        {verdictTone === 'pending' ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tr('Waiting for review verdict…', '等待审查结论…')}
          </div>
        ) : verdictTone === 'neutral' ? (
          <div>
            <p className="text-sm font-medium">{tr('No review verdict', '暂无审查结论')}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {tr(
                'The run finished without an LLM judge result.',
                '任务已结束，但未记录到审查模型结论。',
              )}
            </p>
          </div>
        ) : (
          <div className="flex gap-3">
            <div
              className={cn(
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                verdictTone === 'risk'
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
              )}
            >
              {verdictTone === 'risk' ? (
                <ShieldAlert className="h-5 w-5" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={cn(
                    'text-base font-semibold tracking-tight',
                    verdictTone === 'risk'
                      ? 'text-destructive'
                      : 'text-emerald-800 dark:text-emerald-300',
                  )}
                >
                  {verdictTone === 'risk'
                    ? tr('Attack succeeded', '攻击成功')
                    : tr('Attack did not succeed', '攻击未成功')}
                </p>
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                    verdictTone === 'risk'
                      ? 'bg-destructive/15 text-destructive'
                      : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
                  )}
                >
                  {verdictTone === 'risk'
                    ? tr('Matches expectation', '符合成功预期')
                    : tr('Does not match', '未达成功预期')}
                </span>
              </div>
              {judge.reason ? (
                <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-wrap">
                  {judge.reason}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-5 px-5 py-5">
        {isMultiRound && transcript.length > 0 ? (
          <>
            <section>
              <SectionLabel>
                <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                  <Target className="h-3.5 w-3.5" />
                  {tr('Expected success', '攻击成功预期')}
                </span>
              </SectionLabel>
              <BodyBlock>
                {expectedSuccess || (
                  <span className="text-muted-foreground">{tr('Not provided', '未填写')}</span>
                )}
              </BodyBlock>
            </section>

            <section>
              <SectionLabel>
                <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                  <MessageSquareText className="h-3.5 w-3.5" />
                  {tr(
                    `Conversation${roundCount ? ` · ${roundCount} rounds` : ''}`,
                    `多轮对话${roundCount ? ` · ${roundCount} 轮` : ''}`,
                  )}
                </span>
              </SectionLabel>
              <div className="max-h-[min(52vh,28rem)] space-y-2.5 overflow-y-auto">
                {(() => {
                  let round = 0;
                  return transcript.map((msg, idx) => {
                    if (msg.role === 'user') {
                      round += 1;
                    }
                    const label =
                      msg.role === 'user'
                        ? tr(`Round ${round} · Instruction`, `第 ${round} 轮 · 测试指令`)
                        : tr(`Round ${round} · Agent`, `第 ${round} 轮 · 智能体回复`);
                    return (
                      <div
                        key={`${msg.role}-${idx}`}
                        className={cn(
                          'rounded-lg border px-3.5 py-3 text-sm leading-relaxed',
                          msg.role === 'user' ? 'border-primary/20 bg-primary/5' : 'bg-muted/30',
                        )}
                      >
                        <p className="text-muted-foreground mb-1.5 text-[11px] font-medium">
                          {label}
                        </p>
                        <div className="whitespace-pre-wrap wrap-break-word">{msg.content}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <section>
                <SectionLabel>
                  <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                    <MessageSquareText className="h-3.5 w-3.5" />
                    {tr('Test instruction', '测试指令')}
                  </span>
                </SectionLabel>
                <BodyBlock>{prompt || task.description || '—'}</BodyBlock>
              </section>
              <section>
                <SectionLabel>
                  <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                    <Target className="h-3.5 w-3.5" />
                    {tr('Expected success', '攻击成功预期')}
                  </span>
                </SectionLabel>
                <BodyBlock>
                  {expectedSuccess || (
                    <span className="text-muted-foreground">
                      {tr('Not provided', '未填写')}
                    </span>
                  )}
                </BodyBlock>
              </section>
            </div>

            <section>
              <SectionLabel>
                <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                  {tr('Agent output', 'Agent 输出')}
                </span>
              </SectionLabel>
              {agentOutput ? (
                <BodyBlock tall className="border border-border/60 bg-background">
                  {agentOutput}
                </BodyBlock>
              ) : (
                <div className="text-muted-foreground rounded-lg border border-dashed px-3.5 py-8 text-center text-sm">
                  {isRunning
                    ? tr('Waiting for agent response…', '等待智能体响应…')
                    : tr('No agent response recorded.', '未记录到智能体响应。')}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
