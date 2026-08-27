import {
  Copy,
  Eye,
  FileText,
  Gauge,
  MoreHorizontal,
  Pencil,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { ComplianceScanStatus, ComplianceTaskRow } from './compliance-task-shared';

type ComplianceTaskRowActionsProps = {
  task: ComplianceTaskRow;
  pending?: boolean;
  onDetail: (task: ComplianceTaskRow) => void;
  onRerun: (task: ComplianceTaskRow) => void;
  onCopy: (task: ComplianceTaskRow) => void;
  onEdit: (task: ComplianceTaskRow) => void;
  onReport: (task: ComplianceTaskRow) => void;
  onWatchScan: (task: ComplianceTaskRow) => void;
  onStop: (task: ComplianceTaskRow) => void;
  onDelete: (task: ComplianceTaskRow) => void;
};

function runActionLabel(status: ComplianceScanStatus): string {
  return status === 'pending' ? '运行' : '重新运行';
}

function canRerun(status: ComplianceScanStatus): boolean {
  return (
    status === 'pending' ||
    status === 'reviewing' ||
    status === 'completed' ||
    status === 'blocked' ||
    status === 'canceled'
  );
}

function canEdit(status: ComplianceScanStatus): boolean {
  return status === 'pending' || status === 'reviewing' || status === 'completed';
}

function canReport(status: ComplianceScanStatus): boolean {
  return status === 'reviewing' || status === 'completed' || status === 'blocked';
}

export function ComplianceTaskRowActions({
  task,
  pending = false,
  onDetail,
  onRerun,
  onCopy,
  onEdit,
  onReport,
  onWatchScan,
  onStop,
  onDelete,
}: ComplianceTaskRowActionsProps) {
  return (
    <div className="flex justify-end">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${task.name}操作`} disabled={pending}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>操作</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              onDetail(task);
            }}
          >
            <Eye className="h-4 w-4" />
            详情
          </DropdownMenuItem>
          {task.status === 'running' ? (
            <>
              <DropdownMenuItem onClick={() => onWatchScan(task)}>
                <Gauge className="h-4 w-4" />
                评估 {Math.min(100, task.progress)}%
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={pending}
                onClick={() => onStop(task)}
              >
                <Square className="h-4 w-4" />
                停止
              </DropdownMenuItem>
            </>
          ) : (
            <>
              {canRerun(task.status) ? (
                <DropdownMenuItem disabled={pending} onClick={() => onRerun(task)}>
                  <Play className="h-4 w-4" />
                  {runActionLabel(task.status)}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem disabled={pending} onClick={() => onCopy(task)}>
                <Copy className="h-4 w-4" />
                复制
              </DropdownMenuItem>
              {canEdit(task.status) ? (
                <DropdownMenuItem disabled={pending} onClick={() => onEdit(task)}>
                  <Pencil className="h-4 w-4" />
                  编辑
                </DropdownMenuItem>
              ) : null}
              {canReport(task.status) ? (
                <DropdownMenuItem onClick={() => onReport(task)}>
                  <FileText className="h-4 w-4" />
                  报告
                </DropdownMenuItem>
              ) : null}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={pending || task.status === 'running'}
            onClick={() => onDelete(task)}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
