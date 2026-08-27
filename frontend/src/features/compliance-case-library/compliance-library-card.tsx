import { Link } from '@tanstack/react-router'
import {
  Copy,
  FileText,
  MoreHorizontal,
  Pencil,
  Power,
  PowerOff,
  Scale,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RiskBadge } from './shared'
import { inferLawFromLibrary, type MappedLibrary } from './compliance-mapping-utils'

type ComplianceLibraryCardProps = {
  lib: MappedLibrary
  mapCount: number
  returnDomain?: string
  showDomain?: boolean
  onToggleEnabled: () => void
  onEdit: () => void
  onDelete: () => void
  onAiExpand: () => void
  onCopyTemplate?: () => void
  togglePending?: boolean
}

export function ComplianceLibraryCard({
  lib,
  mapCount,
  returnDomain = 'all',
  showDomain = false,
  onToggleEnabled,
  onEdit,
  onDelete,
  onAiExpand,
  onCopyTemplate,
  togglePending,
}: ComplianceLibraryCardProps) {
  const law = inferLawFromLibrary(lib)
  const isTemplate = lib.domain === '行业模板'

  return (
    <Link
      to="/scan/compliance-cases/$libraryId"
      params={{ libraryId: lib.id }}
      search={{ tab: 'libraries', domain: returnDomain, highlightCase: undefined, law: undefined }}
      className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="flex h-full min-h-[220px] flex-col gap-0 overflow-hidden rounded-lg py-0 transition-colors hover:bg-muted/30">
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xl leading-none" aria-hidden>
              {lib.meta.icon || '📁'}
            </span>
            {lib.meta.tag ? (
              <Badge variant="secondary" className="max-w-[88px] truncate text-[11px] font-normal">
                {lib.meta.tag}
              </Badge>
            ) : null}
          </div>
          <div onClick={(event) => event.preventDefault()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onToggleEnabled} disabled={togglePending}>
                  {lib.enabled ? (
                    <PowerOff className="mr-2 h-4 w-4" />
                  ) : (
                    <Power className="mr-2 h-4 w-4" />
                  )}
                  {lib.enabled ? '关闭库' : '启用库'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  编辑库
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
	                  <Link
	                    to="/scan/compliance-cases"
	                    search={{ tab: 'mappings', domain: 'all', law }}
	                    onClick={(event) => event.stopPropagation()}
	                  >
                    <Scale className="mr-2 h-4 w-4" />
                    法规映射
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAiExpand}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI 扩充
                </DropdownMenuItem>
                {isTemplate && onCopyTemplate ? (
                  <DropdownMenuItem onClick={onCopyTemplate}>
                    <Copy className="mr-2 h-4 w-4" />
                    复制到企业库
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除库
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
          <div className="flex items-start gap-2">
            <h3 className="line-clamp-2 flex-1 text-base font-semibold leading-snug">{lib.title}</h3>
            <RiskBadge level={lib.level} />
          </div>
          <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
            {lib.description}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex shrink-0 items-center gap-1.5 font-medium">
              {lib.enabled ? (
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              ) : null}
              {lib.enabled ? '已启用' : '未启用'}
            </span>
            <span className="text-muted-foreground">{lib.cases} 条用例</span>
            {mapCount > 0 ? (
              <span className="text-muted-foreground">{mapCount} 条映射</span>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {lib.meta.category ? (
              <Badge variant="outline" className="text-xs font-normal">
                {lib.meta.category}
              </Badge>
            ) : null}
            {showDomain && lib.domain ? (
              <Badge variant="secondary" className="text-xs font-normal">
                {lib.domain}
              </Badge>
            ) : null}
            {lib.meta.lawPdf?.name ? (
              <Badge variant="outline" className="gap-1 text-xs font-normal">
                <FileText className="h-3 w-3" />
                PDF
              </Badge>
            ) : null}
          </div>
        </div>
      </Card>
    </Link>
  )
}
