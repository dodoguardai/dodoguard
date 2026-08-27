/**
 * Attack Tasks Management Page
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { Eye, FileStack, FileText, MoreHorizontal, Pencil, Play, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Step1Upload as DifyStep1Upload } from '@/features/dify-config-audit/steps/step1-upload';
import { Step1Upload as FastGptStep1Upload } from '@/features/fastgpt-config-audit/steps/step1-upload';
import { markAttackTaskRunJustStarted } from '@/features/tasks/active-run-session';
import { AttackTaskStatusBadge } from '@/features/tasks/attack-task-status-badge';
import {
  formatRunLogTableMessage,
  getRunLogTableCellTitle,
} from '@/features/tasks/run-log-table-message';
import { parseTaskRunProgress } from '@/features/tasks/task-run-progress';
import { getRunSourceLabel } from '@/features/tasks/run-source-label';
import {
  getAttackTaskTypeLabel,
  getGenerateReportMenuDescription,
  getGenerateReportMenuLabel,
  getPocSuiteMenuLabel,
  getReportKindForLabels,
  getTaskKindFromMetadata,
} from '@/features/tasks/task-type-label';
import { formatTestingModeLabel } from '@/features/tasks/testing-mode-label';
import { Route } from '@/routes/_authenticated/tasks/';
import { tasksApi } from '@/services/api/tasks';
import type { AttackTask } from '@/types/entities';

type Surface =
  | 'all'
  | 'dify'
  | 'agent'
  | 'coze'
  | 'fastgpt'
  | 'n8n'
  | 'tencent-adp'
  | 'mcp'
  | 'tool'
  | 'platform'
  | 'llm';
type StatusFilter = 'all' | 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export function Tasks() {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    surface: category,
    taskId,
    status: searchStatus,
  } = Route.useSearch() as {
    surface: string;
    taskId?: string;
    status?: string;
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>(() =>
    searchStatus && searchStatus !== 'all' ? searchStatus : 'all',
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, AttackTask['status']>>(
    {},
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [rerunConfigTask, setRerunConfigTask] = useState<AttackTask | null>(null);
  const [rerunConfigText, setRerunConfigText] = useState('');
  const [rerunConfigFileName, setRerunConfigFileName] = useState<string | undefined>(undefined);
  const isDifyCategory = category === 'dify' || category === 'agent';

  const getTaskKind = (task: AttackTask) =>
    (getTaskKindFromMetadata(task.metadata) as 'api_test' | 'config_audit' | 'config_static') ||
    'api_test';
  const isConfigRerunTask = (task: AttackTask) => {
    const taskKind = getTaskKind(task);
    return taskKind === 'config_audit' || taskKind === 'config_static';
  };
  const requiresJsonConfig = (task: AttackTask) =>
    task.platformFamily === 'fastgpt' || task.platformFamily === 'n8n';
  const getConfigAuditFromMetadata = (task: AttackTask) => {
    const metadata =
      task.metadata && typeof task.metadata === 'object'
        ? (task.metadata as Record<string, unknown>)
        : {};
    const configAudit =
      metadata.configAudit && typeof metadata.configAudit === 'object'
        ? (metadata.configAudit as Record<string, unknown>)
        : {};
    return {
      yaml: typeof configAudit.yaml === 'string' ? configAudit.yaml : '',
      json: typeof configAudit.json === 'string' ? configAudit.json : '',
      fileName: typeof configAudit.fileName === 'string' ? configAudit.fileName : undefined,
    };
  };
  const isRetestedTask = (task: AttackTask) => {
    const metadata =
      task.metadata && typeof task.metadata === 'object'
        ? (task.metadata as Record<string, unknown>)
        : {};
    const runLogs = Array.isArray(metadata.runLogs) ? (metadata.runLogs as Array<unknown>) : [];
    let runStartCount = 0;
    for (const log of runLogs) {
      if (!log || typeof log !== 'object') {
        continue;
      }
      const msg = String((log as Record<string, unknown>).message ?? '').toLowerCase();
      if (msg.includes('task run started')) {
        runStartCount += 1;
      }
    }
    return runStartCount >= 2;
  };

  useEffect(() => {
    if (searchStatus && searchStatus !== 'all') {
      setSelectedStatus(searchStatus);
    }
  }, [searchStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [category, selectedStatus, searchTerm]);

  const { data, isLoading } = useQuery({
    queryKey: ['attack-tasks', searchTerm, selectedStatus, category, currentPage, pageSize],
    queryFn: () =>
      tasksApi.list({
        search: searchTerm || undefined,
        status: selectedStatus !== 'all' ? (selectedStatus as AttackTask['status']) : undefined,
        // 根据分类过滤不同类型的安全验证任务（Coze / FastGPT / N8N：agent + platform_family）
        targetType:
          category !== 'all' &&
          category !== 'coze' &&
          category !== 'fastgpt' &&
          category !== 'n8n' &&
          category !== 'tencent-adp' &&
          !isDifyCategory
            ? (category as AttackTask['targetType'])
            : category === 'coze' ||
                category === 'fastgpt' ||
                category === 'n8n' ||
                category === 'tencent-adp'
              ? 'agent'
              : undefined,
        platformFamily:
          isDifyCategory
            ? 'dify'
            : category === 'coze'
            ? 'coze'
            : category === 'fastgpt'
              ? 'fastgpt'
              : category === 'n8n'
                ? 'n8n'
                : category === 'tencent-adp'
                  ? 'tencent-adp'
                  : undefined,
        excludePlatformFamily: undefined,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      }),
    refetchInterval: (query) => {
      const list = query.state.data?.data ?? [];
      const now = Date.now();
      const recentPendingMs = 3 * 60 * 1000;
      const hasRunning = list.some((t) => t.status === 'running');
      const hasRecentPending = list.some((t) => {
        if (t.status !== 'pending') {
          return false;
        }
        const created = new Date(t.createdAt).getTime();
        return Number.isFinite(created) && now - created < recentPendingMs;
      });
      return hasRunning || hasRecentPending ? 2500 : false;
    },
  });

  const { data: taskTypes = [] } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => tasksApi.listTaskTypes(),
    staleTime: 5 * 60 * 1000,
  });

  const runMutation = useMutation({
    mutationFn: ({
      taskId,
      configAudit,
    }: {
      taskId: string;
      configAudit?: { yaml?: string; json?: string; fileName?: string };
    }) => tasksApi.run({ taskId, configAudit }),
    onMutate: (taskId) => {
      setOptimisticStatus((prev) => ({ ...prev, [taskId.taskId]: 'running' }));
    },
    onSuccess: (_, taskId) => {
      markAttackTaskRunJustStarted(taskId.taskId);
      queryClient.setQueryData<AttackTask>(['attack-task', taskId.taskId], (prev) =>
        prev ? { ...prev, status: 'running' } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      toast.success('Task execution started');
      // 可选：跳转到详情页查看最新运行日志
      navigate({ to: '/tasks/$taskId', params: { taskId: taskId.taskId } });
    },
    onError: (error: any) => {
      toast.error(`Failed to run task: ${error?.message || 'Unknown error'}`);
    },
    onSettled: (_data, _error, taskId) => {
      if (!taskId) {
        return;
      }
      setOptimisticStatus((prev) => {
        const { [taskId.taskId]: _removed, ...rest } = prev;
        return rest;
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => tasksApi.cancel({ taskId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      toast.success('Task canceled');
    },
    onError: (error: any) => {
      toast.error(`Failed to cancel task: ${error?.message || 'Unknown error'}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      toast.success('Task deleted');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete task: ${error?.message || 'Unknown error'}`);
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => tasksApi.delete(id)));
    },
    onSuccess: (_data, ids) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      toast.success(`Deleted ${ids.length} task(s)`);
    },
    onError: (error: any) => {
      toast.error(`Batch delete failed: ${error?.message || 'Unknown error'}`);
    },
  });

  const batchRunMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => tasksApi.run({ taskId: id })));
    },
    onSuccess: (_, ids) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      for (const id of ids) {
        markAttackTaskRunJustStarted(id);
        queryClient.setQueryData<AttackTask>(['attack-task', id], (prev) =>
          prev ? { ...prev, status: 'running' } : prev,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      toast.success(`Started ${ids.length} task(s)`);
    },
    onError: (error: any) => {
      toast.error(`Batch run failed: ${error?.message || 'Unknown error'}`);
    },
  });

  const tasks = data?.data || [];
  const listTotal = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize) || 1);

  useEffect(() => {
    if (isLoading || listTotal <= 0) {
      return;
    }
    const maxPage = Math.max(1, Math.ceil(listTotal / pageSize));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [isLoading, listTotal, pageSize, currentPage]);

  const selectedTask = taskId ? tasks.find((t) => t.id === taskId) : undefined;

  const isAllSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id));
  const isIndeterminate =
    tasks.length > 0 && tasks.some((t) => selectedIds.has(t.id)) && !isAllSelected;

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    if (!confirm(`Delete ${ids.length} selected task(s)?`)) {
      return;
    }
    batchDeleteMutation.mutate(ids);
  };

  const handleBatchRun = () => {
    const ids = Array.from(selectedIds).filter((id) => {
      const task = tasks.find((t) => t.id === id);
      const status = task?.status;
      return (
        !status ||
        status === 'pending' ||
        status === 'completed' ||
        status === 'failed' ||
        status === 'canceled'
      );
    });
    if (ids.length === 0) {
      toast.error('No runnable tasks selected (running tasks cannot be re-run)');
      return;
    }
    batchRunMutation.mutate(ids);
  };

  const openConfigRerunDialog = (task: AttackTask) => {
    const cfg = getConfigAuditFromMetadata(task);
    const useJson = requiresJsonConfig(task);
    setRerunConfigTask(task);
    setRerunConfigText(useJson ? cfg.json : cfg.yaml);
    setRerunConfigFileName(cfg.fileName);
  };

  const triggerRerunTask = (task: AttackTask) => {
    if (isConfigRerunTask(task)) {
      openConfigRerunDialog(task);
      return;
    }
    runMutation.mutate({ taskId: task.id });
  };

  const submitConfigRerun = () => {
    if (!rerunConfigTask) {
      return;
    }
    const content = rerunConfigText.trim();
    if (!content) {
      toast.error('请先上传或粘贴配置文件');
      return;
    }
    const useJson = requiresJsonConfig(rerunConfigTask);
    runMutation.mutate({
      taskId: rerunConfigTask.id,
      configAudit: {
        ...(useJson ? { json: content } : { yaml: content }),
        fileName: rerunConfigFileName,
      },
    });
    setRerunConfigTask(null);
  };

  const pageTitle =
    category === 'all'
      ? t('sidebar.item.allTestingTasks')
      : isDifyCategory
        ? t('sidebar.item.difySecurityTesting')
        : category === 'coze'
          ? t('sidebar.item.cozeSecurityTesting')
          : category === 'fastgpt'
            ? t('sidebar.item.fastgptSecurityTesting')
            : category === 'n8n'
              ? t('sidebar.item.n8nSecurityTesting')
              : category === 'tencent-adp'
                ? t('sidebar.item.tencentAdpSecurityTesting')
                : category === 'mcp'
                ? tr('MCP Security Testing', 'MCP 安全测试')
                : category === 'tool'
                  ? tr('Tool Security Testing', '工具安全测试')
                  : category === 'platform'
                    ? tr('Platform Security Testing', '平台安全测试')
                    : tr('LLM Model Security Testing', '大模型安全测试');

  const pageDescription =
    category === 'all'
      ? tr(
          'Every task listed under Agent Security Testing in the sidebar—filter by status, search by name, and track runs and results in one place.',
          '侧边栏“智能体安全测试”下的全部任务都在这里，可按状态筛选、按名称搜索，并统一跟踪运行与结果。',
        )
      : isDifyCategory
        ? t('pages.tasks.descriptionDify')
        : category === 'coze'
          ? t('pages.tasks.descriptionCoze')
          : category === 'fastgpt'
            ? t('pages.tasks.descriptionFastgpt')
            : category === 'n8n'
              ? t('pages.tasks.descriptionN8n')
              : category === 'tencent-adp'
                ? t('pages.tasks.descriptionTencentAdp')
                : category === 'mcp'
                ? tr(
                    'MCP-related security testing tasks: execution status, outcomes, and task metadata.',
                    '与 MCP 相关的安全测试任务：执行状态、结果与任务元数据。',
                  )
                : category === 'tool'
                  ? tr(
                      'Tool and plugin security testing tasks: runs, status, and results.',
                      '工具与插件安全测试任务：运行、状态与结果。',
                    )
                  : category === 'platform'
                    ? tr(
                        'Platform and orchestration security testing tasks: runs, status, and results.',
                        '平台与编排相关安全测试任务：运行、状态与结果。',
                      )
                    : tr(
                        'LLM model–focused security testing tasks: runs, status, and results.',
                        '以大模型为重点的安全测试任务：运行、状态与结果。',
                      );

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
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{pageTitle}</h2>
            <p className="text-muted-foreground">{pageDescription}</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder={tr('Search tasks...', '搜索任务...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={tr('Status', '状态')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr('All Status', '全部状态')}</SelectItem>
                <SelectItem value="pending">{tr('Pending', '等待中')}</SelectItem>
                <SelectItem value="running">{tr('Running', '运行中')}</SelectItem>
                <SelectItem value="completed">{tr('Completed', '已完成')}</SelectItem>
                <SelectItem value="failed">{tr('Failed', '失败')}</SelectItem>
                <SelectItem value="canceled">{tr('Canceled', '已取消')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                const s = category as Surface;
                navigate({
                  to: '/tasks/create',
                  search: {
                    surface: s === 'dify' ? 'agent' : s,
                    agentId: undefined,
                  },
                });
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {tr('Create Task', '创建任务')}
            </Button>
          </div>
        </div>

        {category === 'coze' && (
          <div className="text-muted-foreground mt-2 text-sm">
            Showing tasks with <span className="font-medium">targetType = agent</span> and{' '}
            <span className="font-medium">platform_family = coze</span> only.
          </div>
        )}

        {category === 'fastgpt' && (
          <div className="text-muted-foreground mt-2 text-sm">
            Showing tasks with <span className="font-medium">targetType = agent</span> and{' '}
            <span className="font-medium">platform_family = fastgpt</span> only.
          </div>
        )}

        {category === 'n8n' && (
          <div className="text-muted-foreground mt-2 text-sm">
            Showing tasks with <span className="font-medium">targetType = agent</span> and{' '}
            <span className="font-medium">platform_family = n8n</span> only.
          </div>
        )}

        {category === 'tencent-adp' && (
          <div className="text-muted-foreground mt-2 text-sm">
            Showing tasks with <span className="font-medium">targetType = agent</span> and{' '}
            <span className="font-medium">platform_family = tencent-adp</span> only.
          </div>
        )}

        {category !== 'all' &&
          !isDifyCategory &&
          category !== 'coze' &&
          category !== 'fastgpt' &&
          category !== 'n8n' &&
          category !== 'tencent-adp' && (
          <div className="mt-2 text-sm text-muted-foreground">
            This list is filtered by target type (not in the main sidebar).{' '}
            <span className="font-medium">
              {category === 'mcp'
                ? 'MCP'
                : category === 'tool'
                  ? 'Tool'
                  : category === 'platform'
                    ? 'Platform'
                    : 'LLM model'}
            </span>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-4 py-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBatchRun}
              disabled={batchRunMutation.isPending}
            >
              <Play className="mr-2 h-4 w-4" />
              Batch Run
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleBatchDelete}
              disabled={batchDeleteMutation.isPending}
            >
              <X className="mr-2 h-4 w-4" />
              Batch Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
        )}

        {selectedTask && (
          <div className="mt-4 rounded-md border bg-muted/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedTask.name}</h3>
                {selectedTask.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{selectedTask.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Target: <Badge variant="outline">{selectedTask.targetType}</Badge>
                  </span>
                  <span>
                    Testing mode:{' '}
                    <Badge variant="secondary">
                      {formatTestingModeLabel(selectedTask.attackMode)}
                    </Badge>
                  </span>
                  <span>{selectedTask.vulnerabilities.length} vulnerabilities</span>
                  <span>
                    Status: <AttackTaskStatusBadge status={selectedTask.status} />
                  </span>
                  <span>
                    Created{' '}
                    {formatDistanceToNow(new Date(selectedTask.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {/* Simple run log viewer from metadata.runLogs */}
                {Array.isArray((selectedTask.metadata as any)?.runLogs) && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold mb-2">Run Logs</h4>
                    <div className="max-h-40 overflow-y-auto rounded border bg-background">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Level</TableHead>
                            <TableHead>Message</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(selectedTask.metadata as any).runLogs.map((log: any) => (
                            <TableRow key={log.id ?? log.timestamp}>
                              <TableCell className="whitespace-nowrap text-xs">
                                {log.timestamp}
                              </TableCell>
                              <TableCell className="text-xs">
                                <Badge variant="outline">{log.level ?? 'info'}</Badge>
                              </TableCell>
                              <TableCell
                                className="max-w-md text-xs wrap-break-word whitespace-normal"
                                title={getRunLogTableCellTitle(log)}
                              >
                                {formatRunLogTableMessage(log)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate({
                      to: '/tasks',
                      search: {
                        surface: category as Surface,
                        status: selectedStatus as StatusFilter,
                      },
                    })
                  }
                >
                  Clear selection
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={isAllSelected ? true : isIndeterminate ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Task type</TableHead>
                  <TableHead>Target Type</TableHead>
                  <TableHead>Testing Mode</TableHead>
                  <TableHead>Vulnerabilities</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      No tasks found. Create your first attack task to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  tasks.map((task) => {
                    const reportTaskKind = getReportKindForLabels(
                      task.metadata as Record<string, unknown> | undefined,
                    );
                    const reportMenuSub = getGenerateReportMenuDescription(reportTaskKind);
                    return (
                      <TableRow key={task.id}>
                        <TableCell className="w-10">
                          <Checkbox
                            checked={selectedIds.has(task.id)}
                            onCheckedChange={(checked) => toggleOne(task.id, checked === true)}
                            aria-label={`Select ${task.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{task.name}</span>
                            {isRetestedTask(task) ? (
                              <Badge variant="secondary" className="text-[10px]">
                                复测
                              </Badge>
                            ) : null}
                            {getRunSourceLabel(task.metadata as Record<string, unknown>, isZh) ? (
                              <Badge variant="outline" className="text-[10px]">
                                {getRunSourceLabel(task.metadata as Record<string, unknown>, isZh)}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground">
                          {getAttackTaskTypeLabel(task, taskTypes)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{task.targetType}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {formatTestingModeLabel(task.attackMode)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {task.vulnerabilities.length} vulnerabilities
                          </span>
                        </TableCell>
                        <TableCell className="min-w-[140px]">
                          <div className="flex flex-col gap-1">
                            <AttackTaskStatusBadge
                              status={optimisticStatus[task.id] ?? task.status}
                            />
                            {(optimisticStatus[task.id] ?? task.status) === 'running' &&
                              (() => {
                                const rp = parseTaskRunProgress(task.metadata);
                                if (!rp) {
                                  return null;
                                }
                                const pct = Math.min(
                                  100,
                                  Math.round((rp.completed / rp.total) * 100),
                                );
                                return (
                                  <>
                                    <Progress value={pct} className="h-1.5" />
                                    <span className="text-[10px] text-muted-foreground tabular-nums">
                                      {rp.completed}/{rp.total} vulnerabilities
                                    </span>
                                  </>
                                );
                              })()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem asChild>
                                <Link to="/tasks/$taskId" params={{ taskId: task.id }}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to="/tasks/$taskId/edit" params={{ taskId: task.id }}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit Task
                                </Link>
                              </DropdownMenuItem>
                              {(!task.status || task.status === 'pending') && (
                                <DropdownMenuItem
                                  onClick={() => runMutation.mutate({ taskId: task.id })}
                                  disabled={runMutation.isPending}
                                >
                                  <Play className="mr-2 h-4 w-4" />
                                  Run Task
                                </DropdownMenuItem>
                              )}
                              {task.status === 'running' && (
                                <DropdownMenuItem
                                  onClick={() => cancelMutation.mutate(task.id)}
                                  disabled={cancelMutation.isPending}
                                >
                                  <X className="mr-2 h-4 w-4" />
                                  Cancel
                                </DropdownMenuItem>
                              )}
                              {(task.status === 'completed' || task.status === 'failed') && (
                                <DropdownMenuItem asChild>
                                  <Link to="/tasks/$taskId" params={{ taskId: task.id }}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    View Results
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              {(task.status === 'completed' ||
                                task.status === 'failed' ||
                                task.status === 'canceled') && (
                                <DropdownMenuItem
                                  onClick={() => triggerRerunTask(task)}
                                  disabled={runMutation.isPending}
                                >
                                  <Play className="mr-2 h-4 w-4" />
                                  Re-run Task
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link
                                  to="/reports"
                                  search={{ taskId: task.id }}
                                  className="flex w-full items-start gap-2"
                                >
                                  <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug">
                                    <span>{getGenerateReportMenuLabel(reportTaskKind)}</span>
                                    {reportMenuSub ? (
                                      <span className="text-xs font-normal text-muted-foreground">
                                        {reportMenuSub}
                                      </span>
                                    ) : null}
                                  </span>
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link
                                  to="/reports/poc-suite"
                                  search={{ taskId: task.id }}
                                  className="flex w-full items-start gap-2"
                                >
                                  <FileStack className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug">
                                    <span>{getPocSuiteMenuLabel()}</span>
                                  </span>
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  if (
                                    confirm(`Are you sure you want to delete task "${task.name}"?`)
                                  ) {
                                    deleteMutation.mutate(task.id);
                                  }
                                }}
                                disabled={deleteMutation.isPending}
                              >
                                <X className="mr-2 h-4 w-4" />
                                Delete Task
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && (listTotal > 0 || currentPage > 1) && (
          <Pagination
            currentPage={Math.min(currentPage, totalPages)}
            totalPages={totalPages}
            pageSize={pageSize}
            total={listTotal}
            onPageChange={setCurrentPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setCurrentPage(1);
            }}
            itemLabels={{ singular: 'task', plural: 'tasks' }}
            className="pt-2"
          />
        )}
      </Main>
      <Dialog
        open={Boolean(rerunConfigTask)}
        onOpenChange={(open) => {
          if (!open) {
            setRerunConfigTask(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Re-run Task: 重新上传配置文件</DialogTitle>
            <DialogDescription>
              当前任务为配置相关测试。请上传更新后的配置文件后再复测，其他参数保持不变。
            </DialogDescription>
          </DialogHeader>
          {rerunConfigTask ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Task</span>
                  <p className="font-medium">{rerunConfigTask.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium">
                    {getAttackTaskTypeLabel(rerunConfigTask, taskTypes) || '-'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Target</span>
                  <p className="font-medium">{rerunConfigTask.targetType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Testing mode</span>
                  <p className="font-medium">{formatTestingModeLabel(rerunConfigTask.attackMode)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>配置文件（必填）</Label>
                {requiresJsonConfig(rerunConfigTask) ? (
                  <FastGptStep1Upload
                    jsonText={rerunConfigText}
                    setJsonText={setRerunConfigText}
                    fileName={rerunConfigFileName}
                    setFileName={setRerunConfigFileName}
                  />
                ) : (
                  <DifyStep1Upload
                    yamlText={rerunConfigText}
                    setYamlText={setRerunConfigText}
                    fileName={rerunConfigFileName}
                    setFileName={setRerunConfigFileName}
                  />
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRerunConfigTask(null)}>
              取消
            </Button>
            <Button onClick={submitConfigRerun} disabled={runMutation.isPending}>
              提交并复测
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
