/**
 * Findings Management Page
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Route } from '@/routes/_authenticated/findings/';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { findingsApi } from '@/services/api/findings';
import { agentsApi } from '@/services/api/agents';
import { Pagination } from '@/components/ui/pagination';
import { Eye, Download, AlertCircle, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import type { Finding } from '@/types/entities';

function aggregateFindingsByVuln(baseList: Finding[]): Finding[] {
  const byVuln = new Map<string, Finding>();
  for (const f of baseList) {
    const key = f.vulnerabilityId || f.id;
    const existing = byVuln.get(key);
    if (!existing) {
      byVuln.set(key, f);
    } else {
      const prevTime = new Date(existing.detectedAt).getTime();
      const currTime = new Date(f.detectedAt).getTime();
      if (!Number.isNaN(currTime) && currTime > prevTime) {
        byVuln.set(key, f);
      }
    }
  }
  return Array.from(byVuln.values());
}

export function Findings() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchParams = Route.useSearch();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const riskLevel = searchParams.riskLevel ?? undefined;
  const status = searchParams.status ?? undefined;
  const searchTerm = searchParams.search ?? '';
  const agentId = searchParams.agentId ?? undefined;
  const rawPage = searchParams.page ?? 1;
  const page = typeof rawPage === 'number' && rawPage >= 1 ? rawPage : 1;
  const [pageSize, setPageSize] = useState(20);
  const offset = (page - 1) * pageSize;

  const listParams = useMemo(
    () => ({
      search: searchTerm || undefined,
      riskLevel,
      status,
      limit: pageSize,
      offset,
      agentId,
    }),
    [searchTerm, riskLevel, status, pageSize, offset, agentId],
  );

  const findingsQuery = useQuery({
    queryKey: ['findings', listParams],
    queryFn: () => findingsApi.list(listParams),
    retry: 1,
  });

  const agentsQuery = useQuery({
    queryKey: ['target-agents', 'all'],
    queryFn: () => agentsApi.list({ limit: 100, offset: 0 }),
    staleTime: 60 * 1000,
  });
  const agents = agentsQuery.data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => findingsApi.delete(id),
    onSuccess: (_data, _id) => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      toast.success('Finding deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete finding: ${error?.message ?? 'Unknown error'}`);
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await findingsApi.delete(id);
      }
      return ids;
    },
    onSuccess: (ids) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      toast.success(`Deleted ${ids.length} finding(s)`);
    },
    onError: (error: Error) => {
      toast.error(`Batch delete failed: ${error?.message ?? 'Unknown error'}`);
    },
  });

  const handleDelete = (e: React.MouseEvent, findingId: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this finding?')) return;
    deleteMutation.mutate(findingId);
  };

  const aggregatedAll = useMemo(
    () => aggregateFindingsByVuln(findingsQuery.data?.data ?? []),
    [findingsQuery.data?.data],
  );

  const serverTotal = findingsQuery.data?.total ?? 0;
  const totalForPagination = serverTotal;
  const totalPages = Math.max(1, Math.ceil(totalForPagination / pageSize) || 1);
  const findings = aggregatedAll;
  const isLoading = findingsQuery.isLoading;
  const loadError = findingsQuery.isError
    ? (findingsQuery.error as Error)?.message ?? tr('Failed to load findings.', '加载漏洞发现失败。')
    : null;
  const isEmpty = !isLoading && !loadError && findings.length === 0;

  const isAllSelected = findings.length > 0 && findings.every((f) => selectedIds.has(f.id));
  const isIndeterminate =
    findings.length > 0 && findings.some((f) => selectedIds.has(f.id)) && !isAllSelected;

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (isAllSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(findings.map((f) => f.id)));
  };

  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected finding(s)?`)) return;
    batchDeleteMutation.mutate(ids);
  };

  const setSearchParams = (updates: Partial<typeof searchParams>) => {
    const next = { ...searchParams, ...updates };
    if (!next.riskLevel) delete next.riskLevel;
    if (!next.status) delete next.status;
    if (!next.search) delete next.search;
    if (!next.agentId) delete next.agentId;
    const search =
      next.page === 1
        ? {
            riskLevel: next.riskLevel,
            status: next.status,
            search: next.search,
            agentId: next.agentId,
            page: 1 as const,
          }
        : next;
    navigate({ to: '/findings', search });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- clamp when totals/pageSize change; avoid effect on every searchParams identity change
  useEffect(() => {
    if (findingsQuery.isLoading || totalForPagination <= 0) {
      return;
    }
    const maxPage = Math.max(1, Math.ceil(totalForPagination / pageSize));
    if (page > maxPage) {
      setSearchParams({ page: maxPage });
    }
  }, [findingsQuery.isLoading, totalForPagination, page, pageSize]);

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'default';
      case 'under_review':
        return 'secondary';
      case 'accepted':
        return 'outline';
      case 'fixed':
        return 'default';
      default:
        return 'outline';
    }
  };

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
        {loadError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{tr('Unable to load findings', '无法加载漏洞发现')}</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}
        {isEmpty && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{tr('No findings yet', '暂无漏洞发现')}</AlertTitle>
            <AlertDescription>
              {tr(
                'Run a security testing task first. Findings will appear here after tasks complete.',
                '请先运行安全测试任务，任务完成后发现结果会显示在这里。',
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {tr('Vulnerability Findings', '漏洞发现')}
            </h2>
            <p className="text-muted-foreground">{tr('View and manage discovered vulnerabilities.', '查看并管理已发现漏洞。')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder={tr('Search findings...', '搜索发现...')}
              value={searchTerm}
              onChange={(e) => setSearchParams({ search: e.target.value || undefined, page: 1 })}
              className="w-64"
            />
            <Select
              value={riskLevel ?? 'all'}
              onValueChange={(v) =>
                setSearchParams({
                  riskLevel: v === 'all' ? undefined : (v as Finding['riskLevel']),
                  page: 1,
                })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr('All Severities', '全部严重级别')}</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={status ?? 'all'}
              onValueChange={(v) =>
                setSearchParams({
                  status: v === 'all' ? undefined : (v as Finding['status']),
                  page: 1,
                })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr('All Status', '全部状态')}</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={agentId ?? 'all'}
              onValueChange={(v) =>
                setSearchParams({
                  agentId: v === 'all' ? undefined : v,
                  page: 1,
                })
              }
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr('All Agents', '全部智能体')}</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              {tr('Export', '导出')}
            </Button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-4 py-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleBatchDelete}
              disabled={batchDeleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Batch Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <X className="mr-2 h-4 w-4" />
              Clear selection
            </Button>
          </div>
        )}

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
                <TableHead className="min-w-48">{tr('Vulnerability', '漏洞')}</TableHead>
                <TableHead>{tr('Agent', '智能体')}</TableHead>
                <TableHead>{tr('Risk Level', '风险等级')}</TableHead>
                <TableHead>{tr('Status', '状态')}</TableHead>
                <TableHead>{tr('Confidence', '置信度')}</TableHead>
                <TableHead>{tr('Detected', '发现时间')}</TableHead>
                <TableHead className="text-right">{tr('Actions', '操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-5 w-4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-12" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-8 w-16" />
                    </TableCell>
                  </TableRow>
                ))
              ) : findings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {tr('No findings found.', '暂无漏洞发现。')}
                  </TableCell>
                </TableRow>
              ) : (
                findings.map((finding) => (
                  <TableRow
                    key={finding.id}
                    className="cursor-pointer hover:bg-accent"
                    onClick={() =>
                      navigate({ to: '/findings/$findingId', params: { findingId: finding.id } })
                    }
                  >
                    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(finding.id)}
                        onCheckedChange={(checked) => toggleOne(finding.id, checked === true)}
                        aria-label={`Select ${finding.vulnerabilityName}`}
                      />
                    </TableCell>
                    <TableCell className="min-w-0 max-w-md whitespace-normal font-medium align-top">
                      <span className="inline-flex flex-wrap items-center gap-2 wrap-break-word">
                        {finding.vulnerabilityName}
                        {finding.source === 'finding_records' && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            finding_records
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{finding.agentName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          getRiskLevelColor(finding.riskLevel) as
                            | 'destructive'
                            | 'default'
                            | 'secondary'
                        }
                      >
                        {finding.riskLevel.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          getStatusColor(finding.status) as 'default' | 'secondary' | 'outline'
                        }
                      >
                        {finding.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>{(finding.finalVerdict.confidence * 100).toFixed(0)}%</TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(finding.detectedAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({
                              to: '/findings/$findingId',
                              params: { findingId: finding.id },
                            });
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => handleDelete(e, finding.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && (totalForPagination > 0 || page > 1) && (
          <Pagination
            currentPage={Math.min(page, totalPages)}
            totalPages={totalPages}
            pageSize={pageSize}
            total={totalForPagination}
            onPageChange={(p) => setSearchParams({ page: p })}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setSearchParams({ page: 1 });
            }}
            itemLabels={{ singular: 'finding', plural: 'findings' }}
            className="pt-2"
          />
        )}
      </Main>
    </>
  );
}
