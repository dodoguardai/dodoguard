import { useEffect, useMemo, useState } from 'react';

import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { XIcon, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type ConfigNodeLabelContext,
  configNodeLabelFromHit,
  RuleHitsLocationPanel,
  YamlLineViewer,
} from '@/components/rule-hits-location';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  clearAttackTaskActiveRunMark,
  shouldFastPollAfterRunStart,
} from '@/features/tasks/active-run-session';
import { AttackTaskStatusBadge } from '@/features/tasks/attack-task-status-badge';
import { parseTaskDetectionConfig } from '@/features/tasks/parse-task-detection-config';
import {
  formatRunLogTableMessage,
  getRunLogTableCellTitle,
  resolveRunLogResponsePreviewForDetail,
} from '@/features/tasks/run-log-table-message';
import { parseTaskRunProgress } from '@/features/tasks/task-run-progress';
import {
  getMultiRoundTestRoundCount,
  getRunSourceLabel,
  getSingleTestExpectedSuccess,
  getSingleTestPrompt,
  isMultiRoundTestTask,
  isSingleTestTask,
} from '@/features/tasks/run-source-label';
import {
  getAttackTaskTypeLabel,
  getGenerateReportMenuLabel,
  getReportKindForLabels,
} from '@/features/tasks/task-type-label';
import { formatTestingModeLabel } from '@/features/tasks/testing-mode-label';
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import { agentsApi } from '@/services/api/agents';
import { cozeConfigAuditApi } from '@/services/api/coze-config-audit';
import { difyConfigAuditApi } from '@/services/api/dify-config-audit';
import { fastgptConfigAuditApi } from '@/services/api/fastgpt-config-audit';
import { findingsApi } from '@/services/api/findings';
import { organizationsApi } from '@/services/api/organizations';
import { tasksApi } from '@/services/api/tasks';
import { usersApi } from '@/services/api/users';
import { vulnerabilitiesApi } from '@/services/api/vulnerabilities';
import { parseCozePreview } from '@/util/cozeResponsePreview';
import { TaskEdit } from './task-edit';
import type {
  AttackCommand,
  AttackTask,
  Finding,
  FindingDetectionRuleResult,
} from '@/types/entities';

/** Decode Coze v2 JSON stored in `responsePreview` so the dialog matches assistant text, not raw `msg`. */
function formatRunLogResponseTextForDialog(raw: string): string {
  const t = raw.trim();
  if (!t) {
    return raw;
  }
  if (t.startsWith('{') && t.includes('"messages"')) {
    const p = parseCozePreview(t).trim();
    if (p && p !== '—') {
      return p;
    }
  }
  return raw;
}

interface TaskDetailProps {
  taskId: string;
}

