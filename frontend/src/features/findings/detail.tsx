/**
 * Vulnerability Finding Detail Page
 * Sections: basic info, detection summary, conversation timeline, remediation (solutions)
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { SecurityTimelineCard } from '@/components/security-timeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { findingsApi } from '@/services/api/findings';
import { tasksApi } from '@/services/api/tasks';
import { difyConfigAuditApi } from '@/services/api/dify-config-audit';
import { Step1Upload as DifyStep1Upload } from '@/features/dify-config-audit/steps/step1-upload';
import { Step1Upload as FastGptStep1Upload } from '@/features/fastgpt-config-audit/steps/step1-upload';
import {
  ArrowLeft,
  Shield,
  MessageSquare,
  FileText,
  ExternalLink,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import type { Finding } from '@/types/entities';
import { RuleHitsLocationPanel } from '@/components/rule-hits-location';

interface FindingDetailProps {
  findingId: string;
}

function getRiskLevelColor(level: string): 'destructive' | 'default' | 'secondary' {
  switch (level) {
    case 'critical':
    case 'high':
      return 'destructive';
    case 'medium':
      return 'default';
    case 'low':
      return 'secondary';
    default:
      return 'default';
  }
}

function getStatusColor(status: string): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'open':
      return 'default';
    case 'under_review':
      return 'secondary';
    case 'accepted':
    case 'fixed':
      return 'outline';
    default:
      return 'outline';
  }
}

/** Task-based detail view when findings API is unavailable (fallback from list derived from tasks) */
function FindingDetailFromTask({
  findingId,
  task,
  onBack,
}: {
  findingId: string;
  task: import('@/types/entities').AttackTask;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const status =
    task.status === 'completed'
      ? 'open'
      : task.status === 'failed'
        ? 'under_review'
        : 'under_review';

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tr('Back to findings', '返回发现列表')}
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{task.name}</h1>
        <p className="text-muted-foreground">
          {tr('Created', '创建于')} {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">MEDIUM</Badge>
          <Badge variant={getStatusColor(status)}>{status.replace('_', ' ').toUpperCase()}</Badge>
          <Badge variant="outline">{task.status}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {tr('Task information', '任务信息')}
            </CardTitle>
            <CardDescription>
              {tr(
                'This finding was derived from an attack task (findings API unavailable)',
                '该发现来自攻击任务（findings API 不可用）',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{tr('Task ID', '任务 ID')}</p>
              <p className="font-mono text-sm">{task.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{tr('Target type', '目标类型')}</p>
              <p className="text-sm">{task.targetType}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{tr('Attack mode', '攻击模式')}</p>
              <p className="text-sm">{task.attackMode}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{tr('Vulnerability IDs', '漏洞 ID')}</p>
              <p className="text-sm">
                {task.vulnerabilities?.length ? task.vulnerabilities.join(', ') : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{tr('Created', '创建时间')}</p>
              <p className="text-sm">{format(new Date(task.createdAt), 'PPpp')}</p>
            </div>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          onClick={() => navigate({ to: '/tasks/$taskId', params: { taskId: findingId } })}
        >
          {tr('Open task details', '打开任务详情')}
        </Button>
      </Main>
    </>
  );
}

export function FindingDetail({ findingId }: FindingDetailProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const [expandedConversation, setExpandedConversation] = useState(false);
  const [retestOpen, setRetestOpen] = useState(false);
  const [retestConfigOpen, setRetestConfigOpen] = useState(false);
  const [retestMode, setRetestMode] = useState<'finding_scoped' | 'full_task'>('finding_scoped');
  const [autoStartRetest, setAutoStartRetest] = useState(true);
  const [retestConfigText, setRetestConfigText] = useState('');
  const [retestConfigFileName, setRetestConfigFileName] = useState<string | undefined>(undefined);

  const findingQuery = useQuery({
    queryKey: ['finding', findingId],
    queryFn: () => findingsApi.get(findingId),
    retry: 1,
  });

  const taskQuery = useQuery({
    queryKey: ['attack-task', findingId],
    queryFn: () => tasksApi.get(findingId),
    enabled: findingQuery.isError === true,
    retry: 1,
  });

  const taskIdForYaml = findingQuery.data?.taskId;
  const sourceTaskForYaml = useQuery({
    queryKey: ['attack-task', taskIdForYaml, 'finding-yaml'],
    queryFn: () => tasksApi.get(taskIdForYaml!),
    enabled: Boolean(taskIdForYaml),
    staleTime: 60_000,
  });

  const configAuditYamlForFinding = useMemo(() => {
    const meta = sourceTaskForYaml.data?.metadata as
      | { configAudit?: { yaml?: string } }
      | undefined;
    return String(meta?.configAudit?.yaml || '').trim();
  }, [sourceTaskForYaml.data?.metadata]);

  const findingRuleHitsCount =
    findingQuery.data?.detectionSummary?.ruleResults?.length ?? 0;

  const { data: findingDslStructure } = useQuery({
    queryKey: [
      'dify-structure',
      'finding-detail',
      taskIdForYaml,
      configAuditYamlForFinding.length,
    ],
    queryFn: () => difyConfigAuditApi.structure({ yaml: configAuditYamlForFinding }),
    enabled:
      Boolean(taskIdForYaml) &&
      configAuditYamlForFinding.length > 60 &&
      findingRuleHitsCount > 0,
    staleTime: 5 * 60 * 1000,
  });

  const timelineQuery = useQuery({
    queryKey: ['finding-timeline', findingId],
    queryFn: () => findingsApi.getTimeline(findingId),
    enabled: findingQuery.isSuccess,
    retry: 1,
  });

  const retestMutation = useMutation({
    mutationFn: (body: {
      mode: 'finding_scoped' | 'full_task';
      autoStart: boolean;
      configAudit?: { yaml?: string; json?: string; fileName?: string };
    }) => findingsApi.retest(findingId, body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      queryClient.invalidateQueries({ queryKey: ['finding-timeline', findingId] });
      toast.success(
        data.started
          ? tr('Retest task created and started', '复测任务已创建并启动')
          : tr('Retest task created', '复测任务已创建'),
      );
      setRetestOpen(false);
      setRetestConfigOpen(false);
      navigate({ to: '/tasks/$taskId', params: { taskId: data.taskId } });
    },
    onError: (error: unknown) => {
      const ax = error as { response?: { data?: { error?: { message?: string } } } };
      const msg = ax.response?.data?.error?.message;
      toast.error(typeof msg === 'string' && msg ? msg : tr('Retest failed', '复测失败'));
    },
  });

  const statusMutation = useMutation({
    mutationFn: (nextStatus: 'fixed' | 'under_review') =>
      findingsApi.update(findingId, { status: nextStatus }),
    onSuccess: (_updated, nextStatus) => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      queryClient.invalidateQueries({ queryKey: ['finding-timeline', findingId] });
      toast.success(
        nextStatus === 'fixed'
          ? tr('Marked as fixed', '已标记为已修复')
          : tr('Marked as under review', '已标记为待复核'),
      );
    },
    onError: (error: unknown) => {
      const msg = (error as { message?: string })?.message;
      toast.error(
        `${tr('Failed to update finding status', '更新发现状态失败')}: ${
          msg || tr('Unknown error', '未知错误')
        }`,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => findingsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      toast.success(tr('Finding deleted', '发现已删除'));
      navigate({
        to: '/findings',
        search: {
          riskLevel: undefined,
          status: undefined,
          search: undefined,
          page: 1,
          agentId: undefined,
        },
      });
    },
    onError: (error: Error) => {
      toast.error(
        `${tr('Failed to delete finding', '删除发现失败')}: ${error?.message ?? tr('Unknown error', '未知错误')}`,
      );
    },
  });

  const handleDelete = () => {
    if (!window.confirm(tr('Are you sure you want to delete this finding?', '确定要删除该发现吗？'))) return;
    deleteMutation.mutate(findingId);
  };

  const finding: Finding | null = findingQuery.data ?? null;
  const task = taskQuery.data;
  const isLoading = findingQuery.isLoading || (findingQuery.isError && taskQuery.isLoading);
  const error = findingQuery.error;

  if (task && !finding) {
    return (
      <FindingDetailFromTask
        findingId={findingId}
        task={task}
        onBack={() =>
          navigate({
            to: '/findings',
            search: {
              riskLevel: undefined,
              status: undefined,
              search: undefined,
              page: 1,
              agentId: undefined,
            },
          })
        }
      />
    );
  }

  if (isLoading) {
    return (
      <>
        <Header fixed>
          <Search />
          <div className="ms-auto flex items-center space-x-4">
            <ThemeSwitch />
            <ConfigDrawer />
            <ProfileDropdown />
          </div>
        </Header>
        <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
          <Skeleton className="h-64" />
        </Main>
      </>
    );
  }

  if (!finding && !task) {
    return (
      <>
        <Header fixed>
          <Search />
          <div className="ms-auto flex items-center space-x-4">
            <ThemeSwitch />
            <ConfigDrawer />
            <ProfileDropdown />
          </div>
        </Header>
        <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
          <p className="text-destructive">
            {tr('Failed to load finding details.', '加载发现详情失败。')}{' '}
            {error instanceof Error ? error.message : tr('Unknown error', '未知错误')}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              navigate({
                to: '/findings',
                search: {
                  riskLevel: undefined,
                  status: undefined,
                  search: undefined,
                  page: 1,
                  agentId: undefined,
                },
              })
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tr('Back to findings', '返回发现列表')}
          </Button>
        </Main>
      </>
    );
  }

  if (!finding) return null;

  const summary = finding.detectionSummary ?? {
    finalVerdict: finding.finalVerdict,
    ruleResults: [],
    llmResult: undefined,
  };
  const conversation = finding.conversation ?? [];
  const solutions = finding.solutions ?? [];
  const metaYaml = sourceTaskForYaml.data?.metadata as
    | { taskKind?: string; configAudit?: { yaml?: string; json?: string; fileName?: string } }
    | undefined;
  const configAuditYaml = String(metaYaml?.configAudit?.yaml || '').trim();
  const configAuditJson = String(metaYaml?.configAudit?.json || '').trim();
  const configAuditFileNameFromMeta = metaYaml?.configAudit?.fileName;
  const taskKindFromMeta = String(metaYaml?.taskKind || '').trim();
  const requiresConfigAudit = taskKindFromMeta === 'config_audit' || taskKindFromMeta === 'config_static';
  const platformFamily = String((sourceTaskForYaml.data as any)?.platformFamily || '').toLowerCase();
  const requiresJsonConfig = platformFamily === 'fastgpt' || platformFamily === 'n8n';

  const openRetest = () => {
    if (requiresConfigAudit) {
      setRetestConfigText(requiresJsonConfig ? configAuditJson : configAuditYaml);
      setRetestConfigFileName(
        typeof configAuditFileNameFromMeta === 'string' && configAuditFileNameFromMeta.trim()
          ? configAuditFileNameFromMeta.trim()
          : undefined,
      );
      setRetestConfigOpen(true);
      return;
    }
    setRetestOpen(true);
  };
  const CONVERSATION_PREVIEW_LINES = 5;
  const conversationPreview = conversation.slice(0, CONVERSATION_PREVIEW_LINES);
  const hasMoreConversation = conversation.length > CONVERSATION_PREVIEW_LINES;
  const showConversation = expandedConversation ? conversation : conversationPreview;

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-2"
              onClick={() =>
                navigate({
                  to: '/findings',
                  search: {
                    riskLevel: undefined,
                    status: undefined,
                    search: undefined,
                    page: 1,
                    agentId: undefined,
                  },
                })
              }
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {tr('Back to findings', '返回发现列表')}
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">{finding.vulnerabilityName}</h1>
            <p className="mt-1 text-muted-foreground">
              {tr('Detected', '发现于')} {formatDistanceToNow(new Date(finding.detectedAt), { addSuffix: true })}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={getRiskLevelColor(finding.riskLevel)}>
                {finding.riskLevel.toUpperCase()}
              </Badge>
              <Badge variant={getStatusColor(finding.status)}>
                {finding.status.replace('_', ' ').toUpperCase()}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {tr('Confidence', '置信度')}: {(finding.finalVerdict.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {finding.status === 'fixed' ? (
              <Button
                variant="outline"
                size="sm"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate('under_review')}
              >
                {statusMutation.isPending ? tr('Updating...', '更新中...') : tr('Reopen', '重新打开')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate('fixed')}
              >
                {statusMutation.isPending
                  ? tr('Updating...', '更新中...')
                  : tr('Mark as fixed', '标记为已修复')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={retestMutation.isPending}
              onClick={openRetest}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {tr('Retest', '复测')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {tr('Delete', '删除')}
            </Button>
          </div>
        </div>

        <Dialog open={retestOpen} onOpenChange={setRetestOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{tr('Run retest', '执行复测')}</DialogTitle>
              <DialogDescription>
                {tr(
                  'Creates a new attack task cloned from the original. Scoped retest runs only the vulnerability for this finding.',
                  '将基于原任务创建一个新的攻击任务。范围复测仅执行当前发现对应漏洞。',
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{tr('Scope', '范围')}</Label>
                <RadioGroup
                  value={retestMode}
                  onValueChange={(v) => setRetestMode(v as 'finding_scoped' | 'full_task')}
                  className="grid gap-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="finding_scoped" id="retest-scoped" />
                    <Label htmlFor="retest-scoped" className="font-normal cursor-pointer">
                      {tr('This vulnerability only', '仅当前漏洞')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="full_task" id="retest-full" />
                    <Label htmlFor="retest-full" className="font-normal cursor-pointer">
                      {tr('Full original task (all vulnerabilities)', '完整原任务（全部漏洞）')}
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              {retestMode === 'finding_scoped' && !finding.vulnerabilityId ? (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  {tr(
                    'This finding has no vulnerability id. Choose full task or fix the finding record.',
                    '该发现没有漏洞 ID。请改用完整任务复测，或先修复该发现记录。',
                  )}
                </p>
              ) : null}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="retest-autostart" className="text-sm font-medium">
                    {tr('Start run immediately', '立即启动运行')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {tr('Same as clicking Run on the task', '等同于在任务页点击“运行”')}
                  </p>
                </div>
                <Switch
                  id="retest-autostart"
                  checked={autoStartRetest}
                  onCheckedChange={setAutoStartRetest}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRetestOpen(false)}>
                {tr('Cancel', '取消')}
              </Button>
              <Button
                disabled={
                  retestMutation.isPending ||
                  (retestMode === 'finding_scoped' && !finding.vulnerabilityId)
                }
                onClick={() =>
                  retestMutation.mutate({
                    mode: retestMode,
                    autoStart: autoStartRetest,
                  })
                }
              >
                {retestMutation.isPending ? tr('Creating…', '创建中…') : tr('Create retest', '创建复测')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={retestConfigOpen} onOpenChange={setRetestConfigOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{tr('Run retest', '执行复测')}</DialogTitle>
              <DialogDescription>
                {tr(
                  'This finding belongs to a config-related task. Upload the updated config before retesting.',
                  '该发现所属任务为配置相关测试。复测前请重新上传更新后的配置文件。',
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">{tr('Finding', '发现')}</span>
                  <p className="font-medium">{finding.vulnerabilityName || finding.vulnerabilityId}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{tr('Task', '任务')}</span>
                  <p className="font-medium">{finding.task?.name || finding.taskId}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{tr('Mode', '范围')}</span>
                  <p className="font-medium">
                    {retestMode === 'finding_scoped'
                      ? tr('This vulnerability only', '仅当前漏洞')
                      : tr('Full original task', '完整原任务')}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{tr('Auto start', '立即启动')}</span>
                  <p className="font-medium">{autoStartRetest ? tr('Yes', '是') : tr('No', '否')}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">{tr('Scope', '范围')}</Label>
                <RadioGroup
                  value={retestMode}
                  onValueChange={(v) => setRetestMode(v as 'finding_scoped' | 'full_task')}
                  className="grid gap-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="finding_scoped" id="retest-scoped-config" />
                    <Label htmlFor="retest-scoped-config" className="font-normal cursor-pointer">
                      {tr('This vulnerability only', '仅当前漏洞')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="full_task" id="retest-full-config" />
                    <Label htmlFor="retest-full-config" className="font-normal cursor-pointer">
                      {tr('Full original task (all vulnerabilities)', '完整原任务（全部漏洞）')}
                    </Label>
                  </div>
                </RadioGroup>
                {retestMode === 'finding_scoped' && !finding.vulnerabilityId ? (
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    {tr(
                      'This finding has no vulnerability id. Choose full task or fix the finding record.',
                      '该发现没有漏洞 ID。请改用完整任务复测，或先修复该发现记录。',
                    )}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="retest-autostart-config" className="text-sm font-medium">
                    {tr('Start run immediately', '立即启动运行')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {tr('Same as clicking Run on the task', '等同于在任务页点击“运行”')}
                  </p>
                </div>
                <Switch
                  id="retest-autostart-config"
                  checked={autoStartRetest}
                  onCheckedChange={setAutoStartRetest}
                />
              </div>

              <div className="space-y-2">
                <Label>{tr('Config file (required)', '配置文件（必填）')}</Label>
                {requiresJsonConfig ? (
                  <FastGptStep1Upload
                    jsonText={retestConfigText}
                    setJsonText={setRetestConfigText}
                    fileName={retestConfigFileName}
                    setFileName={setRetestConfigFileName}
                  />
                ) : (
                  <DifyStep1Upload
                    yamlText={retestConfigText}
                    setYamlText={setRetestConfigText}
                    fileName={retestConfigFileName}
                    setFileName={setRetestConfigFileName}
                  />
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRetestConfigOpen(false)}>
                {tr('Cancel', '取消')}
              </Button>
              <Button
                disabled={
                  retestMutation.isPending ||
                  (retestMode === 'finding_scoped' && !finding.vulnerabilityId)
                }
                onClick={() => {
                  const content = retestConfigText.trim();
                  if (!content) {
                    toast.error(tr('Please upload config first', '请先上传配置文件'));
                    return;
                  }
                  retestMutation.mutate({
                    mode: retestMode,
                    autoStart: autoStartRetest,
                    configAudit: {
                      ...(requiresJsonConfig ? { json: content } : { yaml: content }),
                      fileName: retestConfigFileName,
                    },
                  });
                }}
              >
                {retestMutation.isPending ? tr('Creating…', '创建中…') : tr('Create retest', '创建复测')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {tr('Basic information', '基础信息')}
            </CardTitle>
            <CardDescription>{tr('Vulnerability, agent, and task context', '漏洞、智能体与任务上下文')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{tr('Agent', '智能体')}</p>
              <p className="text-sm">{finding.agentName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{tr('Vulnerability ID', '漏洞 ID')}</p>
              <p className="font-mono text-sm">{finding.vulnerabilityId}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{tr('Task', '任务')}</p>
              <p className="text-sm">
                {finding.taskId}
                {finding.task?.name && ` — ${finding.task.name}`}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{tr('Detected at', '发现时间')}</p>
              <p className="text-sm">{format(new Date(finding.detectedAt), 'PPpp')}</p>
            </div>
          </CardContent>
        </Card>

        {timelineQuery.isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full max-w-md" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ) : null}
        {timelineQuery.isError ? (
          <p className="text-sm text-muted-foreground">{tr('Security timeline could not be loaded.', '安全时间线加载失败。')}</p>
        ) : null}
        {timelineQuery.isSuccess && timelineQuery.data ? (
          <SecurityTimelineCard
            events={timelineQuery.data.events}
            highlightFindingId={timelineQuery.data.highlightFindingId}
          />
        ) : null}

        {/* Detection summary */}
        <Card>
          <CardHeader>
            <CardTitle>{tr('Detection summary', '检测摘要')}</CardTitle>
            <CardDescription>{tr('Final verdict and detection details', '最终判定与检测详情')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm font-medium">
                {summary.finalVerdict.vulnerable
                  ? tr('Vulnerable', '易受攻击')
                  : tr('Not vulnerable', '未发现可利用风险')}
              </p>
              {summary.finalVerdict.reason && (
                <p className="mt-1 text-sm text-muted-foreground">{summary.finalVerdict.reason}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {tr('Confidence', '置信度')}: {(summary.finalVerdict.confidence * 100).toFixed(0)}%
                {summary.finalVerdict.riskLevel && ` · ${tr('Risk', '风险')}: ${summary.finalVerdict.riskLevel}`}
              </p>
            </div>
            {summary.ruleResults && summary.ruleResults.length > 0 && (
              <div>
                <RuleHitsLocationPanel
                  hits={summary.ruleResults}
                  fullText={configAuditYaml || undefined}
                  structureYaml={configAuditYaml || undefined}
                  structureNodes={findingDslStructure?.inventory?.nodes}
                  title={tr('Rule results (location in YAML)', '规则结果（YAML 定位）')}
                />
              </div>
            )}
            {summary.llmResult && (
              <div className="rounded border p-3 text-sm space-y-2">
                <p className="font-medium">LLM {tr('assessment', '评估')}</p>
                <p className="text-muted-foreground">
                  {summary.llmResult.reasoning ??
                    (summary.llmResult.vulnerable
                      ? tr('Vulnerable', '易受攻击')
                      : tr('Not vulnerable', '未发现可利用风险'))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tr('Confidence', '置信度')}: {(summary.llmResult.confidence * 100).toFixed(0)}% · {tr('Risk', '风险')}:{' '}
                  {summary.llmResult.riskLevel}
                </p>
                {(summary.llmResult.evidencePaths?.length ||
                  summary.llmResult.evidenceSnippets?.length) && (
                  <div className="rounded-md bg-muted/50 p-2 text-xs space-y-1">
                    <p className="font-medium text-muted-foreground">LLM {tr('evidence', '证据')}</p>
                    {summary.llmResult.evidencePaths?.map((p, i) => (
                      <p key={`ep-${i}`} className="font-mono wrap-break-word">
                        {p}
                      </p>
                    ))}
                    {summary.llmResult.evidenceSnippets?.map((s, i) => (
                      <pre key={`es-${i}`} className="whitespace-pre-wrap wrap-break-word">
                        {s}
                      </pre>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversation / attack timeline */}
        {conversation.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {tr('Attack conversation', '攻击对话')}
              </CardTitle>
              <CardDescription>{tr('Attacker and agent exchange', '攻击者与智能体交互')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {showConversation.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg border p-3 ${
                      msg.role === 'attacker'
                        ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30'
                        : 'border-muted bg-muted/30'
                    }`}
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {msg.role === 'attacker' ? tr('Attacker', '攻击者') : tr('Agent', '智能体')}
                      {' · '}
                      {format(new Date(msg.timestamp), 'HH:mm:ss')}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">
                      {msg.content}
                    </p>
                  </div>
                ))}
              </div>
              {hasMoreConversation && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setExpandedConversation((v) => !v)}
                >
                  {expandedConversation
                    ? tr('Show less', '收起')
                    : tr(`Show all ${conversation.length} messages`, `显示全部 ${conversation.length} 条消息`)}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Remediation / solutions */}
        {solutions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {tr('Remediation', '修复建议')}
              </CardTitle>
              <CardDescription>{tr('Recommended steps and references', '建议步骤与参考资料')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {solutions.map((sol) => (
                <div key={sol.id} className="space-y-3">
                  <h4 className="font-medium">{sol.title}</h4>
                  {sol.description && (
                    <p className="text-sm text-muted-foreground">{sol.description}</p>
                  )}
                  {sol.steps && sol.steps.length > 0 && (
                    <ol className="list-inside list-decimal space-y-2 text-sm">
                      {sol.steps
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((step) => (
                          <li key={step.order}>
                            <span className="font-medium">{step.title}</span>
                            {step.description && (
                              <p className="ml-4 text-muted-foreground">{step.description}</p>
                            )}
                            {step.commands && step.commands.length > 0 && (
                              <pre className="ml-4 mt-1 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
                                {step.commands.join('\n')}
                              </pre>
                            )}
                          </li>
                        ))}
                    </ol>
                  )}
                  {sol.references && sol.references.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {sol.references.map((ref, i) => (
                        <li key={i}>
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {ref.title || ref.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {solutions.length === 0 && finding.vulnerability?.description && (
          <Card>
            <CardHeader>
              <CardTitle>{tr('Vulnerability description', '漏洞描述')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{finding.vulnerability.description}</p>
            </CardContent>
          </Card>
        )}
      </Main>
    </>
  );
}
