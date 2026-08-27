/**
 * Single-test create form: ledger asset + instruction + expected success → API probe + LLM judge.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, Play } from 'lucide-react';
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
import { markAttackTaskRunJustStarted } from '@/features/tasks/active-run-session';
import {
  ensureTargetAgentFromAsset,
  formatAssetAgentOptionLabel,
  hasAssetRuntimeEndpoint,
  platformFamilyFromAsset,
} from '@/features/tasks/ensure-target-agent-from-asset';
import { resolveV4ForSingleTest } from '@/features/tasks/single-test-shared';
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import { assetIntakeApi } from '@/services/api/asset-intake';
import { tasksApi } from '@/services/api/tasks';
import type { CreateAttackTaskRequest } from '@/types/api';

type Tr = (en: string, zh: string) => string;

interface SingleTestFormProps {
  tr: Tr;
  isZh: boolean;
}

export function SingleTestForm({ tr, isZh }: SingleTestFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [assetId, setAssetId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [expectedSuccess, setExpectedSuccess] = useState('');
  const [judgeModel, setJudgeModel] = useState('');

  const { modelOptions, isLoading: modelsLoading } = useLlmModelOptions();

  useEffect(() => {
    if (!judgeModel && modelOptions.length > 0) {
      setJudgeModel(modelOptions[0].value);
    }
  }, [judgeModel, modelOptions]);

  const { data: agentsPage, isLoading: agentsLoading } = useQuery({
    queryKey: ['asset-agents', 'single-test'],
    queryFn: () => assetIntakeApi.listAgents({ limit: 200 }),
  });
  const agents = useMemo(
    () => (agentsPage?.data ?? []).filter((asset) => hasAssetRuntimeEndpoint(asset)),
    [agentsPage?.data],
  );

  const selectedAsset = useMemo(
    () => agents.find((a) => a.id === assetId),
    [agents, assetId],
  );

  const { data: taskTypes = [] } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => tasksApi.listTaskTypes(),
    staleTime: 5 * 60 * 1000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!assetId || !selectedAsset) {
        throw new Error(tr('Select a target agent', '请选择目标智能体'));
      }
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        throw new Error(tr('Enter a test instruction', '请填写测试指令'));
      }
      const trimmedExpected = expectedSuccess.trim();
      if (!trimmedExpected) {
        throw new Error(
          tr('Enter expected success behavior', '请填写攻击成功预期表现'),
        );
      }
      if (!judgeModel.trim()) {
        throw new Error(tr('Select a review model', '请选择审查模型'));
      }
      const targetAgent = await ensureTargetAgentFromAsset(selectedAsset);
      const pf = platformFamilyFromAsset(selectedAsset);
      const v4 = resolveV4ForSingleTest(taskTypes, pf);
      const taskName = `${tr('Single test', '单次测试')} — ${selectedAsset.name} — ${new Date().toLocaleString(isZh ? 'zh-CN' : 'en-US')}`;

      const payload: CreateAttackTaskRequest = {
        name: taskName,
        description: trimmedPrompt.slice(0, 500),
        targetType: 'agent',
        targetConfig: { agentId: targetAgent.id },
        vulnerabilities: [],
        attackMode: 'simple',
        platformFamily: v4.platformFamily,
        scanMode: 'runtime',
        ...(v4.taskTypeId ? { taskTypeId: v4.taskTypeId } : {}),
        detectionConfig: {
          useRule: true,
          useLLM: true,
          useKnowledgeBase: false,
          llmConfig: {
            model: judgeModel.trim(),
            successDescription: trimmedExpected,
          },
        },
        metadata: {
          taskKind: 'single_test',
          runSource: 'single',
          creationMode: 'single_test',
          sourceAssetId: selectedAsset.id,
          sourceAssetCode: selectedAsset.assetCode,
          singleTest: {
            prompt: trimmedPrompt,
            expectedSuccess: trimmedExpected,
            judgeModel: judgeModel.trim(),
          },
        },
      };

      const task = await tasksApi.create(payload);
      await tasksApi.run({ taskId: task.id });
      return task;
    },
    onSuccess: (task) => {
      markAttackTaskRunJustStarted(task.id);
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['attack-tasks', 'single-test-list'] });
      queryClient.invalidateQueries({ queryKey: ['asset-agents'] });
      toast.success(tr('Single test started', '单次测试已启动'));
      navigate({
        to: '/expert-toolbox/dynamic-probe',
        search: { mode: 'result', taskId: task.id },
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base">{tr('Run single test', '执行单次测试')}</CardTitle>
        <CardDescription className="text-sm leading-snug">
          {tr(
            'Send one probe; the review model checks the reply against your expected success.',
            '发送一次探测；审查模型对照「攻击成功预期」判定回复。',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Target + model: agent takes remaining space, model stays compact */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="single-test-agent">{tr('Target agent', '目标智能体')}</Label>
            <Select value={assetId} onValueChange={setAssetId} disabled={agentsLoading}>
              <SelectTrigger id="single-test-agent" className="w-full">
                <SelectValue placeholder={tr('Select agent…', '选择智能体…')} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {formatAssetAgentOptionLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!agentsLoading && agents.length === 0 ? (
              <p className="text-muted-foreground text-xs leading-snug">
                {tr('No agents with API access.', '暂无已配置 API 的智能体，请先在')}
                {isZh ? (
                  <>
                    <Link to="/assets/ledger" className="mx-1 text-primary underline">
                      资产管理
                    </Link>
                    补充。
                  </>
                ) : (
                  <>
                    {' '}
                    <Link to="/assets/ledger" className="text-primary underline">
                      Asset Management
                    </Link>
                    .
                  </>
                )}
              </p>
            ) : null}
          </div>
          <div className="w-full space-y-1.5 sm:w-56 sm:shrink-0">
            <Label htmlFor="single-test-judge">{tr('Review model', '审查模型')}</Label>
            {modelsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={judgeModel} onValueChange={setJudgeModel}>
                <SelectTrigger id="single-test-judge" className="w-full">
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="single-test-prompt">{tr('Test instruction', '测试指令')}</Label>
          <Textarea
            id="single-test-prompt"
            className="min-h-24 resize-y field-sizing-fixed"
            placeholder={tr(
              'Prompt sent to the agent…',
              '发送给智能体的探测指令…',
            )}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="single-test-expected">
            {tr('Expected attack-success behavior', '攻击成功预期表现')}
          </Label>
          <Textarea
            id="single-test-expected"
            className="min-h-20 resize-y field-sizing-fixed"
            placeholder={tr(
              'e.g. returns a secret, confirms unauthorized access…',
              '例如：返回敏感信息、确认越权操作…',
            )}
            value={expectedSuccess}
            onChange={(e) => setExpectedSuccess(e.target.value)}
          />
          <p className="text-muted-foreground text-xs leading-snug">
            {tr(
              'A match with agent output counts as attack success.',
              '与 Agent 输出相符即判定为攻击成功。',
            )}
          </p>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="button"
            disabled={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {tr('Submit & run', '提交并运行')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
