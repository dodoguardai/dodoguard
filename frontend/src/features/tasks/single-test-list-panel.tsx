/**
 * Single-test task list panel (reusable without page shell).
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Plus, Search as SearchIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
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
import { AttackTaskStatusBadge } from '@/features/tasks/attack-task-status-badge';
import {
  getMultiRoundTestRoundCount,
  getRunSourceLabel,
  getSingleTestPrompt,
  isMultiRoundTestTask,
  isSingleTestTask,
} from '@/features/tasks/run-source-label';
import { tasksApi } from '@/services/api/tasks';
import type { AttackTask } from '@/types/entities';

type StatusFilter = 'all' | AttackTask['status'];

const DEFAULT_PAGE_SIZE = 10;

type SingleTestListPanelProps = {
  onCreate?: () => void;
};

export function SingleTestListPanel({ onCreate }: SingleTestListPanelProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data: tasksPage, isLoading } = useQuery({
    queryKey: ['attack-tasks', 'single-test-list'],
    queryFn: () => tasksApi.list({ limit: 200, offset: 0 }),
    refetchInterval: (query) => {
      const list = (query.state.data?.data ?? []).filter((task) =>
        isSingleTestTask(task.metadata as Record<string, unknown> | undefined),
      );
      const hasRunning = list.some((task) => task.status === 'running');
      return hasRunning ? 2500 : false;
    },
  });

  const singleTests = useMemo(() => {
    let list = (tasksPage?.data ?? []).filter((task) =>
      isSingleTestTask(task.metadata as Record<string, unknown> | undefined),
    );
    if (statusFilter !== 'all') {
      list = list.filter((task) => task.status === statusFilter);
    }
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter((task) => {
        const prompt =
          getSingleTestPrompt(task.metadata as Record<string, unknown>) ??
          task.description ??
          '';
        return (
          task.name.toLowerCase().includes(q) ||
          prompt.toLowerCase().includes(q) ||
          String(task.platformFamily ?? '').toLowerCase().includes(q)
        );
      });
    }
    return list.sort(
      (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    );
  }, [tasksPage?.data, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(singleTests.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => singleTests.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [singleTests, currentPage, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const openCreate = () => {
    if (onCreate) {
      onCreate();
      return;
    }
    navigate({ to: '/expert-toolbox/dynamic-probe', search: { mode: 'single' } });
  };

  return (
    <div className="mt-10 space-y-6 border-t pt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-tight">{tr('Probe tasks', '探测任务')}</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {tr(
              'Browse completed and in-progress single / multi-round / Excel batch probes.',
              '浏览单次、多轮与 Excel 批量探测任务的进度与结果。',
            )}
          </p>
        </div>
        <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={openCreate}>
          <Plus className="size-4" />
          {tr('New probe', '新建探测')}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <SearchIcon className="text-muted-foreground absolute start-2.5 top-2.5 size-4" />
          <Input
            className="ps-8"
            placeholder={tr('Search by name, instruction, or platform…', '搜索任务名、指令或平台…')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder={tr('Status', '状态')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr('All status', '全部状态')}</SelectItem>
            <SelectItem value="pending">{tr('Pending', '等待中')}</SelectItem>
            <SelectItem value="running">{tr('Running', '运行中')}</SelectItem>
            <SelectItem value="completed">{tr('Completed', '已完成')}</SelectItem>
            <SelectItem value="failed">{tr('Failed', '失败')}</SelectItem>
            <SelectItem value="canceled">{tr('Canceled', '已取消')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[260px] max-w-[360px]">{tr('Task', '任务')}</TableHead>
              <TableHead className="max-w-[160px]">{tr('Instruction', '测试指令')}</TableHead>
              <TableHead>{tr('Platform', '平台')}</TableHead>
              <TableHead>{tr('Status', '状态')}</TableHead>
              <TableHead>{tr('Created', '创建时间')}</TableHead>
              <TableHead className="w-[80px] text-right">{tr('Actions', '操作')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : singleTests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground h-32 text-center">
                  {tr('No probes yet.', '暂无探测任务。')}
                  <Button variant="link" className="ml-1 h-auto p-0" onClick={openCreate}>
                    {tr('Create one', '去新建')}
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((task) => {
                const meta = task.metadata as Record<string, unknown> | undefined;
                const isMultiRound = isMultiRoundTestTask(meta);
                const roundCount = getMultiRoundTestRoundCount(meta);
                const prompt = getSingleTestPrompt(meta) ?? task.description ?? '—';
                const promptPreview = prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt;
                return (
                  <TableRow key={task.id}>
                    <TableCell className="min-w-[260px] max-w-[360px]">
                      <div className="truncate font-medium">{task.name}</div>
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {getRunSourceLabel(meta, isZh) ?? '单次'}
                      </Badge>
                      {isMultiRound && roundCount != null && roundCount > 0 ? (
                        <Badge variant="secondary" className="mt-1 ms-1 text-[10px]">
                          {tr(`${roundCount} rounds`, `${roundCount} 轮`)}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground max-w-[160px] truncate text-sm"
                      title={prompt}
                    >
                      {promptPreview}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{task.platformFamily ?? '—'}</Badge>
                    </TableCell>
                    <TableCell>
                      <AttackTaskStatusBadge status={task.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                      {task.createdAt
                        ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild>
                        <Link
                          to="/expert-toolbox/dynamic-probe"
                          search={{ mode: 'result', taskId: task.id }}
                          title={tr('View result', '查看结果')}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && singleTests.length > 0 ? (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          total={singleTests.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabels={{
            singular: tr('task', '条任务'),
            plural: tr('tasks', '条任务'),
          }}
        />
      ) : null}
    </div>
  );
}
