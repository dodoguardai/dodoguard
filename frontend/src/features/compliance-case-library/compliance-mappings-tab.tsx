import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { detectionScanningApi } from '@/services/api/detection-scanning'
import type { ComplianceRegulationMapping } from '@/types/entities'
import { parseRegClause } from './compliance-case-form-fields'
import { buildCaseCodeIndex } from './compliance-mapping-utils'
import {
  buildLawCatalogStats,
  COMPLIANCE_BASIS_PRESETS,
  COMPLIANCE_LAW_CATALOG,
  COMPLIANCE_REGULATION_LAWS,
} from './compliance-law-catalog'
import { mapLibrary, MetricCard } from './shared'

const DOMAIN_OPTIONS = ['全部', '合规', '金融', '政务', '个人', '数据'] as const
const RISK_CATEGORY_LABELS: Record<(typeof DOMAIN_OPTIONS)[number], string> = {
  全部: '全部风险类别',
  合规: '合规风险',
  金融: '金融风险',
  政务: '政务风险',
  个人: '个人信息风险',
  数据: '数据风险',
}

type MappingForm = {
  law: string
  article: string
  rule: string
  sourceText: string
  caseIds: string
  libraryId: string
  riskType: string
  status: string
}

const emptyForm: MappingForm = {
  law: '',
  article: '',
  rule: '',
  sourceText: '',
  caseIds: '',
  libraryId: '',
  riskType: '合规风险',
  status: '已映射',
}

type ComplianceMappingsTabProps = {
  initialLaw?: string
}

const CUSTOM_SELECT_VALUE = '__custom__'

function uniqueOptions(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function selectValueFor(value: string, options: string[]): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  return options.includes(trimmed) ? trimmed : CUSTOM_SELECT_VALUE
}

function parseRegClauseLoose(regClause: string): { law: string; article: string } {
  const parsed = parseRegClause(regClause, COMPLIANCE_REGULATION_LAWS)
  if (parsed.law) {
    return parsed
  }
  const trimmed = regClause.trim()
  const lawMatch = trimmed.match(/《[^》]+》/)
  if (lawMatch) {
    return {
      law: lawMatch[0],
      article: trimmed.slice(lawMatch.index! + lawMatch[0].length).trim(),
    }
  }
  if (trimmed.startsWith('GB/T 22239-2019')) {
    return {
      law: 'GB/T 22239-2019 网络安全等级保护基本要求',
      article: trimmed.replace(/^GB\/T 22239-2019\s*/, '').trim(),
    }
  }
  return parsed
}

