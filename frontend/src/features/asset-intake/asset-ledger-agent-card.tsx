import type { ReactNode } from 'react'
import type { AgentAsset } from '@/types/entities'
import {
  CalendarClock,
  ClipboardCheck,
  Eye,
  GitPullRequestArrow,
  MoreHorizontal,
  Pencil,
  Radar,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const agentTypeIcons: Record<string, string> = {
  qa: '💬',
  task: '📋',
  tool: '🔧',
  workflow: '⚙',
  multi_agent: '🤝',
  问答型: '💬',
  任务型: '📋',
  工具型: '🔧',
  流程型: '⚙',
  多智能体型: '🤝',
}

function countComponents(asset: AgentAsset) {
  return (asset.components || []).reduce<Record<string, number>>(
    (acc, component) => {
      acc[component.componentType] = (acc[component.componentType] || 0) + 1
      return acc
    },
    {}
  )
}

function hasMemoryCapability(asset: AgentAsset) {
  const metadata = asset.metadata || {}
  if (
    metadata.hasMemory === true ||
    metadata.memoryEnabled === true ||
    metadata.memory === true
  ) {
    return true
  }
  const textKeys = ['memory', 'hasMemory', 'memoryType', 'memoryMode']
  for (const key of textKeys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim() && value !== 'false') {
      return true
    }
  }
  return (asset.components || []).some((component) =>
    /memory|记忆/i.test(component.componentType || component.componentName || '')
  )
}

function capabilityChips(asset: AgentAsset): string[] {
  const counts = countComponents(asset)
  const chips: string[] = []
  if (counts.tool) {
    chips.push(`工具 ${counts.tool}`)
  }
  if (counts.skill) {
    chips.push(`Skill ${counts.skill}`)
  }
  if (counts.mcp) {
    chips.push('MCP')
  }
  if (counts.knowledge_base) {
    chips.push('知识库')
  }
  if (hasMemoryCapability(asset)) {
    chips.push('记忆')
  }
  if (asset.agentType === 'multi_agent' || asset.agentType === '多智能体型') {
    chips.push('多 Agent')
  }
  return chips
}

export type AssetLedgerRowActionsProps = {
  asset: AgentAsset
  riskOptions: ReadonlyArray<readonly [string, string]>
  admissionOptions: ReadonlyArray<readonly [string, string]>
  runtimeOptions: ReadonlyArray<readonly [string, string]>
  onCreatePeriodic: (asset: AgentAsset) => void
  onCreateTechnical: (asset: AgentAsset) => void
  onCreateCompliance: (asset: AgentAsset) => void
  onGoRemediation: () => void
  onOpenProfile: (asset: AgentAsset) => void
  onUpdateRiskLevel: (asset: AgentAsset, riskLevel: string) => void
  onUpdateAdmission: (asset: AgentAsset, admissionStatus: string) => void
  onUpdateRuntime: (asset: AgentAsset, runtimeStatus: string) => void
  onEdit: (asset: AgentAsset) => void
  onDelete: (asset: AgentAsset) => void
}

