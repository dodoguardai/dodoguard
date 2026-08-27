import { useNavigate } from '@tanstack/react-router';
import { FileText, MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RiskBadge, type MappedTechnicalLibrary } from './shared';
type TechnicalCaseLibraryCardProps = {
  lib: MappedTechnicalLibrary;
  currentDomain: string;
  onToggleEnabled: () => void;
  onEdit: () => void;
  onDelete: () => void;
  togglePending?: boolean;
};

export function TechnicalCaseLibraryCard({
  lib,
  currentDomain,
  onToggleEnabled,
  onEdit,
  onDelete,
  togglePending,
}: TechnicalCaseLibraryCardProps) {
  const navigate = useNavigate();
  const primaryStandard = lib.tag || lib.standards[0] || 'OWASP ASI';

  const openDetail = () => {
    navigate({
      to: '/scan/security-cases/$libraryId',
      params: { libraryId: lib.id },
      search: { domain: currentDomain, highlightCase: undefined },
    });
  };

  return (
    <Card
      className="flex min-h-[228px] cursor-pointer flex-col gap-0 rounded-[14px] py-0 transition-colors hover:border-border/80 hover:shadow-md"
      onClick={openDetail}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetail();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-2 px-[18px] pt-[18px]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] bg-muted text-lg">
            {lib.icon}
          </span>
          <Badge variant="secondary" className="max-w-[120px] truncate text-[11px] font-normal">
            {primaryStandard}
          </Badge>
        </div>
        <div
          className="shrink-0"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem
                onSelect={() => {
                  openDetail();
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                维护样本
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  onEdit();
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={togglePending}
                onSelect={() => {
                  onToggleEnabled();
                }}
              >
                {lib.enabled ? (
                  <PowerOff className="mr-2 h-4 w-4" />
                ) : (
                  <Power className="mr-2 h-4 w-4" />
                )}
                {lib.enabled ? '关闭' : '启用'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  onDelete();
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-[18px] pb-4 pt-3">
        <div className="flex items-start gap-2">
          <h3 className="text-[15px] font-bold leading-snug">{lib.title}</h3>
          <RiskBadge level={lib.level} />
        </div>
        <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-relaxed text-muted-foreground">
          {lib.description}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              lib.enabled
                ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                : 'text-muted-foreground'
            }
          >
            {lib.enabled ? '已启用' : '未启用'}
          </Badge>
          <span className="text-xs text-muted-foreground">{lib.cases} 条用例</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{lib.method}</span>
        </div>
      </div>
    </Card>
  );
}
