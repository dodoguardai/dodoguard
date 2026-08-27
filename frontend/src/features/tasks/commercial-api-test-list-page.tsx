/**
 * Commercial API test task list.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Plus } from 'lucide-react';

import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  getCommercialApiAgentNameFromMetadata,
  getCommercialApiEndpointFromMetadata,
  isCommercialApiTestTask,
  protocolLabel,
  shortAgentId,
  type CommercialApiProtocol,
} from '@/features/tasks/commercial-api-test-shared';
import { getRunSourceLabel } from '@/features/tasks/run-source-label';
import { tasksApi } from '@/services/api/tasks';
import type { AttackTask } from '@/types/entities';

type StatusFilter = 'all' | AttackTask['status'];

function streamBadge(meta: Record<string, unknown> | undefined, isZh: boolean): string {
  const ca = meta?.commercialApi;
  if (ca && typeof ca === 'object') {
    const mode = String((ca as { streamMode?: unknown }).streamMode ?? '');
    if (mode === 'stream') {
      return isZh ? '流式' : 'Stream';
    }
  }
  const protocol = String((ca as { protocol?: unknown } | undefined)?.protocol ?? '');
  if (protocol === 'api-stream') {
    return isZh ? '流式' : 'Stream';
  }
  return isZh ? '非流式' : 'Blocking';
}

function protocolFromMeta(meta: Record<string, unknown> | undefined): CommercialApiProtocol | null {
  const ca = meta?.commercialApi;
  if (ca && typeof ca === 'object') {
    const p = String((ca as { protocol?: unknown }).protocol ?? '');
    if (p === 'api' || p === 'api-stream' || p === 'langchain') {
      return p;
    }
  }
  return null;
}

export function CommercialApiTestListPage() {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: tasksPage, isLoading } = useQuery({
    queryKey: ['attack-tasks', 'commercial-api-test-list'],
    queryFn: () => tasksApi.list({ limit: 200, offset: 0 }),
    refetchInterval: (query) => {
      const list = (query.state.data?.data ?? []).filter((task) =>
        isCommercialApiTestTask(task.metadata as Record<string, unknown> | undefined),
      );
      const hasRunning = list.some((task) => task.status === 'running');
      return hasRunning ? 2500 : false;
    },
  });

  const commercialTasks = useMemo(() => {
    let list = (tasksPage?.data ?? []).filter((task) =>
      isCommercialApiTestTask(task.metadata as Record<string, unknown> | undefined),
    );
    if (statusFilter !== 'all') {
      list = list.filter((task) => task.status === statusFilter);
    }
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter((task) => {
        const meta = task.metadata as Record<string, unknown> | undefined;
        const endpoint = getCommercialApiEndpointFromMetadata(meta) ?? '';
        const agentName = getCommercialApiAgentNameFromMetadata(meta) ?? '';
        return (
          task.name.toLowerCase().includes(q) ||
          agentName.toLowerCase().includes(q) ||
          endpoint.toLowerCase().includes(q) ||
          String(task.platformFamily ?? '').toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [tasksPage?.data, searchTerm, statusFilter]);

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
            <h2 className="text-2xl font-bold tracking-tight">
              {t('sidebar.item.commercialApiTest')}
            </h2>
            <p className="text-muted-foreground max-w-2xl text-sm">
              {tr(
                'Black-box scans against third-party Custom APIs (OpenAI-compatible or LangServe).',
                '针对第三方 Custom API（OpenAI 兼容或 LangServe）的运行时黑盒安全扫描。',
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder={tr('Search…', '搜索…')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-56"
            />
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-40">
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
            <Button onClick={() => navigate({ to: '/tasks/commercial-api-test/create' })}>
              <Plus className="mr-2 h-4 w-4" />
              {tr('New scan', '新建扫描')}
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Task', '任务')}</TableHead>
                <TableHead>{tr('Target agent', '目标智能体')}</TableHead>
                <TableHead>{tr('Endpoint', '接口')}</TableHead>
                <TableHead>{tr('Protocol', '协议')}</TableHead>
                <TableHead>{tr('Tests', '测试项')}</TableHead>
                <TableHead>{tr('Status', '状态')}</TableHead>
                <TableHead>{tr('Created', '创建时间')}</TableHead>
                <TableHead className="w-[80px] text-right">{tr('Actions', '操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : commercialTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground h-32 text-center">
                    {tr('No commercial API scans yet.', '暂无商业 API 扫描任务。')}
                    <Button
                      variant="link"
                      className="ml-1 h-auto p-0"
                      onClick={() => navigate({ to: '/tasks/commercial-api-test/create' })}
                    >
                      {tr('Create one', '去新建')}
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                commercialTasks.map((task) => {
                  const meta = task.metadata as Record<string, unknown> | undefined;
                  const endpoint =
                    getCommercialApiEndpointFromMetadata(meta) ?? '—';
                  const endpointPreview =
                    endpoint.length > 48 ? `${endpoint.slice(0, 48)}…` : endpoint;
                  const pf = protocolFromMeta(meta);
                  const agentName = getCommercialApiAgentNameFromMetadata(meta);
                  const agentIdFromMeta = String(
                    (meta?.commercialApi as { agentId?: unknown } | undefined)?.agentId ?? '',
                  ).trim();
                  const targetAgentId = String(
                    (task.targetConfig as { agentId?: unknown } | undefined)?.agentId ?? '',
                  ).trim();
                  const displayAgentId = agentIdFromMeta || targetAgentId;
                  const displayAgentName = agentName
                    || (displayAgentId ? `${tr('Agent', '智能体')} ${shortAgentId(displayAgentId)}` : null);
                  return (
                    <TableRow key={task.id}>
                      <TableCell className="max-w-[200px]">
                        <div className="truncate font-medium">{task.name}</div>
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {getRunSourceLabel(meta, isZh) ?? tr('Commercial API', '商业API')}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        {displayAgentName ? (
                          <>
                            <div className="truncate text-sm font-medium">{displayAgentName}</div>
                            {displayAgentId ? (
                              <div className="text-muted-foreground font-mono text-[10px]">
                                {shortAgentId(displayAgentId)}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground max-w-[220px] truncate font-mono text-xs"
                        title={endpoint}
                      >
                        {endpointPreview}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {pf ? (
                            <Badge variant="secondary" className="w-fit text-[10px]">
                              {protocolLabel(pf, isZh)}
                            </Badge>
                          ) : (
                            '—'
                          )}
                          <Badge variant="outline" className="w-fit text-[10px]">
                            {streamBadge(meta, isZh)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {task.vulnerabilities?.length ?? 0}
                      </TableCell>
                      <TableCell>
                        <AttackTaskStatusBadge status={task.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {task.createdAt
                          ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" asChild>
                          <Link
                            to="/tasks/$taskId"
                            params={{ taskId: task.id }}
                            title={tr('View', '查看')}
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
      </Main>
    </>
  );
}