export function TaskDetail({ taskId }: TaskDetailProps) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
  const [showOnlyVulnerable, setShowOnlyVulnerable] = useState(false);
  const [configNodeHitDetail, setConfigNodeHitDetail] = useState<FindingDetectionRuleResult | null>(
    null,
  );

  const {
    data: task,
    isLoading,
    error,
  } = useQuery<AttackTask>({
    queryKey: ['attack-task', taskId],
    queryFn: () => tasksApi.get(taskId),
    // Avoid wiping optimistic `running` from cache on first paint right after POST /run.
    refetchOnMount: () => !shouldFastPollAfterRunStart(taskId),
    // Auto-refresh while task is queued or running so metadata.runLogs stay current.
    // After POST /run, poll faster briefly so a short `running` window is visible before `completed`.
    refetchInterval: (query) => {
      if (shouldFastPollAfterRunStart(taskId)) {
        return 700;
      }
      const current = query.state.data as AttackTask | undefined;
      if (!current) {
        return false;
      }
      return current.status === 'pending' || current.status === 'running' ? 2500 : false;
    },
  });

  useEffect(() => {
    if (!task) {
      return;
    }
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'canceled') {
      clearAttackTaskActiveRunMark(taskId);
    }
  }, [task?.status, taskId]);

  const { data: taskTypes = [] } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => tasksApi.listTaskTypes(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: organization } = useQuery({
    queryKey: ['organization', task?.organizationId],
    queryFn: () => organizationsApi.get(task!.organizationId),
    enabled: Boolean(task?.organizationId),
  });

  const { data: taskOwner } = useQuery({
    queryKey: ['user', task?.userId],
    queryFn: () => usersApi.get(task!.userId),
    enabled: Boolean(task?.userId),
  });

  const targetAgentId =
    task?.targetType === 'agent' &&
    task.targetConfig &&
    typeof (task.targetConfig as { agentId?: unknown }).agentId === 'string'
      ? (task.targetConfig as { agentId: string }).agentId
      : undefined;

  const runProgress = task ? parseTaskRunProgress(task.metadata) : undefined;

  const { data: targetAgent } = useQuery({
    queryKey: ['target-agents', targetAgentId],
    queryFn: () => agentsApi.get(targetAgentId!),
    enabled: Boolean(targetAgentId),
  });

  const { modelOptions } = useLlmModelOptions();

  const { data: vulnerabilitiesData } = useQuery({
    queryKey: ['vulnerabilities', 'for-task-detail'],
    queryFn: () => vulnerabilitiesApi.list({ limit: 1000 }),
  });

  const metadata: any = task?.metadata || {};
  const singleTestPrompt = useMemo(
    () => getSingleTestPrompt(metadata as Record<string, unknown>),
    [metadata],
  );
  const singleTestExpectedSuccess = useMemo(
    () => getSingleTestExpectedSuccess(metadata as Record<string, unknown>),
    [metadata],
  );
  const isMultiRoundTest = isMultiRoundTestTask(metadata as Record<string, unknown>);
  const multiRoundTranscript = useMemo(() => {
    const mrt = metadata?.multiRoundTest;
    if (!mrt || typeof mrt !== 'object' || !Array.isArray(mrt.transcript)) {
      return [] as Array<{ role: 'user' | 'assistant'; content: string }>;
    }
    return mrt.transcript.filter(
      (m: unknown) =>
        m &&
        typeof m === 'object' &&
        (m as { role?: string }).role &&
        typeof (m as { content?: unknown }).content === 'string',
    ) as Array<{ role: 'user' | 'assistant'; content: string }>;
  }, [metadata]);
  const multiRoundRoundCount = getMultiRoundTestRoundCount(metadata as Record<string, unknown>);
  const metadataTaskKind = metadata.taskKind as
    | 'api_test'
    | 'config_audit'
    | 'config_static'
    | undefined;
  const detectionParsed = useMemo(
    () => parseTaskDetectionConfig(task?.detectionConfig),
    [task?.detectionConfig],
  );
  const llmModelDisplay = useMemo(() => {
    const id = detectionParsed.llmConfig?.model?.trim();
    if (!id) {
      return null;
    }
    return modelOptions.find((o) => o.value === id)?.label ?? id;
  }, [detectionParsed.llmConfig?.model, modelOptions]);
  const runLogs: any[] = Array.isArray(metadata.runLogs) ? metadata.runLogs : [];
  const configAuditYaml = (() => {
    if (!metadata.configAudit || typeof metadata.configAudit !== 'object') {
      return '';
    }
    const cfg = metadata.configAudit as { yaml?: string; json?: string };
    const isFastgptPlatform = String(task?.platformFamily ?? '').toLowerCase() === 'fastgpt';
    return String(isFastgptPlatform ? cfg.json || '' : cfg.yaml || '').trim();
  })();

  const attackCommandLogs = useMemo(
    () => runLogs.filter((log) => log.source === 'attack-command'),
    [runLogs],
  );
  const difyLogs = useMemo(
    () =>
      runLogs.filter(
        (log) =>
          log.source === 'dify' ||
          log.source === 'coze' ||
          log.source === 'fastgpt' ||
          log.source === 'n8n' ||
          log.source === 'tencent-adp' ||
          log.source === 'api' ||
          log.source === 'langchain',
      ),
    [runLogs],
  );

  const { data: taskFindingsData } = useQuery({
    queryKey: ['findings', 'task-detail', taskId],
    queryFn: () => findingsApi.list({ taskId, limit: 1000 }),
    enabled: Boolean(taskId),
  });

  const taskFindings = useMemo(
    () => (taskFindingsData?.data ?? []) as Finding[],
    [taskFindingsData],
  );

  const needsDslStructureForHits = useMemo(
    () =>
      configAuditYaml.length > 60 &&
      taskFindings.some((f) => (f.detectionSummary?.ruleResults?.length ?? 0) > 0),
    [configAuditYaml.length, taskFindings],
  );

  const taskStructureApiKind = useMemo((): 'coze' | 'fastgpt' | 'dify' => {
    const pf = String(task?.platformFamily ?? '').toLowerCase();
    if (pf === 'coze') {
      return 'coze';
    }
    if (pf === 'fastgpt') {
      return 'fastgpt';
    }
    return 'dify';
  }, [task?.platformFamily]);

  const { data: dslStructureData } = useQuery({
    queryKey: [
      taskStructureApiKind === 'coze'
        ? 'coze-structure'
        : taskStructureApiKind === 'fastgpt'
          ? 'fastgpt-structure'
          : 'dify-structure',
      'task-detail',
      taskId,
      configAuditYaml.length,
    ],
    queryFn: () =>
      taskStructureApiKind === 'coze'
        ? cozeConfigAuditApi.structure({ yaml: configAuditYaml })
        : taskStructureApiKind === 'fastgpt'
          ? fastgptConfigAuditApi.structure({ json: configAuditYaml })
          : difyConfigAuditApi.structure({ yaml: configAuditYaml }),
    enabled: Boolean(taskId && needsDslStructureForHits),
    staleTime: 5 * 60 * 1000,
  });

  const ruleHitNodeLabelCtx: ConfigNodeLabelContext | undefined = useMemo(() => {
    const nodes = dslStructureData?.inventory?.nodes;
    if (!nodes?.length || !configAuditYaml.trim()) {
      return undefined;
    }
    return { structureYaml: configAuditYaml, structureNodes: nodes };
  }, [dslStructureData?.inventory?.nodes, configAuditYaml]);

  const filteredFindings = useMemo(() => {
    if (!showOnlyVulnerable) {
      return taskFindings;
    }
    return taskFindings.filter((finding) => finding.finalVerdict?.vulnerable === true);
  }, [taskFindings, showOnlyVulnerable]);

  const stats = useMemo(
    () => ({
      totalRequests: difyLogs.length,
      attackCommands: attackCommandLogs.length,
      llmJudgments: taskFindings.length,
      vulnerableCount: taskFindings.filter((finding) => finding.finalVerdict?.vulnerable === true)
        .length,
    }),
    [attackCommandLogs.length, difyLogs.length, taskFindings],
  );

  const allVulnerabilities = vulnerabilitiesData?.data || [];
  const taskVulnerabilities = useMemo(
    () =>
      allVulnerabilities.filter((v: any) =>
        Array.isArray(task?.vulnerabilities) ? task.vulnerabilities.includes(v.id) : false,
      ),
    [allVulnerabilities, task?.vulnerabilities],
  );

  const attackCommandQueries = useQueries({
    queries: taskVulnerabilities.map((v: { id: string }) => ({
      queryKey: ['vulnerability', v.id, 'attack-commands', 'task-detail'],
      queryFn: () => vulnerabilitiesApi.getAttackCommands(v.id),
      enabled: taskVulnerabilities.length > 0,
      staleTime: 60_000,
    })),
  });

  /** Sum of enabled attack commands across selected vulnerabilities (same basis as per-vuln rows). */
  const configuredAttackCommandsTotal = attackCommandQueries.reduce((sum, q) => {
    const data = (q.data ?? []) as AttackCommand[];
    return sum + data.filter((c) => c.enabled !== false).length;
  }, 0);
  const isAttackCommandConfigLoading = attackCommandQueries.some((q) => q.isPending);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">{tr('Loading task details...', '正在加载任务详情...')}</div>;
  }

  if (error || !task) {
    return <div className="p-4 text-sm text-destructive">{tr('Failed to load task details.', '加载任务详情失败。')}</div>;
  }

  if (isEditing) {
    return (
      <div className="container mx-auto py-8">
        <div className="mb-4 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
            {tr('Cancel editing', '取消编辑')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/tasks', search: { surface: 'all', status: 'all' } })}
          >
            {tr('Back to tasks', '返回任务列表')}
          </Button>
        </div>
        <TaskEdit
          taskId={taskId}
          onCancel={() => setIsEditing(false)}
          onSuccess={() => {
            setIsEditing(false);
            navigate({ to: '/tasks', search: { surface: 'all', status: 'all' } });
          }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{task.name}</h1>
          {task.description && (
            <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {tr('Target', '目标')}: <Badge variant="outline">{task.targetType}</Badge>
            </span>
            <span>
              {tr('Testing mode', '测试模式')}:{' '}
              <Badge variant="secondary">{formatTestingModeLabel(task.attackMode)}</Badge>
            </span>
            <span>
              {tr('Type', '类型')}: <Badge variant="outline">{getAttackTaskTypeLabel(task, taskTypes)}</Badge>
            </span>
            {getRunSourceLabel(task.metadata as Record<string, unknown>, isZh) ? (
              <span>
                {tr('Source', '来源')}:{' '}
                <Badge variant="outline">
                  {getRunSourceLabel(task.metadata as Record<string, unknown>, isZh)}
                </Badge>
              </span>
            ) : null}
            <span>
              {task.vulnerabilities.length} {tr('vulnerabilities', '个漏洞')}
            </span>
            {task.createdAt && (
              <span>
                {tr('Created', '创建于')} {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(task.status === 'completed' || task.status === 'failed') && (
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/reports"
                search={{ taskId: task.id }}
              >
                <FileText className="mr-2 h-4 w-4" />
                {getGenerateReportMenuLabel(
                  getReportKindForLabels(task.metadata as Record<string, unknown>),
                )}
              </Link>
            </Button>
          )}
          <Button variant="default" size="sm" onClick={() => setIsEditing(true)}>
            {tr('Edit Task', '编辑任务')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              isSingleTestTask(task.metadata as Record<string, unknown>)
                ? navigate({ to: '/expert-toolbox/dynamic-probe', search: { mode: 'list' } })
                : navigate({ to: '/tasks', search: { surface: 'all', status: 'all' } })
            }
          >
            {isSingleTestTask(task.metadata as Record<string, unknown>)
              ? tr('Back to single tests', '返回单次测试')
              : tr('Back to tasks', '返回任务列表')}
          </Button>
        </div>
      </div>

      {singleTestPrompt && !isMultiRoundTest ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{tr('Test instruction', '测试指令')}</CardTitle>
            <CardDescription>
              {tr(
                'User-entered prompt sent to the target agent for this single test.',
                '单次测试中用户输入并发送给目标智能体的探测指令。',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="max-h-[min(40vh,320px)] overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono text-sm leading-relaxed">
              {singleTestPrompt}
            </pre>
            {singleTestExpectedSuccess ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {tr('Expected attack-success behavior', '攻击成功预期表现')}
                </div>
                <p className="text-muted-foreground text-xs">
                  {tr(
                    'Used by the review model to decide whether the agent output matches a successful attack.',
                    '审查模型据此判断 Agent 输出是否构成攻击成功。',
                  )}
                </p>
                <pre className="max-h-[min(30vh,240px)] overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono text-sm leading-relaxed">
                  {singleTestExpectedSuccess}
                </pre>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isMultiRoundTest && multiRoundTranscript.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {tr('Multi-round conversation', '多轮对话记录')}
            </CardTitle>
            <CardDescription>
              {tr(
                `Interactive test transcript${multiRoundRoundCount ? ` (${multiRoundRoundCount} rounds)` : ''}.`,
                `交互式多轮测试完整对话${multiRoundRoundCount ? `（${multiRoundRoundCount} 轮）` : ''}。`,
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              let round = 0;
              return multiRoundTranscript.map((msg, idx) => {
                if (msg.role === 'user') {
                  round += 1;
                }
                const label =
                  msg.role === 'user'
                    ? tr(`Round ${round} · You`, `第 ${round} 轮 · 测试指令`)
                    : tr(`Round ${round} · Agent`, `第 ${round} 轮 · 智能体回复`);
                return (
                  <div
                    key={`${msg.role}-${idx}`}
                    className={`rounded-md border p-3 text-sm ${
                      msg.role === 'user' ? 'bg-primary/5' : 'bg-muted/30'
                    }`}
                  >
                    <p className="text-muted-foreground mb-1 text-xs font-medium">{label}</p>
                    <pre className="whitespace-pre-wrap break-words font-sans">{msg.content}</pre>
                  </div>
                );
              });
            })()}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr('Configuration', '配置')}</CardTitle>
            <CardDescription>{tr('Basic attack task configuration', '基础攻击任务配置')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="font-medium">{tr('Target Type', '目标类型')}:</span>{' '}
              <Badge variant="outline">{task.targetType}</Badge>
            </div>
            <div>
              <span className="font-medium">{tr('Testing Mode', '测试模式')}:</span>{' '}
              <Badge variant="secondary">{formatTestingModeLabel(task.attackMode)}</Badge>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5">
              <div className="font-medium text-foreground">{tr('Detection', '检测')}</div>
              <div className="flex flex-wrap gap-1.5 items-center text-muted-foreground">
                <span>{tr('Rules', '规则')}</span>
                <Badge variant={detectionParsed.useRule ? 'default' : 'secondary'}>
                  {detectionParsed.useRule ? tr('On', '开') : tr('Off', '关')}
                </Badge>
                <span className="text-border">·</span>
                <span>LLM</span>
                <Badge variant={detectionParsed.useLLM ? 'default' : 'secondary'}>
                  {detectionParsed.useLLM ? tr('On', '开') : tr('Off', '关')}
                </Badge>
                {metadataTaskKind === 'config_static' && (
                  <>
                    <span className="text-border">·</span>
                    <span>{tr('Static YAML LLM audit', '静态 YAML LLM 审计')}</span>
                    <Badge variant={detectionParsed.useKnowledgeBase ? 'default' : 'secondary'}>
                      {detectionParsed.useKnowledgeBase ? tr('On', '开') : tr('Off', '关')}
                    </Badge>
                  </>
                )}
              </div>
              {detectionParsed.useLLM && (
                <div>
                  <span className="font-medium text-foreground">{tr('LLM model', 'LLM 模型')}: </span>
                  <span className="font-mono text-xs break-all">{llmModelDisplay ?? '—'}</span>
                </div>
              )}
            </div>
            {targetAgent && (
              <div>
                <span className="font-medium">{tr('Test agent', '测试智能体')}:</span> {targetAgent.name}
              </div>
            )}
            <div>
              <span className="font-medium">{tr('Task type', '任务类型')}:</span>{' '}
              {getAttackTaskTypeLabel(task, taskTypes)}
            </div>
            {(task.taskTypeId ||
              task.platformFamily ||
              task.scanMode ||
              task.retestOfTaskId ||
              task.baselineTaskId) && (
              <div className="pt-2 border-t space-y-1">
                <span className="font-medium">{tr('Product / v4', '产品 / v4')}</span>
                {task.taskTypeId && (
                  <div>
                    {tr('Task type id', '任务类型 ID')}: <span className="font-mono text-xs">{task.taskTypeId}</span>
                  </div>
                )}
                {task.platformFamily && (
                  <div>
                    {tr('Platform', '平台')}: <Badge variant="outline">{task.platformFamily}</Badge>
                  </div>
                )}
                {task.scanMode && (
                  <div>
                    {tr('Scan mode', '扫描模式')}: <Badge variant="secondary">{String(task.scanMode)}</Badge>
                  </div>
                )}
                {task.retestOfTaskId && (
                  <div className="text-xs text-muted-foreground">
                    {tr('Retest of', '复测自')}: <span className="font-mono">{task.retestOfTaskId}</span>
                  </div>
                )}
                {task.baselineTaskId && (
                  <div className="text-xs text-muted-foreground">
                    {tr('Baseline', '基线')}: <span className="font-mono">{task.baselineTaskId}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tr('Status & Metadata', '状态与元数据')}</CardTitle>
            <CardDescription>{tr('Current status and metadata', '当前状态与元数据')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="font-medium">{tr('Status', '状态')}:</span>{' '}
              <AttackTaskStatusBadge status={task.status} />
            </div>
            {task.status === 'running' && runProgress && (
              <div className="space-y-1 pt-1">
                <Progress
                  value={Math.min(
                    100,
                    Math.round((runProgress.completed / runProgress.total) * 100),
                  )}
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground tabular-nums">
                  {runProgress.completed}/{runProgress.total} {tr('vulnerabilities completed', '个漏洞已完成')}
                </p>
              </div>
            )}
            {task.status === 'running' && !runProgress && (
              <p className="text-xs text-muted-foreground pt-1">执行中，正在拉取进度…</p>
            )}
            <div>
              <span className="font-medium">{tr('Organization', '组织')}:</span>{' '}
              {organization?.name ?? (
                <span className="font-mono text-xs text-muted-foreground">
                  {task.organizationId}
                </span>
              )}
            </div>
            {taskOwner && (
              <div>
                <span className="font-medium">{tr('User', '用户')}:</span> {taskOwner.name || taskOwner.email}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="w-full md:col-span-2">
          <CardHeader>
            <CardTitle>{tr('Vulnerabilities', '漏洞')}</CardTitle>
            <CardDescription>
              {tr(
                'Vulnerabilities selected for this task and basic metadata (from Vulnerabilities center)',
                '该任务选择的漏洞及基础元数据（来自漏洞中心）',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {taskVulnerabilities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {tr(
                  'No vulnerabilities linked to this task or they could not be loaded.',
                  '该任务没有关联漏洞，或漏洞加载失败。',
                )}
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                {taskVulnerabilities.map((vuln: any, index: number) => {
                  const cmdQuery = attackCommandQueries[index];
                  const commands = (cmdQuery?.data ?? []) as AttackCommand[];
                  const enabledToRun = commands.filter((c) => c.enabled !== false).length;
                  const cmdCountReady = !cmdQuery?.isPending && !cmdQuery?.isError;

                  return (
                    <div
                      key={vuln.id}
                      className="rounded border bg-muted/40 px-3 py-2 flex flex-col gap-1"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{vuln.name}</span>
                        {vuln.riskLevel && (
                          <Badge
                            variant={
                              vuln.riskLevel === 'critical' || vuln.riskLevel === 'high'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {vuln.riskLevel}
                          </Badge>
                        )}
                        {vuln.type && <Badge variant="outline">{vuln.type}</Badge>}
                        <span className="inline-flex items-center rounded-md border border-input bg-background px-2.5 py-0.5 text-xs font-normal shadow-sm">
                          {cmdQuery?.isPending ? (
                            tr('Attack commands: …', '攻击命令: …')
                          ) : cmdQuery?.isError ? (
                            tr('Attack commands: —', '攻击命令: —')
                          ) : (
                            <>
                              <span className="text-muted-foreground">
                                {tr('Attack commands to run:', '待运行攻击命令:')}
                              </span>{' '}
                              <span className="font-semibold tabular-nums text-destructive">
                                {enabledToRun}
                              </span>
                            </>
                          )}
                        </span>
                        {cmdCountReady && commands.length > enabledToRun && (
                          <span className="text-[10px] text-muted-foreground">
                            ({commands.length - enabledToRun} disabled)
                          </span>
                        )}
                      </div>
                      {vuln.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {vuln.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>{tr('Detection & Findings', '检测与发现')}</CardTitle>
          <CardDescription className="max-w-none text-pretty">
            {tr(
              'Summary of LLM security judgments for this task. “Configured to run” is the total enabled attack commands across selected vulnerabilities; “Run log lines” counts each matching log line from this run (can differ if steps retry or log multiple times).',
              '该任务的 LLM 安全判定摘要。“已配置执行”表示所选漏洞的启用攻击命令总数；“运行日志行数”表示本次运行匹配到的日志行数量（若有重试或重复记录，二者可能不同）。',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{tr('Requests', '请求')}: {stats.totalRequests}</Badge>
            <Badge variant="secondary">
              {tr('Configured to run', '已配置执行')}:{' '}
              {isAttackCommandConfigLoading ? '…' : configuredAttackCommandsTotal}
            </Badge>
            <Badge variant="outline">{tr('Run log lines', '运行日志行数')}: {stats.attackCommands}</Badge>
            <Badge variant="secondary">LLM {tr('judgments', '判定')}: {stats.llmJudgments}</Badge>
            <Badge
              variant={stats.vulnerableCount > 0 ? 'destructive' : 'outline'}
              className="cursor-pointer"
              onClick={() => setShowOnlyVulnerable((v) => !v)}
            >
              {tr('Vulnerable', '易受攻击')}: {stats.vulnerableCount}
            </Badge>
          </div>
          {(configAuditYaml.length > 0 ||
            (task?.vulnerabilities?.length ?? 0) > 0 ||
            taskFindings.length > 0) && (
            <div className="mt-2">
              <Button variant="outline" size="sm" asChild>
                <Link
                  to="/tasks/config-review/$taskId"
                  params={{ taskId }}
                  search={{ vuln: undefined, line: undefined, ruleId: undefined }}
                >
                  {tr('Open config & findings (split view)', '打开配置与发现（分屏）')}
                </Link>
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {tr(
                  'Full-page layout: vulnerabilities on the left, uploaded YAML on the right with highlights.',
                  '全页布局：左侧为漏洞，右侧为上传的 YAML 并带高亮。',
                )}
              </p>
            </div>
          )}
          {filteredFindings.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-2">
              {taskFindings.length === 0
                ? tr(
                    'No findings recorded yet. Run this task and wait for findings to be persisted.',
                    '暂无发现记录。请运行任务并等待发现结果持久化。',
                  )
                : tr(
                    'No vulnerable findings found. Click the Vulnerable badge again to show all findings.',
                    '未找到易受攻击发现。再次点击“易受攻击”徽章可显示全部发现。',
                  )}
            </p>
          ) : (
            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
              {filteredFindings.map((finding) => {
                const vulnerable = finding.finalVerdict?.vulnerable === true;
                const vulnerableLabel = vulnerable ? 'Vulnerable' : 'Not vulnerable';
                const vulnerableBadge: 'destructive' | 'secondary' = vulnerable
                  ? 'destructive'
                  : 'secondary';
                return (
                  <div
                    key={finding.id}
                    className="rounded border bg-muted/40 px-2 py-1 text-xs space-y-1 cursor-pointer hover:bg-muted"
                    onClick={() => {
                      setSelectedLog(finding);
                      setIsLogDialogOpen(true);
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={vulnerableBadge}>{vulnerableLabel}</Badge>
                      <Badge variant="outline">Risk: {finding.riskLevel}</Badge>
                      <Badge variant="outline">Vuln: {finding.vulnerabilityId || '-'}</Badge>
                      {finding.detectedAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(finding.detectedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {finding.vulnerabilityId && configAuditYaml.length > 0 && (
                      <Link
                        to="/tasks/config-review/$taskId"
                        params={{ taskId }}
                        search={{
                          vuln: finding.vulnerabilityId,
                          line: undefined,
                          ruleId: undefined,
                        }}
                        className="text-[10px] text-primary underline-offset-2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open in split view
                      </Link>
                    )}
                    {finding.detectionSummary?.ruleResults &&
                      finding.detectionSummary.ruleResults.length > 0 &&
                      configAuditYaml.length > 0 && (
                        <div className="mt-1 space-y-1 border-t border-border/60 pt-1">
                          <p className="text-[10px] font-medium text-muted-foreground">配置节点</p>
                          <ul className="space-y-1">
                            {finding.detectionSummary.ruleResults.map((r, idx) => (
                              <li
                                key={`${r.ruleId}-${idx}`}
                                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]"
                              >
                                <span
                                  className="min-w-0 max-w-full flex-1 whitespace-pre-line wrap-break-word font-mono text-muted-foreground"
                                  title={configNodeLabelFromHit(r, ruleHitNodeLabelCtx)}
                                >
                                  {configNodeLabelFromHit(r, ruleHitNodeLabelCtx)}
                                </span>
                                {finding.vulnerabilityId && (
                                  <>
                                    <Link
                                      to="/tasks/config-review/$taskId"
                                      params={{ taskId }}
                                      search={{
                                        vuln: finding.vulnerabilityId,
                                        line:
                                          typeof r.startLine === 'number' && r.startLine > 0
                                            ? r.startLine
                                            : undefined,
                                        ruleId: r.ruleId,
                                      }}
                                      className="shrink-0 text-primary underline-offset-2 hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      分屏定位
                                    </Link>
                                    <button
                                      type="button"
                                      className="shrink-0 text-primary underline-offset-2 hover:underline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfigNodeHitDetail(r);
                                      }}
                                    >
                                      节点详情
                                    </button>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {finding.finalVerdict?.reason && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {finding.finalVerdict.reason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr('Run Logs', '运行日志')}</CardTitle>
          <CardDescription>{tr('Recent run activity for this task', '该任务近期运行活动')}</CardDescription>
        </CardHeader>
        <CardContent>
          {runLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr('No run logs recorded yet.', '暂无运行日志。')}</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('Time', '时间')}</TableHead>
                    <TableHead>{tr('Level', '级别')}</TableHead>
                    <TableHead>{tr('Source', '来源')}</TableHead>
                    <TableHead>{tr('Message', '消息')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runLogs.map((log: any) => (
                    <TableRow
                      key={log.id ?? log.timestamp}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedLog(log);
                        setIsLogDialogOpen(true);
                      }}
                    >
                      <TableCell className="whitespace-nowrap text-xs">{log.timestamp}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline">{log.level ?? 'info'}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant={
                            log.source === 'dify' ||
                            log.source === 'coze' ||
                            log.source === 'fastgpt' ||
                            log.source === 'n8n'
                              ? 'secondary'
                              : log.source === 'llm-judge'
                                ? 'default'
                                : log.source === 'attack-command'
                                  ? 'outline'
                                  : 'outline'
                          }
                        >
                          {log.source ?? 'system'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[min(48rem,80vw)] text-xs wrap-break-word whitespace-normal"
                        title={getRunLogTableCellTitle(log, {
                          prompt: tr('Instruction', '测试指令'),
                          reply: tr('Agent reply', '智能体回复'),
                        })}
                      >
                        {typeof log.conversationRound === 'number' && log.conversationRound > 0 ? (
                          <span className="text-muted-foreground me-1.5 font-medium">
                            [{tr(`R${log.conversationRound}`, `第${log.conversationRound}轮`)}]
                          </span>
                        ) : null}
                        <span className="whitespace-pre-wrap">
                          {formatRunLogTableMessage(log, 400, {
                            prompt: tr('Instruction', '测试指令'),
                            reply: tr('Agent reply', '智能体回复'),
                          })}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!configNodeHitDetail}
        onOpenChange={(open) => {
          if (!open) {
            setConfigNodeHitDetail(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[min(96vw,720px)] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-hidden p-6 sm:max-w-[min(96vw,720px)]">
          <DialogHeader className="shrink-0 text-start">
            <DialogTitle>配置节点详情</DialogTitle>
          </DialogHeader>
          {configNodeHitDetail && (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto text-sm">
              <p className="font-medium">
                {configNodeHitDetail.ruleName || configNodeHitDetail.ruleId}
              </p>
              <p className="wrap-break-word font-mono text-xs whitespace-pre-line text-muted-foreground">
                {configNodeLabelFromHit(configNodeHitDetail, ruleHitNodeLabelCtx)}
              </p>
              {configAuditYaml ? (
                <YamlLineViewer
                  fullText={configAuditYaml}
                  hits={[configNodeHitDetail]}
                  className="max-h-[min(58vh,520px)] min-h-[200px]"
                />
              ) : (
                <p className="text-xs text-muted-foreground">任务元数据中无 YAML，无法对照行号。</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isLogDialogOpen} onOpenChange={setIsLogDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[92vh] w-[min(96vw,1280px)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1280px)]"
        >
          <DialogHeader className="relative shrink-0 space-y-2 border-b px-6 pt-4 pb-4 pe-14 text-start">
            <DialogClose
              type="button"
              className="absolute start-auto inset-e-4 top-4 z-60 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <XIcon />
              <span className="sr-only">{tr('Close', '关闭')}</span>
            </DialogClose>
            <DialogTitle className="pr-2">
              {selectedLog &&
              typeof selectedLog === 'object' &&
              'detectionSummary' in selectedLog &&
              selectedLog.finalVerdict
                ? tr('Finding detail', '发现详情')
                : tr('Log detail', '日志详情')}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-6 pt-4 pr-7">
            {selectedLog &&
              typeof selectedLog === 'object' &&
              'detectionSummary' in selectedLog &&
              selectedLog.finalVerdict && (
                <div className="space-y-3 border-b pb-4 text-sm min-w-0">
                  {(selectedLog as Finding).vulnerabilityName && (
                    <p className="font-medium">{(selectedLog as Finding).vulnerabilityName}</p>
                  )}
                  {(selectedLog as Finding).finalVerdict?.reason && (
                    <p className="text-muted-foreground text-xs">
                      {(selectedLog as Finding).finalVerdict?.reason}
                    </p>
                  )}
                  <RuleHitsLocationPanel
                    hits={(selectedLog as Finding).detectionSummary?.ruleResults ?? []}
                    fullText={configAuditYaml || undefined}
                    structureYaml={configAuditYaml || undefined}
                    structureNodes={dslStructureData?.inventory?.nodes}
                    title={tr('Validation rule hits · Config nodes', '验证规则命中 · 配置节点')}
                    configReviewLink={
                      configAuditYaml && (selectedLog as Finding).vulnerabilityId
                        ? { taskId, vulnerabilityId: (selectedLog as Finding).vulnerabilityId }
                        : undefined
                    }
                    onHitDetail={(hit) => setConfigNodeHitDetail(hit)}
                  />
                  {(selectedLog as Finding).detectionSummary?.llmResult?.evidencePaths?.length ||
                  (selectedLog as Finding).detectionSummary?.llmResult?.evidenceSnippets?.length ? (
                    <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
                      <p className="font-medium text-muted-foreground">LLM {tr('evidence', '证据')}</p>
                      {(selectedLog as Finding).detectionSummary?.llmResult?.evidencePaths?.map(
                        (p, i) => (
                          <p key={`p-${i}`} className="font-mono wrap-break-word">
                            {p}
                          </p>
                        ),
                      )}
                      {(selectedLog as Finding).detectionSummary?.llmResult?.evidenceSnippets?.map(
                        (s, i) => (
                          <pre
                            key={`s-${i}`}
                            className="whitespace-pre-wrap wrap-break-word text-muted-foreground"
                          >
                            {s}
                          </pre>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            {selectedLog && (
              <div className="mt-2 space-y-3 text-sm min-w-0">
                <div className="flex flex-wrap gap-2">
                  {selectedLog.timestamp && (
                    <Badge variant="outline">{selectedLog.timestamp}</Badge>
                  )}
                  {selectedLog.level && <Badge variant="outline">{selectedLog.level}</Badge>}
                  {selectedLog.source && <Badge variant="outline">{selectedLog.source}</Badge>}
                </div>
                {selectedLog.message && (
                  <p className="text-sm font-medium">{selectedLog.message}</p>
                )}

                {selectedLog.source === 'llm-judge' && selectedLog.rawOutput && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                      {tr('LLM judge output', 'LLM 判定输出')}
                    </h4>
                    <pre className="max-h-[min(42vh,520px)] max-w-full overflow-x-auto overflow-y-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all">
                      {String(selectedLog.rawOutput)}
                    </pre>
                  </div>
                )}

                {selectedLog.source === 'llm-judge' &&
                  selectedLog.result &&
                  typeof selectedLog.result === 'object' && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                        {tr('LLM judge result', 'LLM 判定结果')}
                      </h4>
                      <pre className="max-h-40 overflow-y-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.result, null, 2)}
                      </pre>
                    </div>
                  )}

                {selectedLog.prompt && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                      {tr('Test instruction', '测试指令')}
                    </h4>
                    <pre className="max-h-40 overflow-y-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
                      {selectedLog.prompt}
                    </pre>
                  </div>
                )}

                {(() => {
                  const responseBody = resolveRunLogResponsePreviewForDetail(selectedLog, runLogs);
                  const responseDisplay = responseBody
                    ? formatRunLogResponseTextForDialog(responseBody)
                    : '';
                  return responseDisplay ? (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                        {tr('Response preview', '响应预览')}
                      </h4>
                      <pre className="max-h-[min(42vh,520px)] max-w-full overflow-x-auto overflow-y-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all">
                        {responseDisplay}
                      </pre>
                    </div>
                  ) : null;
                })()}

                {selectedLog.error && (
                  <div>
                    <h4 className="text-xs font-semibold text-destructive mb-1">{tr('Error', '错误')}</h4>
                    <pre className="max-h-40 overflow-y-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap text-destructive">
                      {selectedLog.error}
                    </pre>
                  </div>
                )}

                <details className="rounded-md border border-border/60 bg-muted/20 p-2">
                  <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground">
                    {tr('Raw log object (JSON)', '原始日志对象 (JSON)')}
                  </summary>
                  <pre className="mt-2 max-h-[min(38vh,480px)] max-w-full overflow-x-auto overflow-y-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedLog, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