export function ComplianceMappingsTab({ initialLaw }: ComplianceMappingsTabProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [lawFilter, setLawFilter] = useState(initialLaw || '全部')
  const [domainFilter, setDomainFilter] = useState<(typeof DOMAIN_OPTIONS)[number]>('全部')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ComplianceRegulationMapping | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ComplianceRegulationMapping | null>(null)
  const [form, setForm] = useState<MappingForm>(emptyForm)

  useEffect(() => {
    if (initialLaw) {
      setLawFilter(initialLaw)
    }
  }, [initialLaw])

  const mappingsQuery = useQuery({
    queryKey: ['compliance-mappings', search, lawFilter, domainFilter],
    queryFn: () =>
      detectionScanningApi.listComplianceMappings({
        limit: 100,
        search: search || undefined,
        law: lawFilter === '全部' ? undefined : lawFilter,
        domain: domainFilter === '全部' ? undefined : domainFilter,
      }),
  })

  const catalogMappingsQuery = useQuery({
    queryKey: ['compliance-mappings-catalog', search, domainFilter],
    queryFn: () =>
      detectionScanningApi.listComplianceMappings({
        limit: 100,
        search: search || undefined,
        domain: domainFilter === '全部' ? undefined : domainFilter,
      }),
  })

  const librariesQuery = useQuery({
    queryKey: ['compliance-case-libraries-for-mapping'],
    queryFn: () =>
      detectionScanningApi.listAllCaseLibraries({
        category: 'compliance',
      }),
  })

  const caseIndexQuery = useQuery({
    queryKey: ['compliance-case-code-index'],
    queryFn: async () => {
      const libs = await detectionScanningApi.listAllCaseLibraries({
        category: 'compliance',
      })
      const casesByLibrary: Record<string, Array<{ id: string; caseCode: string }>> = {}
      await Promise.all(
        libs.data.map(async (lib) => {
          const cases = await detectionScanningApi.listTestCases(lib.id)
          casesByLibrary[lib.id] = cases.map((item) => ({
            id: item.id,
            caseCode: item.caseCode,
          }))
        }),
      )
      return buildCaseCodeIndex(libs.data, casesByLibrary)
    },
  })

  const rows = mappingsQuery.data?.data || []
  const catalogRows = catalogMappingsQuery.data?.data || rows
  const libraries = (librariesQuery.data?.data || []).map(mapLibrary)
  const libraryTitleById = useMemo(
    () => Object.fromEntries(libraries.map((lib) => [lib.id, lib.title])),
    [libraries],
  )
  const caseIndex = caseIndexQuery.data || new Map()
  const lawCatalog = buildLawCatalogStats(catalogRows)
  const lawOptions = useMemo(() => {
    const basisLaws = COMPLIANCE_BASIS_PRESETS.map((item) => parseRegClauseLoose(item).law)
    return uniqueOptions([
      ...COMPLIANCE_REGULATION_LAWS,
      ...COMPLIANCE_LAW_CATALOG.map((entry) => entry.law),
      ...basisLaws,
      ...catalogRows.map((row) => row.law),
    ])
  }, [catalogRows])

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        law: form.law.trim(),
        article: form.article.trim(),
        rule: form.rule.trim(),
        sourceText: form.sourceText.trim() || null,
        caseIds: [],
        libraryId: null,
        riskType: form.riskType.trim(),
        status: form.status,
      }
      if (editing) {
        return detectionScanningApi.updateComplianceMapping(editing.id, payload)
      }
      return detectionScanningApi.createComplianceMapping(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['compliance-form-mapping-laws'] })
      setDialogOpen(false)
      setEditing(null)
      setForm(emptyForm)
      toast.success(editing ? '映射已更新' : '映射已创建')
    },
    onError: (error: Error) => toast.error(error.message || '保存失败'),
  })

  const toggleMutation = useMutation({
    mutationFn: (row: ComplianceRegulationMapping) =>
      detectionScanningApi.updateComplianceMapping(row.id, {
        status: row.status === '已映射' ? '待完善' : '已映射',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['compliance-form-mapping-laws'] })
      toast.success('映射状态已更新')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => detectionScanningApi.deleteComplianceMapping(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['compliance-form-mapping-laws'] })
      setDeleteTarget(null)
      toast.success('映射已删除')
    },
  })

  const mappedCount = rows.filter((row) => row.status === '已映射').length
  const caseLinkCount = rows.reduce((sum, row) => sum + (row.caseIds?.length || 0), 0)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(row: ComplianceRegulationMapping) {
    setEditing(row)
    setForm({
      law: row.law,
      article: row.article,
      rule: row.rule,
      sourceText: row.sourceText || '',
      caseIds: (row.caseIds || []).join(', '),
      libraryId: row.libraryId || '',
      riskType: row.riskType,
      status: row.status,
    })
    setDialogOpen(true)
  }

  function resolveLibraryTitle(row: ComplianceRegulationMapping): string {
    if (row.libraryId && libraryTitleById[row.libraryId]) {
      return libraryTitleById[row.libraryId]
    }
    const firstCase = row.caseIds?.[0]
    if (firstCase) {
      const hit = caseIndex.get(firstCase)
      if (hit) {
        return hit.libraryTitle
      }
    }
    return '—'
  }

  function resolveLibraryId(row: ComplianceRegulationMapping): string | null {
    if (row.libraryId) {
      return row.libraryId
    }
    const firstCase = row.caseIds?.[0]
    if (firstCase) {
      return caseIndex.get(firstCase)?.libraryId || null
    }
    return null
  }

  return (
    <div className="grid gap-6">
      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Scale} label="映射规则" value={String(rows.length)} hint="条款 → 用例" />
        <MetricCard icon={Scale} label="已映射" value={String(mappedCount)} hint="可执行" />
        <MetricCard
          icon={Scale}
          label="关联合规用例"
          value={String(caseLinkCount)}
          hint="CMP 样本"
        />
        <MetricCard icon={Scale} label="法规目录" value={String(lawCatalog.length)} hint="部法律法规" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={lawFilter === '全部' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setLawFilter('全部')}
        >
          全部法规
        </Button>
        {lawCatalog.map((entry) => (
          <Button
            key={entry.law}
            variant={lawFilter === entry.law ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLawFilter(entry.law)}
          >
            {entry.law.replace(/^《|》$/g, '').slice(0, 12)}
            {entry.law.length > 14 ? '…' : ''} · {entry.mappedCount}/{entry.catalogCount}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>法规条款映射矩阵</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              按法规名称浏览条款 · 录入条款原文 · 按风险类别关联合规控制库中的 CMP 控制项
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            新增映射
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <Input
              placeholder="搜索法规名称、条款、内容…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="lg:max-w-sm"
            />
            <Select value={domainFilter} onValueChange={(value) => setDomainFilter(value as typeof domainFilter)}>
              <SelectTrigger className="lg:w-44" aria-label="风险类别筛选">
                <SelectValue placeholder="风险类别" />
              </SelectTrigger>
              <SelectContent>
                {DOMAIN_OPTIONS.map((domain) => (
                  <SelectItem key={domain} value={domain}>
                    {RISK_CATEGORY_LABELS[domain]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[900px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">法律法规</TableHead>
                  <TableHead className="w-[190px]">条款</TableHead>
                  <TableHead className="w-[260px]">关联合规库</TableHead>
                  <TableHead className="w-[130px]">风险类型</TableHead>
                  <TableHead className="w-[110px]">状态</TableHead>
                  <TableHead className="w-[170px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const libId = resolveLibraryId(row)
                  const libTitle = resolveLibraryTitle(row)
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="truncate font-medium">{row.law}</TableCell>
                      <TableCell>
                        <div className="truncate">{row.article}</div>
                        {row.sourceText ? (
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {row.sourceText}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {libId ? (
                          <Link
	                            to="/scan/compliance-cases/$libraryId"
	                            params={{ libraryId: libId }}
	                            search={{
	                              tab: 'libraries',
	                              domain: 'all',
	                              highlightCase: undefined,
	                              law: undefined,
	                            }}
	                            className="block truncate text-sm text-primary hover:underline"
	                          >
                            {libTitle}
                          </Link>
                        ) : (
                          <span className="block truncate">{libTitle}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="truncate">{row.riskType}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.status === '已映射'
                              ? 'border-emerald-200 text-emerald-700'
                              : 'border-amber-200 text-amber-700'
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                            编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleMutation.mutate(row)}
                          >
                            {row.status === '已映射' ? '停用' : '启用'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(row)}
                          >
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!mappingsQuery.isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      暂无映射 · 点击「新增映射」录入法规条款
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑法规映射' : '新增法规映射'}</DialogTitle>
            <DialogDescription>录入法规条款与关联 CMP 控制项编号</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!form.law.trim() || !form.article.trim()) {
                toast.error('请选择法律法规和条款')
                return
              }
              saveMutation.mutate()
            }}
          >
            <div className="grid gap-2">
              <Label>法律法规</Label>
              <Select
                value={selectValueFor(form.law, lawOptions)}
                onValueChange={(value) => {
                  if (value === CUSTOM_SELECT_VALUE) {
                    setForm((prev) => ({ ...prev, law: '' }))
                    return
                  }
                  setForm((prev) => ({ ...prev, law: value }))
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择法律法规" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {lawOptions.map((law) => (
                    <SelectItem key={law} value={law}>
                      {law}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_SELECT_VALUE}>自定义…</SelectItem>
                </SelectContent>
              </Select>
              {selectValueFor(form.law, lawOptions) === CUSTOM_SELECT_VALUE || !form.law ? (
                <Input
                  value={form.law}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, law: event.target.value }))
                  }
                  placeholder="输入法律法规名称，例如 《个人信息保护法》"
                />
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>条款</Label>
              <Input
                value={form.article}
                onChange={(event) => setForm((prev) => ({ ...prev, article: event.target.value }))}
                placeholder="输入条款，例如 第二十八条、第五十一条"
              />
            </div>
            <div className="grid gap-2">
              <Label>内容</Label>
              <Textarea
                rows={4}
                value={form.sourceText}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sourceText: event.target.value }))
                }
                placeholder="录入条款内容或摘要"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>类型</Label>
                <Input
                  value={form.riskType}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, riskType: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="已映射">已映射</SelectItem>
                    <SelectItem value="待完善">待完善</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? '保存中' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除法规映射？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「{deleteTarget?.law || '该法规'} · {deleteTarget?.article || '该条款'}」的映射关系，
              关联的合规控制库和用例不会被删除。此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id)
                }
              }}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
