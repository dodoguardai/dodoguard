import { useMemo, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ClipboardCheck,
  Eye,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import {
  formatPatrolNextRun,
  mapPatrolStatus,
  mapPatrolStatusFilter,
  type PatrolRow,
} from './patrol-utils';

const STATUS_CHIPS = ['', '待执行', '检测中', '已完成'] as const;

type PatrolTaskListProps = {
  rows: PatrolRow[];
  selectedTaskId?: string | null;
  onSelectRow: (row: PatrolRow) => void;
  onEditRow: (row: PatrolRow) => void;
  onCreateClick: () => void;
  onRefresh?: () => void;
};

export function PatrolTaskList({
  rows,
  selectedTaskId,
  onSelectRow,
  onEditRow,
  onCreateClick,
  onRefresh,
}: PatrolTaskListProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusChip, setStatusChip] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<PatrolRow | null>(null);

  const executeMutation = useMutation({
    mutationFn: (taskId: string) =>
      detectionScanningApi.executeTask(taskId, { mode: 'manual', generateFindings: true }),
    onSuccess: () => {
      toast.success('巡检任务已开始执行');
      onRefresh?.();
    },
    onError: (error: Error) => toast.error(error.message || '执行失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => detectionScanningApi.deleteTask(taskId),
    onSuccess: () => {
      toast.success('巡检任务已删除');
      setDeleteTarget(null);
      onRefresh?.();
    },
    onError: (error: Error) => toast.error(error.message || '删除失败'),
  });

  const handleDelete = (row: PatrolRow) => {
    if (row.task.status === 'running') {
      toast.error('检测中的任务无法删除，请稍后再试');
      return;
    }
    setDeleteTarget(row);
  };

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!mapPatrolStatusFilter(row.task, statusChip)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        row.task.id,
        row.task.name,
        row.asset?.name,
        row.task.assetName,
        row.task.ownerName,
        row.plan.scopeLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, search, statusChip]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const rangeStart = filteredRows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(currentPage * pageSize, filteredRows.length);

  const resetFilters = () => {
    setSearch('');
    setStatusChip('');
    setPage(1);
  };

  return (
    <div className="overflow-hidden rounded-[20px] border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h3 className="text-base font-semibold">周期巡检任务列表</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            对已上线 Agent 按策略执行安全巡检，跟踪风险复发与闭环处置。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onCreateClick}>创建周期巡检任务</Button>
          <Button variant="outline" onClick={resetFilters}>
            重置筛选
          </Button>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="搜索任务 ID / Agent / 巡检计划 / 执行人"
          className="h-11 rounded-[14px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">状态</span>
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip || 'all'}
              type="button"
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-bold',
                statusChip === chip
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-border bg-background text-muted-foreground',
              )}
              onClick={() => {
                setStatusChip(chip);
                setPage(1);
              }}
            >
              {chip || '全部'}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          当前筛选 {filteredRows.length} / {rows.length} 条
        </div>
      </div>

      {pageRows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>任务名称</TableHead>
              <TableHead>被测 Agent</TableHead>
              <TableHead>扫描场景</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>检测结果</TableHead>
              <TableHead>执行人</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => {
              const statusLabel = mapPatrolStatus(row.task);
              const selected = selectedTaskId === row.task.id;
              return (
                <TableRow
                  key={row.task.id}
                  className={cn('cursor-pointer', selected && 'bg-blue-50/60')}
                  onClick={() => onSelectRow(row)}
                >
                  <TableCell>
                    <div className="font-medium">{row.task.name}</div>
                  </TableCell>
                  <TableCell>{row.asset?.name || row.task.assetName || '未关联资产'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-purple-200 text-purple-700">
                      定期巡检
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        statusLabel === '已完成'
                          ? 'border-emerald-200 text-emerald-700'
                          : statusLabel === '检测中'
                            ? 'border-blue-200 text-blue-700'
                            : statusLabel === '待执行'
                              ? 'border-slate-200 text-slate-600'
                              : 'border-orange-200 text-orange-700'
                      }
                    >
                      {statusLabel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={
                          row.openFindings.length
                            ? 'border-orange-200 text-orange-700'
                            : 'border-emerald-200 text-emerald-700'
                        }
                      >
                        开放 {row.openFindings.length}
                      </Badge>
                      <Badge variant="outline">风险 {row.totalRisk}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      下次 {formatPatrolNextRun(row.plan)}
                    </div>
                  </TableCell>
                  <TableCell>{row.task.ownerName || '—'}</TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onSelectRow(row)}>
                          <Eye className="mr-2 h-4 w-4" />
                          查看详情
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={row.task.status === 'running'}
                          onClick={() => onEditRow(row)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => executeMutation.mutate(row.task.id)}
                          disabled={executeMutation.isPending || row.task.status === 'running'}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          重新巡检
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            navigate({
                              to: '/scan/remediation',
                              search: { tab: 'workbench', taskId: undefined, riskId: undefined },
                            })
                          }
                        >
                          <ClipboardCheck className="mr-2 h-4 w-4" />
                          进入风险闭环
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={deleteMutation.isPending || row.task.status === 'running'}
                          onClick={() => handleDelete(row)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          未找到符合条件的巡检任务 · 可调整筛选或{' '}
          <button
            type="button"
            className="font-medium text-primary underline"
            onClick={onCreateClick}
          >
            创建周期巡检任务
          </button>
        </div>
      )}

      {filteredRows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
          <div className="text-xs text-muted-foreground">
            共 {filteredRows.length} 条 · 显示 {rangeStart}-{rangeEnd} · 第 {currentPage}/
            {totalPages} 页
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">每页</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 20, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader className="text-start">
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>删除周期巡检任务？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  将删除巡检任务「
                  <span className="font-medium text-foreground">{deleteTarget?.task.name}</span>
                  」及相关巡检记录，此操作不可恢复。
                </p>
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">
                  若需要保留上线观测审计依据，请先查看详情或导出相关报告。
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTarget || deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.task.id);
                }
              }}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
