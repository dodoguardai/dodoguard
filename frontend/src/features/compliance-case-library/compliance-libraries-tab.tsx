import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, Library, ListChecks, Plus, Scale, X } from 'lucide-react'
import { toast } from 'sonner'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { detectionScanningApi } from '@/services/api/detection-scanning'
import type { SecurityCaseLibrary as ApiSecurityCaseLibrary } from '@/types/entities'
import { ComplianceAiExpandDialog } from './compliance-ai-expand-dialog'
import { copyComplianceTemplateLibrary } from './compliance-copy-template'
import { addCustomDomain, loadCustomDomains, removeCustomDomain } from './compliance-custom-domains'
import { ComplianceLibraryCard } from './compliance-library-card'
import {
  buildLibraryPayload,
  ComplianceLibraryFormDialog,
} from './compliance-library-form-dialog'
import { countMappingsForLibrary } from './compliance-mapping-utils'
import {
  COMPLIANCE_DOMAINS,
  mapLibrary,
  MetricCard,
  paginate,
} from './shared'

type LibrariesTabProps = {
  initialDomain?: string
  mappingCount?: number
}

export function ComplianceLibrariesTab({
  initialDomain = 'all',
  mappingCount = 0,
}: LibrariesTabProps) {
  const queryClient = useQueryClient()
  const [domain, setDomain] = useState(initialDomain)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [createDefaultDomain, setCreateDefaultDomain] = useState<string | undefined>()
  const [editLibrary, setEditLibrary] = useState<ApiSecurityCaseLibrary | null>(null)
  const [aiExpandLib, setAiExpandLib] = useState<ReturnType<typeof mapLibrary> | null>(null)
  const [addDomainOpen, setAddDomainOpen] = useState(false)
  const [newDomainForm, setNewDomainForm] = useState({ label: '', icon: '📁', description: '' })
  const [domainsExpanded, setDomainsExpanded] = useState(false)
  const [customDomains, setCustomDomains] = useState(loadCustomDomains)
  const [copyTemplateOpen, setCopyTemplateOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ReturnType<typeof mapLibrary> | null>(null)
  const [deleteDomainTarget, setDeleteDomainTarget] = useState<
    (typeof customDomains)[number] | null
  >(null)

  useEffect(() => {
    setDomain(initialDomain)
  }, [initialDomain])

  const caseLibrariesQuery = useQuery({
    queryKey: ['compliance-case-libraries', domain, search],
    queryFn: () =>
      detectionScanningApi.listAllCaseLibraries({
        category: 'compliance',
        domain: domain === 'all' ? undefined : domain,
        search: search || undefined,
      }),
  })

  const mappingsQuery = useQuery({
    queryKey: ['compliance-mappings-count'],
    queryFn: () => detectionScanningApi.listComplianceMappings({ limit: 100 }),
  })

  const caseCodesQuery = useQuery({
    queryKey: ['compliance-library-case-codes'],
    queryFn: async () => {
      const libs = await detectionScanningApi.listAllCaseLibraries({
        category: 'compliance',
      })
      const entries = await Promise.all(
        libs.data.map(async (lib) => {
          const cases = await detectionScanningApi.listTestCases(lib.id)
          return { libraryId: lib.id, caseCodes: cases.map((item) => item.caseCode) }
        }),
      )
      return Object.fromEntries(entries.map((entry) => [entry.libraryId, entry.caseCodes]))
    },
  })

  const createMutation = useMutation({
    mutationFn: (form: Parameters<typeof buildLibraryPayload>[0]) =>
      detectionScanningApi.createCaseLibrary(buildLibraryPayload(form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-case-libraries'] })
      setCreateOpen(false)
      toast.success('合规控制库已创建')
    },
    onError: (error: Error) => toast.error(error.message || '创建失败'),
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      form,
    }: {
      id: string
      form: Parameters<typeof buildLibraryPayload>[0]
    }) => detectionScanningApi.updateCaseLibrary(id, buildLibraryPayload(form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-case-libraries'] })
      setEditLibrary(null)
      toast.success('控制库已更新')
    },
    onError: (error: Error) => toast.error(error.message || '更新失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => detectionScanningApi.deleteCaseLibrary(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-case-libraries'] })
      setDeleteTarget(null)
      toast.success('控制库已删除')
    },
    onError: (error: Error) => toast.error(error.message || '删除失败'),
  })

  const toggleMutation = useMutation({
    mutationFn: (lib: ReturnType<typeof mapLibrary>) =>
      detectionScanningApi.updateCaseLibrary(lib.id, { enabled: !lib.enabled }),
    onSuccess: (_data, lib) => {
      queryClient.invalidateQueries({ queryKey: ['compliance-case-libraries'] })
      toast.success(`已${lib.enabled ? '关闭' : '启用'} ${lib.title}`)
    },
  })

  const copyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const libs = caseLibrariesQuery.data?.data || []
      const template = libs.find((item) => item.id === templateId)
      if (!template) throw new Error('模板库不存在')
      const cases = await detectionScanningApi.listTestCases(templateId)
      return copyComplianceTemplateLibrary(template, cases)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-case-libraries'] })
      setCopyTemplateOpen(false)
      setSelectedTemplateId('')
      toast.success('行业模板已复制到企业库')
    },
    onError: (error: Error) => toast.error(error.message || '复制失败'),
  })

  const apiRows = caseLibrariesQuery.data?.data || []
  const allRows = apiRows.map((lib: ApiSecurityCaseLibrary) => mapLibrary(lib))
  const mappings = mappingsQuery.data?.data || []
  const caseCodesByLibrary = caseCodesQuery.data || {}

  const filteredRows = useMemo(() => {
    const kw = search.trim().toLowerCase()
    if (!kw) return allRows
    return allRows.filter(
      (lib) =>
        lib.title.toLowerCase().includes(kw) ||
        lib.description.toLowerCase().includes(kw) ||
        lib.libraryKey.toLowerCase().includes(kw) ||
        lib.meta.tag?.toLowerCase().includes(kw),
    )
  }, [allRows, search])

  const paged = paginate(filteredRows, page, 12)
  const totalCases = allRows.reduce((sum, row) => sum + row.cases, 0)
  const enabledCount = allRows.filter((row) => row.enabled).length
  const effectiveMappingCount = mappingCount || mappingsQuery.data?.total || 0

  const allDomainLabels = [
    ...COMPLIANCE_DOMAINS,
    ...customDomains.map((item) => item.label),
  ]
  const domainTabs = ['all', ...COMPLIANCE_DOMAINS]
  const canToggleDomainTabs = domainTabs.length + customDomains.length + 1 > 4
  const domainOptions = allDomainLabels
  const templateLibraries = allRows.filter(
    (lib) => lib.domain === '行业模板' || lib.libraryKey.startsWith('cmp-tpl-'),
  )

  function handleAddDomain() {
    if (!newDomainForm.label.trim()) {
      toast.error('请输入类别名称')
      return
    }
    const created = addCustomDomain({
      label: newDomainForm.label.trim(),
      icon: newDomainForm.icon.trim() || '📁',
      description: newDomainForm.description.trim() || undefined,
    })
    setCustomDomains((prev) => [...prev, created])
    setAddDomainOpen(false)
    setNewDomainForm({ label: '', icon: '📁', description: '' })
    toast.success(`已新增类别「${created.label}」`)
  }

  function handleRemoveDomain(item: (typeof customDomains)[number]) {
    removeCustomDomain(item.id)
    setCustomDomains(loadCustomDomains())
    if (domain === item.label) {
      setDomain('all')
    }
    toast.success(`已删除类别「${item.label}」`)
  }

  return (
    <div className="grid gap-6">
      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Library}
          label="合规库"
          value={String(allRows.length)}
          hint={`${allDomainLabels.length} 个类别`}
        />
        <MetricCard
          icon={ListChecks}
          label="合规用例"
          value={String(totalCases)}
          hint="单轮 / 多轮 / 输入·输出文件"
        />
        <MetricCard icon={CheckCircle2} label="已启用" value={String(enabledCount)} hint="纳入评估任务" />
        <MetricCard
          icon={Scale}
          label="法规映射"
          value={String(effectiveMappingCount)}
          hint="条款关联"
        />
      </div>

      <div className="flex items-start gap-2">
        <Tabs
          value={domain}
          className="min-w-0 flex-1 gap-0"
          onValueChange={(value) => {
            if (value === '__add_domain__') {
              setAddDomainOpen(true)
              return
            }
            setDomain(value)
            setPage(1)
          }}
        >
          <TabsList
            className={`flex w-full flex-wrap justify-start overflow-hidden transition-all duration-300 ease-out ${
              domainsExpanded
                ? 'h-auto max-h-[28rem] gap-1.5 p-1.5'
                : 'h-9 max-h-9 gap-0 p-[3px]'
            }`}
          >
            {domainTabs.map((item) => (
              <TabsTrigger
                key={item}
                value={item}
                className={domainsExpanded ? 'h-8 flex-none px-3' : 'flex-none'}
              >
                {item === 'all' ? '总览' : item}
              </TabsTrigger>
            ))}
            {customDomains.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.label}
                className={`gap-1.5 pr-2 ${domainsExpanded ? 'h-8 flex-none px-3' : 'flex-none'}`}
              >
                <span>{item.label}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`删除类别 ${item.label}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setDeleteDomainTarget(item)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      setDeleteDomainTarget(item)
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              </TabsTrigger>
            ))}
            <TabsTrigger
              value="__add_domain__"
              className={`flex-none text-primary ${domainsExpanded ? 'h-8 px-3' : ''}`}
            >
              + 新建类别…
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {canToggleDomainTabs ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 border border-border/70 bg-muted px-2 text-muted-foreground shadow-sm transition-colors hover:bg-muted/80 hover:text-foreground"
            aria-expanded={domainsExpanded}
            onClick={() => setDomainsExpanded((prev) => !prev)}
          >
            <span className="sr-only">{domainsExpanded ? '收起分类' : '展开全部分类'}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-300 ease-out ${
                domainsExpanded ? 'rotate-180' : ''
              }`}
            />
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle>{domain === 'all' ? '合规控制库' : `${domain} · 控制库`}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              法规条文、验证规则与合规控制项 · 每个库含检测依据、合规控制项
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {domain === '行业模板' ? (
              <Button variant="outline" size="sm" onClick={() => setCopyTemplateOpen(true)}>
                复制行业模板
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => {
                setCreateDefaultDomain(domain === 'all' ? undefined : domain)
                setCreateOpen(true)
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              新建合规库
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Input
            placeholder="搜索控制库名称、描述、标签…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            className="max-w-md"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {paged.items.map((lib) => {
              const caseCodes = caseCodesByLibrary[lib.id] || []
              const mapCount = countMappingsForLibrary(lib, mappings, caseCodes)
              return (
                <ComplianceLibraryCard
                  key={lib.id}
                  lib={lib}
                  mapCount={mapCount}
                  returnDomain={domain}
                  showDomain={domain === 'all'}
                  togglePending={toggleMutation.isPending}
                  onToggleEnabled={() => toggleMutation.mutate(lib)}
                  onEdit={() => {
                    const raw = apiRows.find((item) => item.id === lib.id)
                    if (raw) setEditLibrary(raw)
                  }}
                  onDelete={() => setDeleteTarget(lib)}
                  onAiExpand={() => setAiExpandLib(lib)}
                  onCopyTemplate={
                    lib.domain === '行业模板'
                      ? () => {
                          const raw = apiRows.find((item) => item.id === lib.id)
                          if (!raw) return
                          copyTemplateMutation.mutate(raw.id)
                        }
                      : undefined
                  }
                />
              )
            })}
            {!caseLibrariesQuery.isLoading && filteredRows.length === 0 && (
              <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                暂无合规控制库，点击「新建合规库」开始维护。
              </div>
            )}
          </div>
          {paged.total > 0 ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                显示 {paged.start}–{paged.end} / {paged.total} 个
                {paged.pages > 1 ? ` · 第 ${paged.page} / ${paged.pages} 页` : ''}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={paged.page <= 1}
                  onClick={() => setPage((prev) => prev - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={paged.page >= paged.pages}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ComplianceLibraryFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        domainOptions={domainOptions}
        defaultDomain={createDefaultDomain}
        onRequestNewDomain={() => setAddDomainOpen(true)}
        pending={createMutation.isPending}
        onSubmit={(form) => createMutation.mutate(form)}
      />

      <ComplianceLibraryFormDialog
        open={Boolean(editLibrary)}
        onOpenChange={(open) => !open && setEditLibrary(null)}
        mode="edit"
        initialLibrary={editLibrary}
        domainOptions={domainOptions}
        onRequestNewDomain={() => setAddDomainOpen(true)}
        pending={updateMutation.isPending}
        onSubmit={(form) => {
          if (!editLibrary) return
          updateMutation.mutate({ id: editLibrary.id, form })
        }}
      />

      {aiExpandLib ? (
        <ComplianceAiExpandDialog
          open={Boolean(aiExpandLib)}
          onOpenChange={(open) => !open && setAiExpandLib(null)}
          libraryId={aiExpandLib.id}
          libraryTitle={aiExpandLib.title}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['compliance-case-libraries'] })
            queryClient.invalidateQueries({ queryKey: ['compliance-library-case-codes'] })
          }}
        />
      ) : null}

      <Dialog open={addDomainOpen} onOpenChange={setAddDomainOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增合规类别</DialogTitle>
            <DialogDescription>自定义类别将保存在本地，并出现在域 Tab 中。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>类别名称</Label>
              <Input
                value={newDomainForm.label}
                onChange={(event) =>
                  setNewDomainForm((prev) => ({ ...prev, label: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>图标</Label>
              <Input
                value={newDomainForm.icon}
                onChange={(event) =>
                  setNewDomainForm((prev) => ({ ...prev, icon: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>说明</Label>
              <Input
                value={newDomainForm.description}
                onChange={(event) =>
                  setNewDomainForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDomainOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddDomain}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copyTemplateOpen} onOpenChange={setCopyTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>复制行业模板</DialogTitle>
            <DialogDescription>选择模板包复制到「通用合规」企业库。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>模板库</Label>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              <option value="">请选择</option>
              {templateLibraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.title}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyTemplateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!selectedTemplateId || copyTemplateMutation.isPending}
              onClick={() => copyTemplateMutation.mutate(selectedTemplateId)}
            >
              {copyTemplateMutation.isPending ? '复制中' : '复制到企业库'}
            </Button>
          </DialogFooter>
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
            <AlertDialogTitle>确认删除合规控制库？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「{deleteTarget?.title || '该控制库'}」及其库内用例。已生成的法规映射和历史评估结果不会自动删除。
              此操作不可恢复。
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

      <AlertDialog
        open={!!deleteDomainTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDomainTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除合规类别？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除本地类别「{deleteDomainTarget?.label || '该类别'}」配置，不会删除该类别下的合规控制库和用例。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault()
                if (deleteDomainTarget) {
                  handleRemoveDomain(deleteDomainTarget)
                  setDeleteDomainTarget(null)
                }
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
