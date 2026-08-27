/**
 * Multi-round Excel batch test: download template, upload instructions, submit for review.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Check, Download, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { markAttackTaskRunJustStarted } from '@/features/tasks/active-run-session';
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
import { singleTestMultiRoundExcelApi } from '@/services/api/single-test-multi-round-excel';

type Tr = (en: string, zh: string) => string;

interface MultiRoundExcelTestSetupProps {
  tr: Tr;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function MultiRoundExcelTestSetup({ tr }: MultiRoundExcelTestSetupProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [judgeModel, setJudgeModel] = useState('');
  const [batchName, setBatchName] = useState('');
  const [downloading, setDownloading] = useState(false);

  const { data: agentsPage, isLoading } = useQuery({
    queryKey: ['asset-agents', 'multi-round-excel-test'],
    queryFn: () => assetIntakeApi.listAgents({ limit: 200 }),
  });
  const agents = useMemo(
    () => (agentsPage?.data ?? []).filter((asset) => hasAssetRuntimeEndpoint(asset)),
    [agentsPage?.data],
  );

  const { modelOptions: availableModels, isLoading: modelsLoading } = useLlmModelOptions();

  const modelOptions = useMemo(() => {
    if (availableModels.length > 0) {
      return availableModels;
    }
    return [
      { value: 'gpt-4', label: 'GPT-4' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
    ];
  }, [availableModels]);

  useEffect(() => {
    if (!judgeModel && modelOptions.length > 0) {
      setJudgeModel(modelOptions[0].value);
    }
  }, [judgeModel, modelOptions]);

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

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const blob = await singleTestMultiRoundExcelApi.downloadTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'multi-round-test-instructions.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(tr('Template downloaded', '模板已下载'));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : tr('Download failed', '下载失败'));
    } finally {
      setDownloading(false);
    }
  };

  const onFileSelected = (next: File | undefined) => {
    if (!next) {
      return;
    }
    if (!/\.xlsx$/i.test(next.name)) {
      toast.error(tr('Please choose a .xlsx file', '请选择 .xlsx 文件'));
      return;
    }
    if (next.size > MAX_FILE_BYTES) {
      toast.error(
        tr(
          `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
          `文件过大（最大 ${MAX_FILE_BYTES / 1024 / 1024} MB）`,
        ),
      );
      return;
    }
    setFile(next);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error(tr('Upload an Excel file', '请上传 Excel 文件'));
      }
      if (selectedAgents.length === 0) {
        throw new Error(tr('Select at least one agent', '请至少选择一个智能体'));
      }
      if (!judgeModel.trim()) {
        throw new Error(tr('Select a review model', '请选择审查模型'));
      }
      const targets = await ensureTargetAgentsFromAssets(selectedAgents);
      return singleTestMultiRoundExcelApi.submitExcel({
        file,
        agentIds: targets.map((t) => t.id),
        judgeModel: judgeModel.trim(),
        batchName: batchName.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      for (const task of data.tasks) {
        markAttackTaskRunJustStarted(task.taskId);
      }
      void queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['single-test-tasks'] });

      const failedTotal = Object.values(data.failedRoundsByAgent).reduce((a, b) => a + b, 0);
      if (failedTotal > 0) {
        toast.warning(
          tr(
            `Submitted ${data.tasks.length} task(s); ${failedTotal} agent round(s) had request errors (still recorded).`,
            `已提交 ${data.tasks.length} 个任务；有 ${failedTotal} 轮智能体请求失败（已写入对话记录）。`,
          ),
        );
      } else {
        toast.success(
          tr(
            `Submitted ${data.tasks.length} task(s) with ${data.instructionCount} instruction(s) each.`,
            `已提交 ${data.tasks.length} 个任务，每个智能体 ${data.instructionCount} 条指令。`,
          ),
        );
      }

      if (data.tasks.length === 1) {
        navigate({
          to: '/expert-toolbox/dynamic-probe',
          search: { mode: 'result', taskId: data.tasks[0].taskId },
        });
      } else {
        navigate({ to: '/expert-toolbox/dynamic-probe', search: { mode: 'list' } });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base">{tr('Excel batch', 'Excel 批量')}</CardTitle>
        <CardDescription className="text-sm leading-snug">
          {tr(
            'Upload Excel with instructions and expected success, pick agents and a review model. Each agent runs the rounds in order, then goes to review.',
            '上传含指令与攻击成功预期的 Excel，选择智能体与审查模型后提交；每个智能体按顺序执行，再进入审查。',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <Label>{tr('Excel file', 'Excel 文件')}</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={downloading}
              onClick={() => void downloadTemplate()}
            >
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {tr('Download template', '下载模板')}
            </Button>
            <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5">
              <input
                id="multi-round-excel-file"
                type="file"
                accept=".xlsx"
                className="sr-only"
                onChange={(e) => onFileSelected(e.target.files?.[0])}
              />
              <Label
                htmlFor="multi-round-excel-file"
                className="text-primary hover:underline shrink-0 cursor-pointer text-sm font-medium"
              >
                <Upload className="mr-1 inline h-4 w-4" />
                {tr('Choose file', '选择文件')}
              </Label>
              <span className="text-muted-foreground truncate text-sm">
                {file?.name || tr('No file chosen', '未选择文件')}
              </span>
            </div>
          </div>
          <p className="text-muted-foreground text-xs leading-snug">
            {tr(
              'Columns: 轮次 (optional), 测试指令 (required), 攻击成功预期 (required, fill once on first row). Up to 100 rows, 20 agents.',
              '列：轮次（可选）、测试指令（必填）、攻击成功预期（必填，建议首行填写一次）。最多 100 行指令、20 个智能体。',
            )}
          </p>
        </section>

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
          <Label htmlFor="excel-batch-name">{tr('Batch name (optional)', '批次名称（可选）')}</Label>
          <Input
            id="excel-batch-name"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder={tr('e.g. Q2 red-team batch', '例如：二季度红队批次')}
          />
        </section>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full space-y-1.5 sm:max-w-xs">
            <Label htmlFor="multi-round-excel-judge">{tr('Review model', '审查模型')}</Label>
            {modelsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={judgeModel} onValueChange={setJudgeModel}>
                <SelectTrigger id="multi-round-excel-judge" className="w-full">
                  <SelectValue placeholder={tr('Select model…', '选择模型…')} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button
            type="button"
            className="sm:shrink-0"
            disabled={
              submitMutation.isPending ||
              !file ||
              selectedIds.length === 0 ||
              !judgeModel.trim()
            }
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            {submitMutation.isPending
              ? tr('Running…', '执行中…')
              : tr('Submit for review', '提交审核')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
