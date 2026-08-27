import { useCallback, useMemo, useState } from 'react';

import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { AlertTriangle, Eye, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAuditModule } from '@/features/audit/audit-registry';
import { riskVariant } from '@/features/skills-md-audit/utils';
import {
  CAPABILITY_AUDIT_VARIANTS,
  type CapabilityAuditVariantId,
} from 'capability-audit/shared/constants';
import { deleteAuditHistoryItem } from 'capability-audit/shared/history';
import type { SkillsMdAuditData } from '@/services/api/skills-md-audit';

const PAGE_SIZE_COMPACT = 5;
const PAGE_SIZE_PAGE = 20;

type HistoryRow = {
  id: string;
  variantId: CapabilityAuditVariantId;
  auditType: string;
  fileName: string;
  overallRisk: SkillsMdAuditData['overallRisk'];
  createdAt: string;
};

function riskLabelZh(risk: SkillsMdAuditData['overallRisk']): string {
  const map: Record<string, string> = {
    critical: '严重',
    high: '高危',
    medium: '中危',
    low: '通过',
  };
  return map[risk] ?? risk;
}

type ArtifactHistoryPanelProps = {
  isZh: boolean;
  activeVariant: CapabilityAuditVariantId;
  refreshKey: number;
  /** compact = sidebar card; page = full history tab */
  layout?: 'compact' | 'page';
  /** When false, skip the compact card heading (useful under a page section title). */
  showHeading?: boolean;
  onDeleted?: () => void;
  onViewRecord?: (row: HistoryRow) => void;
};

export function ArtifactHistoryPanel({
  isZh,
  activeVariant,
  refreshKey,
  layout = 'compact',
  showHeading = true,
  onDeleted,
  onViewRecord,
}: ArtifactHistoryPanelProps) {
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<HistoryRow | null>(null);
  const pageSize = layout === 'page' ? PAGE_SIZE_PAGE : PAGE_SIZE_COMPACT;

  const rows = useMemo(() => {
    void refreshKey;
    const all: HistoryRow[] = [];
    for (const variant of CAPABILITY_AUDIT_VARIANTS) {
      const mod = getAuditModule(variant.auditType);
      if (!mod?.storage) {
        continue;
      }
      const items = mod.storage.list() as Array<{
        id: string;
        result: SkillsMdAuditData;
        metadata?: { fileName?: string };
        createdAt: string;
      }>;
      for (const item of items) {
        const metadata = (item.metadata ?? {}) as Record<string, unknown>;
        all.push({
          id: item.id,
          variantId: variant.id,
          auditType: variant.auditType,
          fileName: (metadata.fileName as string) || '—',
          overallRisk: item.result.overallRisk ?? 'medium',
          createdAt: item.createdAt,
        });
      }
    }
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [refreshKey]);

  const filtered = useMemo(
    () => rows.filter((r) => r.variantId === activeVariant),
    [rows, activeVariant],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const onConfirmDelete = useCallback(() => {
    if (!deleteTarget) {
      return;
    }
    if (deleteAuditHistoryItem(deleteTarget.auditType, deleteTarget.id)) {
      toast.success(tr('Deleted', '已删除'));
      setDeleteTarget(null);
      onDeleted?.();
    }
  }, [deleteTarget, isZh, onDeleted]);

  return (
    <div
      className={
        layout === 'page'
          ? 'rounded-xl border bg-card p-4 shadow-sm'
          : 'rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60'
      }
    >
      {layout === 'compact' && showHeading ? (
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {tr('Historical test records', '历史测试记录')}
        </h3>
      ) : null}
      <div className="space-y-3">
        {pageRows.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {tr('No records yet', '暂无记录')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Time', '时间')}</TableHead>
                <TableHead>{tr('File', '文件')}</TableHead>
                <TableHead>{tr('Result', '结论')}</TableHead>
                <TableHead className="w-[80px]">{tr('Actions', '操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={`${row.auditType}-${row.id}`}>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                    {formatDistanceToNow(new Date(row.createdAt), {
                      addSuffix: true,
                      locale: isZh ? zhCN : undefined,
                    })}
                  </TableCell>
                  <TableCell
                    className={
                      layout === 'page'
                        ? 'max-w-[320px] truncate text-sm font-medium'
                        : 'max-w-[120px] truncate text-sm font-medium'
                    }
                  >
                    {row.fileName}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={riskVariant(row.overallRisk)}
                      className={
                        row.overallRisk === 'low'
                          ? 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : undefined
                      }
                    >
                      {isZh ? riskLabelZh(row.overallRisk) : row.overallRisk}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={tr('Actions', '操作')}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onViewRecord?.(row)}>
                          <Eye className="size-4" />
                          {tr('View', '查看')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="size-4" />
                          {tr('Delete', '删除')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            {tr(`Total ${filtered.length}`, `共 ${filtered.length} 条`)} ·{' '}
            {tr(`${pageSize} per page`, `每页 ${pageSize}`)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {tr('Prev', '上一页')}
            </Button>
            <span className="rounded bg-neutral-950 px-2 py-0.5 font-medium text-white dark:bg-neutral-100 dark:text-neutral-950">
              {safePage}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {tr('Next', '下一页')}
            </Button>
          </div>
        </div>
      </div>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader className="text-start">
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>
              {tr('Delete SKILLS security audit record?', '删除 SKILLS 安全评估记录？')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  {tr('This will delete the record for ', '将删除记录「')}
                  <span className="font-medium text-foreground">{deleteTarget?.fileName}</span>
                  {tr('. This action cannot be undone.', '」，此操作不可恢复。')}
                </p>
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">
                  {tr(
                    'Export or view the report first if you need to keep audit evidence.',
                    '如需留存审计依据，请先查看或导出报告。',
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr('Cancel', '取消')}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTarget}
              onClick={onConfirmDelete}
            >
              {tr('Confirm delete', '确认删除')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
