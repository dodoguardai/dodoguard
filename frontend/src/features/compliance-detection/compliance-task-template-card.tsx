import { Eye, MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react';
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
import type { ComplianceTaskTemplate } from '@/types/entities';

type ComplianceTaskTemplateCardProps = {
  template: ComplianceTaskTemplate;
  onUse: (template: ComplianceTaskTemplate) => void;
  onView: (template: ComplianceTaskTemplate) => void;
  onEdit: (template: ComplianceTaskTemplate) => void;
  onDelete: (template: ComplianceTaskTemplate) => void;
  deletePending?: boolean;
};

export function ComplianceTaskTemplateCard({
  template,
  onUse,
  onView,
  onEdit,
  onDelete,
  deletePending,
}: ComplianceTaskTemplateCardProps) {
  return (
    <Card className="flex h-full min-h-[220px] flex-col gap-0 overflow-hidden rounded-lg py-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          {template.icon ? (
            <span className="shrink-0 text-xl leading-none" aria-hidden>
              {template.icon}
            </span>
          ) : null}
          <Badge variant="outline" className="border-violet-200 text-violet-700">
            {template.domain}
          </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              aria-label={`${template.name}操作`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onUse(template)}>
              <Play className="h-4 w-4" />
              使用
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onView(template)}>
              <Eye className="h-4 w-4" />
              查看
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(template)}>
              <Pencil className="h-4 w-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={deletePending}
              onClick={() => onDelete(template)}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug">{template.name}</h3>
        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
          {template.description || template.scope}
        </p>
        {template.tags.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {template.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px] font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 text-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span>{template.libCount} 控制库</span>
          <span>{template.caseCount} 条用例</span>
          <span>使用 {template.usageCount} 次</span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {template.isSystem ? '平台预置' : template.ownerName || '—'}
        </span>
      </div>
    </Card>
  );
}
