/**
 * Multi-round test setup: agents + overall expected success + review model (Asset Management).
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Check, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { MAX_AGENTS_PER_BATCH } from '@/features/tasks/components/task-wizard-agent-target';
import {
  ensureTargetAgentsFromAssets,
  formatAssetAgentOptionLabel,
  hasAssetRuntimeEndpoint,
  mapAssetToTargetAgentType,
} from '@/features/tasks/ensure-target-agent-from-asset';
import { cn } from '@/lib/utils';
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import { assetIntakeApi } from '@/services/api/asset-intake';

type Tr = (en: string, zh: string) => string;

interface MultiRoundTestSetupProps {
  tr: Tr;
}

export function MultiRoundTestSetup({ tr }: MultiRoundTestSetupProps) {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expectedSuccess, setExpectedSuccess] = useState('');
  const [judgeModel, setJudgeModel] = useState('');
  const [starting, setStarting] = useState(false);

  const { modelOptions, isLoading: modelsLoading } = useLlmModelOptions();

  useEffect(() => {
    if (!judgeModel && modelOptions.length > 0) {
      setJudgeModel(modelOptions[0].value);
    }
  }, [judgeModel, modelOptions]);

  const { data: agentsPage, isLoading } = useQuery({
    queryKey: ['asset-agents', 'multi-round-test'],
    queryFn: () => assetIntakeApi.listAgents({ limit: 200 }),
  });
  const agents = useMemo(
    () => (agentsPage?.data ?? []).filter((asset) => hasAssetRuntimeEndpoint(asset)),
    [agentsPage?.data],
  );

  const selectedAgents = useMemo(
    () => agents.filter((a) => selectedIds.includes(a.id)),
    [agents, selectedIds],
  );

  const toggleAgent = (agentId: string) => {
    setSelectedIds((cur) => {
      if (cur.includes(agentId)) {
        return cur.filter((id) => id !== agentId);
      }
      if (cur.length >= MAX_AGENTS_PER_BATCH) {
        return cur;
      }
      return [...cur, agentId];
    });
  };

  const startTest = async () => {
    if (selectedAgents.length === 0) {
      toast.error(tr('Select at least one agent', '请至少选择一个智能体'));
      return;
    }
    const trimmedExpected = expectedSuccess.trim();
    if (!trimmedExpected) {
      toast.error(tr('Enter expected success behavior', '请填写攻击成功预期表现'));
      return;
    }
    if (!judgeModel.trim()) {
      toast.error(tr('Select a review model', '请选择审查模型'));
      return;
    }
    setStarting(true);
    try {
      const targets = await ensureTargetAgentsFromAssets(selectedAgents);
      navigate({
        to: '/tasks/single-test/multi-round',
        search: {
          agents: targets.map((t) => t.id).join(','),
          expectedSuccess: trimmedExpected,
          judgeModel: judgeModel.trim(),
        },
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : tr('Failed to start', '启动失败'));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base">{tr('Multi-round test', '多轮测试')}</CardTitle>
        <CardDescription className="text-sm leading-snug">
          {tr(
            'Pick agents and an overall success goal, then chat in rounds. Review uses your expectation.',
            '选择智能体并设定整体攻击成功预期，再进行多轮对话；审查将对照该预期判定。',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>{tr('Target agents', '目标智能体')}</Label>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <button
                type="button"
                className="hover:text-foreground disabled:opacity-40"
                disabled={isLoading || agents.length === 0}
                onClick={() =>
                  setSelectedIds(agents.slice(0, MAX_AGENTS_PER_BATCH).map((a) => a.id))
                }
              >
                {tr('Select all', '全选')}
              </button>
              <span aria-hidden>·</span>
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => setSelectedIds([])}
              >
                {tr('Clear', '清空')}
              </button>
              <span className="tabular-nums">
                {selectedIds.length}/{MAX_AGENTS_PER_BATCH}
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              {tr('No agents with API access.', '暂无已配置 API 的智能体，请先在')}{' '}
              <Link to="/assets/ledger" className="text-primary underline">
                {tr('Asset Management', '资产管理')}
              </Link>
            </div>
          ) : (
            <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
              {agents.map((agent) => {
                const checked = selectedIds.includes(agent.id);
                const atMax = !checked && selectedIds.length >= MAX_AGENTS_PER_BATCH;
                const meta =
                  formatAssetAgentOptionLabel(agent).replace(`${agent.name} · `, '') ||
                  mapAssetToTargetAgentType(agent).toUpperCase();
                return (
                  <button
                    key={agent.id}
                    type="button"
                    disabled={atMax}
                    onClick={() => toggleAgent(agent.id)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      checked
                        ? 'border-primary/50 bg-primary/5'
                        : 'hover:bg-muted/40',
                      atMax && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/30',
                      )}
                    >
                      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium leading-tight">
                        {agent.name}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                        {meta}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-1.5">
          <Label htmlFor="multi-round-expected">
            {tr('Overall expected attack-success', '整体攻击成功预期')}
          </Label>
          <Textarea
            id="multi-round-expected"
            className="min-h-24 resize-y field-sizing-fixed"
            placeholder={tr(
              'Goal across the whole conversation, e.g. eventually obtains admin data after multi-round probing…',
              '覆盖整段多轮对话的成功目标，例如：多轮诱导后最终套取管理员信息…',
            )}
            value={expectedSuccess}
            onChange={(e) => setExpectedSuccess(e.target.value)}
          />
          <p className="text-muted-foreground text-xs leading-snug">
            {tr(
              'Used once at the end to judge the full transcript against this goal.',
              '对话结束后，审查模型将对照该目标判定完整对话是否攻击成功。',
            )}
          </p>
        </section>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full space-y-1.5 sm:max-w-xs">
            <Label htmlFor="multi-round-judge">{tr('Review model', '审查模型')}</Label>
            {modelsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={judgeModel} onValueChange={setJudgeModel}>
                <SelectTrigger id="multi-round-judge" className="w-full">
                  <SelectValue placeholder={tr('Select model…', '选择模型…')} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button
            type="button"
            className="sm:shrink-0"
            disabled={selectedIds.length === 0 || starting}
            onClick={() => void startTest()}
          >
            {starting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {tr('Start chat', '开始对话')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
