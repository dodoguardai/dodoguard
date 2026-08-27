import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { DetectionRiskLevel, SecurityCaseLibrary } from '@/types/entities'

export type RiskLevel = DetectionRiskLevel
export type CaseStatus = 'published' | 'reviewing' | 'draft'
export type SampleType = 'single' | 'multi_turn' | 'file_input' | 'file_output'

export const COMPLIANCE_DOMAINS = [
  '通用合规',
  '金融合规',
  '政务/国企',
  '个人信息',
  '数据安全',
  '行业模板',
] as const

export const COMPLIANCE_CONTROL_TYPES = [
  '敏感信息保护',
  '用户授权',
  '高风险操作',
  '数据最小化',
  '数据分类分级',
  '数据出境',
  '重要数据保护',
  '金融销售合规',
  '政务数据边界',
  '个人信息处理',
  '行业模板',
] as const

export const COMPLIANCE_SOURCE_TAGS = [
  '个保法',
  '数安法',
  '等保2.0',
  '证监会',
  '政务数据',
  '行业模板',
] as const

export const COMPLIANCE_DETECT_METHODS = [
  '对话探测',
  '配置检查',
  '组件扫描',
  '运行时验证',
  '日志审计',
] as const

export const COMPLIANCE_SCOPE_PRESETS = [
  '全部 Agent',
  '对外 Agent',
  '涉敏 Agent',
] as const

export const LEGACY_DETECT_METHOD_MAP: Record<string, string> = {
  'API 自动检测': '对话探测',
  'API+人工复核': '运行时验证',
}

export const COMPLIANCE_STANDARDS_PRESETS = [
  'PIPL 第6条',
  'PIPL 第13-15条',
  'PIPL 第28、51条',
  'PIPL 第47条',
  'PIPL 第51条',
  'DSL 第21条',
  '等保2.0 G3',
  '证监会令第130号',
  '证监会令第175号',
  '国务院令第711号 / 2025年条例',
  '出境评估 v1.0',
  '金融模板 v2.0',
  '政务模板 v1.4',
] as const

export const SAMPLE_TYPE_LABELS: Record<SampleType, string> = {
  single: '单轮',
  multi_turn: '多轮',
  file_input: '输入文件',
  file_output: '输出文件',
}

export const SAMPLE_TYPE_DETAIL_LABELS: Record<SampleType, string> = {
  single: '单轮对话测试',
  multi_turn: '多轮对话测试',
  file_input: '输入文件测试',
  file_output: '输出文件测试',
}

export const CASE_STATUS_TEXT: Record<CaseStatus, string> = {
  published: '启用',
  reviewing: '评审中',
  draft: '草稿',
}

export const riskLevelText: Record<RiskLevel, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
}

export const riskLevelClass: Record<RiskLevel, string> = {
  critical:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300',
  high: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300',
  medium:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
  low: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
}

export type ComplianceLibraryMeta = {
  icon?: string
  tag?: string
  basis?: string
  scope?: string
  category?: string
  lawPdf?: { name: string; size?: number }
  copiedFrom?: string
}

export function readLawPdf(metadata: unknown): { name: string; size?: number } | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined
  const lawPdf = (metadata as Record<string, unknown>).lawPdf
  if (!lawPdf || typeof lawPdf !== 'object') return undefined
  const record = lawPdf as Record<string, unknown>
  if (typeof record.name !== 'string') return undefined
  return {
    name: record.name,
    size: typeof record.size === 'number' ? record.size : undefined,
  }
}

export function readLibraryMeta(metadata: unknown): ComplianceLibraryMeta {
  if (!metadata || typeof metadata !== 'object') return {}
  const m = metadata as Record<string, unknown>
  return {
    icon: typeof m.icon === 'string' ? m.icon : undefined,
    tag: typeof m.tag === 'string' ? m.tag : undefined,
    basis: typeof m.basis === 'string' ? m.basis : undefined,
    scope: typeof m.scope === 'string' ? m.scope : undefined,
    category: typeof m.category === 'string' ? m.category : undefined,
    lawPdf: readLawPdf(metadata),
    copiedFrom: typeof m.copiedFrom === 'string' ? m.copiedFrom : undefined,
  }
}

export function readRegClause(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '—'
  const regClause = (metadata as Record<string, unknown>).regClause
  return typeof regClause === 'string' && regClause.trim() ? regClause : '—'
}

export function mapLibrary(lib: SecurityCaseLibrary) {
  const meta = readLibraryMeta(lib.metadata)
  return {
    id: lib.id,
    libraryKey: lib.libraryKey,
    title: lib.title,
    domain: lib.domain,
    description: lib.description,
    cases: lib.caseCount,
    enabled: lib.enabled,
    level: lib.defaultLevel,
    method: lib.detectMethod,
    standards: lib.standards || [],
    meta,
  }
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header fixed>
        <Search />
        <div className="ml-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className="grid gap-6">{children}</Main>
    </>
  )
}

export function PageHead({
  title,
  desc,
  action,
}: {
  title: string
  desc: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>
      {action}
    </div>
  )
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint: string
}) {
  return (
    <Card className="h-full gap-0 rounded-lg py-0 shadow-sm">
      <CardContent className="flex h-full items-center gap-3 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-muted/60">
          <Icon className="h-5 w-5 text-foreground/70" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold leading-none tracking-tight tabular-nums">
            {value}
          </p>
          <p className="mt-1.5 truncate text-xs text-muted-foreground/80" title={hint}>
            {hint}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <Badge variant="outline" className={riskLevelClass[level]}>
      {riskLevelText[level]}
    </Badge>
  )
}

export function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), pages)
  const start = (safePage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pages,
    total,
    start: total ? start + 1 : 0,
    end: Math.min(start + pageSize, total),
  }
}