export function AssetLedgerRowActions({
  asset,
  riskOptions,
  admissionOptions,
  runtimeOptions,
  onCreatePeriodic,
  onCreateTechnical,
  onCreateCompliance,
  onGoRemediation,
  onOpenProfile,
  onUpdateRiskLevel,
  onUpdateAdmission,
  onUpdateRuntime,
  onEdit,
  onDelete,
}: AssetLedgerRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          aria-label={`${asset.name}操作`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-56'
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel>操作</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onCreatePeriodic(asset)}>
          <CalendarClock className='h-4 w-4' />
          创建周期巡检计划
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCreateTechnical(asset)}>
          <ScanSearch className='h-4 w-4' />
          创建对话风险检测
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCreateCompliance(asset)}>
          <ClipboardCheck className='h-4 w-4' />
          创建合规检测
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onGoRemediation}>
          <GitPullRequestArrow className='h-4 w-4' />
          去整改工作台
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenProfile(asset)}>
          <Eye className='h-4 w-4' />
          风险画像
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ShieldAlert className='mr-2 h-4 w-4' />
            调整风险等级
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={asset.riskLevel}
              onValueChange={(value) => onUpdateRiskLevel(asset, value)}
            >
              {riskOptions.map(([value, label]) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ShieldCheck className='mr-2 h-4 w-4' />
            调整放行结论
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={asset.admissionStatus}
              onValueChange={(value) => onUpdateAdmission(asset, value)}
            >
              {admissionOptions.map(([value, label]) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Radar className='mr-2 h-4 w-4' />
            调整运行状态
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={asset.runtimeStatus}
              onValueChange={(value) => onUpdateRuntime(asset, value)}
            >
              {runtimeOptions.map(([value, label]) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEdit(asset)}>
          <Pencil className='h-4 w-4' />
          编辑基础信息
        </DropdownMenuItem>
        <DropdownMenuItem
          variant='destructive'
          onClick={() => onDelete(asset)}
        >
          <Trash2 className='h-4 w-4' />
          删除智能体
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type AssetLedgerAgentCardProps = {
  asset: AgentAsset
  selected?: boolean
  onSelect: () => void
  openRiskCount: number
  admissionLabel: string
  admissionClassName?: string
  runtimeLabel: string
  riskLabel: string
  riskClassName?: string
  environmentLabel: string
  department: string
  scene: string
  platformToneClassName?: string
  actionsMenu: ReactNode
}

export function AssetLedgerAgentCard({
  asset,
  selected = false,
  onSelect,
  openRiskCount,
  admissionLabel,
  admissionClassName,
  runtimeLabel,
  riskLabel,
  riskClassName,
  environmentLabel,
  department,
  scene,
  platformToneClassName,
  actionsMenu,
}: AssetLedgerAgentCardProps) {
  const intro = (asset.functionIntro || '').trim() || '暂无功能简介'
  const chips = capabilityChips(asset)
  const icon = agentTypeIcons[asset.agentType] || '🤖'
  const isOffline = asset.runtimeStatus === 'offline'
  const admissionDone =
    asset.admissionStatus === 'passed' ||
    asset.admissionStatus === 'conditional_passed'

  return (
    <article
      role='button'
      tabIndex={0}
      aria-label={asset.name}
      className={cn(
        'flex cursor-pointer flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-colors',
        'hover:border-primary/40 hover:bg-muted/20',
        selected &&
          'border-primary bg-primary/5 shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]'
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <div className='mb-2.5 flex items-start gap-3'>
        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl'>
          {icon}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-start justify-between gap-2'>
            <h4 className='min-w-0 flex-1 break-words text-[15px] leading-snug font-semibold'>
              {asset.name}
            </h4>
            <div
              className='flex max-w-[52%] shrink-0 flex-wrap items-center justify-end gap-1.5'
              onClick={(event) => event.stopPropagation()}
            >
              <Badge
                className={cn('shadow-none', platformToneClassName)}
                variant='outline'
              >
                {asset.platformFamily || '—'}
              </Badge>
              <Badge className={riskClassName || ''} variant='secondary'>
                {riskLabel}
              </Badge>
              {actionsMenu}
            </div>
          </div>
          {(asset.tags || []).includes('新登记') ? (
            <div className='mt-1.5'>
              <Badge
                className='bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                variant='secondary'
              >
                新登记
              </Badge>
            </div>
          ) : null}
        </div>
      </div>

      <p className='mb-3 line-clamp-2 min-h-[2.55em] text-xs leading-relaxed text-muted-foreground'>
        {intro}
      </p>

      <div className='mb-2.5 grid grid-cols-3 gap-2 border-b pb-2.5'>
        <div className='flex items-center justify-center rounded-[10px] border bg-muted/30 px-1.5 py-2 text-center'>
          <Badge
            className={cn('text-[11px] font-bold', admissionClassName)}
            variant='secondary'
          >
            <span
              className={cn(
                'mr-1 inline-block h-1.5 w-1.5 rounded-full',
                admissionDone ? 'bg-emerald-500' : 'bg-current opacity-60'
              )}
            />
            {admissionLabel}
          </Badge>
        </div>
        <div
          className={cn(
            'rounded-[10px] border bg-muted/30 px-2 py-1.5 text-center',
            openRiskCount > 0 && 'border-amber-200 dark:border-amber-900'
          )}
        >
          <span
            className={cn(
              'mb-0.5 block text-[10px] font-bold text-muted-foreground',
              openRiskCount > 0 && 'text-amber-700 dark:text-amber-300'
            )}
          >
            未关闭风险
          </span>
          <b
            className={cn(
              'block truncate text-[13px] font-extrabold',
              openRiskCount > 0 && 'text-amber-700 dark:text-amber-300'
            )}
          >
            {openRiskCount}
          </b>
        </div>
        <div
          className={cn(
            'rounded-[10px] border bg-muted/30 px-2 py-1.5 text-center',
            isOffline && 'border-amber-200 dark:border-amber-900'
          )}
        >
          <span
            className={cn(
              'mb-0.5 block text-[10px] font-bold text-muted-foreground',
              isOffline && 'text-amber-700 dark:text-amber-300'
            )}
          >
            运行状态
          </span>
          <b
            className={cn(
              'block truncate text-[13px] font-extrabold',
              isOffline && 'text-amber-700 dark:text-amber-300'
            )}
          >
            {runtimeLabel}
          </b>
        </div>
      </div>

      <div className='mb-2.5 truncate text-xs text-muted-foreground'>
        {department || '未设置'} · {environmentLabel} · {scene || '—'}
      </div>

      {chips.length > 0 || asset.sensitiveData ? (
        <div className='mt-auto flex flex-wrap gap-1.5 pt-0.5'>
          {chips.map((chip) => (
            <span
              key={chip}
              className='whitespace-nowrap rounded-full border bg-muted/50 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground'
            >
              {chip}
            </span>
          ))}
          {asset.sensitiveData ? (
            <Badge
              className='bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              variant='secondary'
            >
              涉敏
            </Badge>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
